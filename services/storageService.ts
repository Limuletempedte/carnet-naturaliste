import { supabase } from '../supabaseClient';
import { Observation } from '../types';
import { sanitizeCachedMediaValue, sanitizeCachedMediaValueWithTracking } from './storageCacheUtils';
import { OfflineAction, OfflineQueueItem, isTempId, mapQueueItemIds, reduceQueue } from './storageQueueUtils';
import { isUuid } from '../utils/uuidUtils';

const LEGACY_QUEUE_KEY = 'offline_sync_queue';
const LEGACY_LOCAL_CACHE_KEY = 'local_observations_cache';
const QUEUE_KEY_PREFIX = 'offline_sync_queue';
const LOCAL_CACHE_KEY_PREFIX = 'local_observations_cache';
const STORAGE_NAMESPACE_ERROR = "Storage namespace absent. Réessayez après authentification.";

export interface ObservationLoadResult {
    observations: Observation[];
    source: 'remote' | 'cache';
    warning?: string;
}

export interface OfflineSyncResult {
    processed: number;
    failed: number;
    failureReasons: string[];
}

interface PersistenceOptions {
    skipCache?: boolean;
}

let storageNamespace: string | null = null;

const scopedKey = (keyPrefix: string, userId: string): string => `${keyPrefix}:${userId}`;
const getQueueScopedKey = (userId: string): string => scopedKey(QUEUE_KEY_PREFIX, userId);
const getCacheScopedKey = (userId: string): string => scopedKey(LOCAL_CACHE_KEY_PREFIX, userId);

const ensureStorageNamespace = (): string => {
    if (!storageNamespace) {
        throw new Error(STORAGE_NAMESPACE_ERROR);
    }
    return storageNamespace;
};

const mapToObservation = (row: any): Observation => ({
    id: row.id,
    speciesName: row.species_name,
    latinName: row.latin_name,
    taxonomicGroup: row.taxonomic_group,
    date: row.date,
    time: row.time,
    count: row.count,
    location: row.location,
    gps: { lat: row.gps_lat, lon: row.gps_lon },
    municipality: row.municipality,
    department: row.department,
    country: row.country,
    altitude: row.altitude,
    comment: row.comment,
    status: row.status,
    atlasCode: row.atlas_code,
    protocol: row.protocol,
    sexe: row.sexe,
    age: row.age,
    observationCondition: row.observation_condition,
    comportement: row.comportement,
    photo: row.photo_url,
    wikipediaImage: row.wikipedia_image,
    sound: row.sound_url
});

const mapToRow = (obs: Observation, userId: string): Record<string, any> => {
    const row: Record<string, any> = {
        user_id: userId,
        species_name: obs.speciesName,
        latin_name: obs.latinName,
        taxonomic_group: obs.taxonomicGroup,
        date: obs.date,
        time: obs.time,
        count: obs.count,
        location: obs.location,
        gps_lat: obs.gps.lat,
        gps_lon: obs.gps.lon,
        municipality: obs.municipality,
        department: obs.department,
        country: obs.country,
        altitude: obs.altitude,
        comment: obs.comment,
        status: obs.status,
        atlas_code: obs.atlasCode,
        protocol: obs.protocol,
        sexe: obs.sexe,
        age: obs.age,
        observation_condition: obs.observationCondition,
        comportement: obs.comportement,
        photo_url: obs.photo,
        wikipedia_image: obs.wikipediaImage,
        sound_url: obs.sound
    };

    if (isUuid(obs.id)) {
        row.id = obs.id;
    }

    return row;
};

const parseJson = <T,>(raw: string | null, fallback: T): T => {
    if (!raw) return fallback;
    try {
        return JSON.parse(raw) as T;
    } catch {
        return fallback;
    }
};

export const setStorageNamespace = (userId: string | null): void => {
    storageNamespace = userId?.trim() || null;
};

export const clearScopedOfflineData = (userId?: string): void => {
    const targetUserId = (userId ?? storageNamespace ?? '').trim();
    if (!targetUserId) return;

    localStorage.removeItem(getQueueScopedKey(targetUserId));
    localStorage.removeItem(getCacheScopedKey(targetUserId));
};

export const migrateLegacyLocalStorageToScoped = (userId: string): void => {
    const normalizedUserId = userId.trim();
    if (!normalizedUserId) return;

    const scopedQueueKey = getQueueScopedKey(normalizedUserId);
    const scopedCacheKey = getCacheScopedKey(normalizedUserId);

    const legacyQueue = parseJson<OfflineQueueItem[]>(localStorage.getItem(LEGACY_QUEUE_KEY), []);
    const legacyCache = parseJson<Observation[]>(localStorage.getItem(LEGACY_LOCAL_CACHE_KEY), []);

    if (!localStorage.getItem(scopedQueueKey) && Array.isArray(legacyQueue) && legacyQueue.length > 0) {
        localStorage.setItem(scopedQueueKey, JSON.stringify(legacyQueue));
    }
    if (!localStorage.getItem(scopedCacheKey) && Array.isArray(legacyCache) && legacyCache.length > 0) {
        localStorage.setItem(scopedCacheKey, JSON.stringify(legacyCache));
    }

    localStorage.removeItem(LEGACY_QUEUE_KEY);
    localStorage.removeItem(LEGACY_LOCAL_CACHE_KEY);
};

const getScopedKeys = (): { queueKey: string; cacheKey: string } => {
    const userId = ensureStorageNamespace();
    return {
        queueKey: getQueueScopedKey(userId),
        cacheKey: getCacheScopedKey(userId)
    };
};

const getQueue = (): OfflineQueueItem[] => {
    const { queueKey } = getScopedKeys();
    const queue = parseJson<OfflineQueueItem[]>(localStorage.getItem(queueKey), []);
    return Array.isArray(queue) ? queue : [];
};

const setQueue = (queue: OfflineQueueItem[]) => {
    const { queueKey } = getScopedKeys();
    localStorage.setItem(queueKey, JSON.stringify(queue));
};

const addToQueue = (action: OfflineAction, payload: Observation | { id: string }) => {
    const queue = getQueue();
    queue.push({
        id: crypto.randomUUID(),
        action,
        payload,
        timestamp: Date.now()
    });
    setQueue(queue);
};

const getLocalCache = (): Observation[] => {
    const { cacheKey } = getScopedKeys();
    return parseJson<Observation[]>(localStorage.getItem(cacheKey), []);
};

const setLocalCache = (observations: Observation[]) => {
    try {
        const { cacheKey } = getScopedKeys();
        let strippedMediaCount = 0;
        const lightweight = observations.map(observation => ({
            ...observation,
            photo: (() => {
                const sanitized = sanitizeCachedMediaValueWithTracking(observation.photo);
                if (sanitized.stripped) strippedMediaCount += 1;
                return sanitized.value;
            })(),
            sound: (() => {
                const sanitized = sanitizeCachedMediaValueWithTracking(observation.sound);
                if (sanitized.stripped) strippedMediaCount += 1;
                return sanitized.value;
            })(),
            wikipediaImage: sanitizeCachedMediaValue(observation.wikipediaImage)
        }));
        localStorage.setItem(cacheKey, JSON.stringify(lightweight));
        if (strippedMediaCount > 0) {
            window.dispatchEvent(new CustomEvent('media-stripped-offline', { detail: { count: strippedMediaCount } }));
        }
    } catch (e) {
        console.warn('localStorage quota exceeded, cache not saved:', e);
        window.dispatchEvent(new CustomEvent('storage-quota-exceeded'));
    }
};

const replaceObservationIdInCache = (oldId: string, newId: string) => {
    const cache = getLocalCache();
    const updated = cache.map(obs => (obs.id === oldId ? { ...obs, id: newId } : obs));
    setLocalCache(updated);
};

const upsertObservationInCache = (observation: Observation) => {
    const cache = getLocalCache();
    const index = cache.findIndex(obs => obs.id === observation.id);
    if (index === -1) {
        setLocalCache([observation, ...cache]);
        return;
    }

    const next = [...cache];
    next[index] = observation;
    setLocalCache(next);
};

export const bulkUpsertObservationsInCache = (newObservations: Observation[]): void => {
    const cache = getLocalCache();
    const mergedById = new Map(cache.map(obs => [obs.id, obs] as [string, Observation]));
    for (const obs of newObservations) {
        mergedById.set(obs.id, obs);
    }
    setLocalCache(Array.from(mergedById.values()));
};

export const getObservations = async (): Promise<ObservationLoadResult> => {
    ensureStorageNamespace();
    const cached = getLocalCache();

    if (!navigator.onLine) {
        return { observations: cached, source: 'cache' };
    }

    try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new Error('Utilisateur non authentifié');

        const { data, error } = await supabase
            .from('observations')
            .select('*')
            .eq('user_id', user.id)
            .order('date', { ascending: false });

        if (error) throw error;

        const observations = data.map(mapToObservation);
        setLocalCache(observations);
        return { observations, source: 'remote' };
    } catch (error: any) {
        console.error('Error fetching observations:', error);
        if (cached.length > 0) {
            return {
                observations: cached,
                source: 'cache',
                warning: error?.message || "Chargement distant impossible, affichage du cache local."
            };
        }
        throw new Error(error?.message || 'Chargement des observations impossible');
    }
};

export const saveObservation = async (
    observation: Observation,
    options: PersistenceOptions = {}
): Promise<Observation> => {
    ensureStorageNamespace();

    const { data: { user } } = await supabase.auth.getUser();
    if (!user && navigator.onLine) throw new Error('User not authenticated');

    const userId = user?.id || 'offline-user';

    if (!navigator.onLine) {
        const offlineObs = { ...observation, id: observation.id || `temp-${Date.now()}` };
        addToQueue('INSERT', offlineObs);
        if (!options.skipCache) {
            upsertObservationInCache(offlineObs);
        }
        return offlineObs;
    }

    const row = mapToRow(observation, userId);

    const { data, error } = await supabase
        .from('observations')
        .insert(row)
        .select()
        .single();

    if (error) {
        console.error('Error saving observation:', error);
        throw new Error(error.message);
    }

    const savedObs = mapToObservation(data);
    if (!options.skipCache) {
        upsertObservationInCache(savedObs);
    }

    return savedObs;
};

export const updateObservation = async (
    observation: Observation,
    options: PersistenceOptions = {}
): Promise<void> => {
    ensureStorageNamespace();

    const { data: { user } } = await supabase.auth.getUser();
    const userId = user?.id || 'offline-user';

    if (!navigator.onLine) {
        addToQueue('UPDATE', observation);
        if (!options.skipCache) {
            upsertObservationInCache(observation);
        }
        return;
    }

    const row = mapToRow(observation, userId);

    const { error } = await supabase
        .from('observations')
        .update(row)
        .eq('id', observation.id)
        .eq('user_id', userId);

    if (error) {
        console.error('Error updating observation:', error);
        throw new Error(error.message);
    }

    if (!options.skipCache) {
        upsertObservationInCache(observation);
    }
};

export const deleteObservation = async (id: string): Promise<void> => {
    ensureStorageNamespace();

    const { data: { user } } = await supabase.auth.getUser();
    const userId = user?.id || 'offline-user';

    if (!navigator.onLine) {
        addToQueue('DELETE', { id });

        const currentCache = getLocalCache();
        const updatedCache = currentCache.filter(obs => obs.id !== id);
        setLocalCache(updatedCache);
        return;
    }

    const { error } = await supabase
        .from('observations')
        .delete()
        .eq('id', id)
        .eq('user_id', userId);

    if (error) {
        console.error('Error deleting observation:', error);
        throw new Error(error.message);
    }

    const currentCache = getLocalCache();
    const updatedCache = currentCache.filter(obs => obs.id !== id);
    setLocalCache(updatedCache);
};



export const uploadPhoto = async (file: Blob): Promise<string> => {
    if (!navigator.onLine) {
        throw new Error("Impossible d'envoyer une photo en mode hors-ligne. Veuillez réessayer une fois connecté.");
    }

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('User not authenticated');

    const fileName = `${user.id}/photos/${Date.now()}-${crypto.randomUUID()}.jpg`;
    const { error: uploadError } = await supabase.storage
        .from('photos')
        .upload(fileName, file, {
            contentType: 'image/jpeg',
            upsert: false
        });

    if (uploadError) {
        console.error('Error uploading photo:', uploadError);
        throw new Error(uploadError.message);
    }

    const { data: { publicUrl } } = supabase.storage
        .from('photos')
        .getPublicUrl(fileName);

    return publicUrl;
};

export const uploadSound = async (file: Blob): Promise<string> => {
    if (!navigator.onLine) {
        throw new Error("Impossible d'envoyer un son en mode hors-ligne. Veuillez réessayer une fois connecté.");
    }

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('User not authenticated');

    const contentType = file.type || 'audio/mpeg';
    const extension = contentType.split('/')[1]?.split(';')[0] || 'mp3';
    const fileName = `${user.id}/sounds/${Date.now()}-${crypto.randomUUID()}.${extension}`;

    const { error: uploadError } = await supabase.storage
        .from('photos')
        .upload(fileName, file, {
            contentType,
            upsert: false
        });

    if (uploadError) {
        console.error('Error uploading sound:', uploadError);
        throw new Error(uploadError.message);
    }

    const { data: { publicUrl } } = supabase.storage
        .from('photos')
        .getPublicUrl(fileName);

    return publicUrl;
};

export const processOfflineQueue = async (): Promise<OfflineSyncResult> => {
    ensureStorageNamespace();

    if (!navigator.onLine) {
        return { processed: 0, failed: 0, failureReasons: [] };
    }

    const queue = getQueue();
    if (queue.length === 0) {
        return { processed: 0, failed: 0, failureReasons: [] };
    }

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
        return {
            processed: queue.length,
            failed: queue.length,
            failureReasons: ['User not authenticated']
        };
    }

    const reducedQueue = reduceQueue(queue);
    const failedItems: OfflineQueueItem[] = [];
    const idMap = new Map<string, string>();
    const failureReasons = new Map<string, number>();

    for (const rawItem of reducedQueue) {
        const item = mapQueueItemIds(rawItem, idMap);

        try {
            if (item.action === 'INSERT') {
                const payload = item.payload as Observation;
                const row = mapToRow(payload, user.id);

                if (isTempId(payload.id)) {
                    const rowWithoutId = { ...row };
                    delete rowWithoutId.id;
                    const { data, error } = await supabase
                        .from('observations')
                        .insert(rowWithoutId)
                        .select('*')
                        .single();

                    if (error) throw error;

                    const created = mapToObservation(data);
                    idMap.set(payload.id, created.id);
                    replaceObservationIdInCache(payload.id, created.id);
                } else {
                    const { error } = await supabase
                        .from('observations')
                        .upsert(row, { onConflict: 'id' });

                    if (error) throw error;
                }
            } else if (item.action === 'UPDATE') {
                const payload = item.payload as Observation;

                if (isTempId(payload.id) && !idMap.has(payload.id)) {
                    failedItems.push(item);
                    continue;
                }

                const row = mapToRow(payload, user.id);
                const { error } = await supabase
                    .from('observations')
                    .update(row)
                    .eq('id', payload.id)
                    .eq('user_id', user.id);

                if (error) throw error;
            } else if (item.action === 'DELETE') {
                const payload = item.payload as { id: string };

                if (isTempId(payload.id) && !idMap.has(payload.id)) {
                    continue;
                }

                const { error } = await supabase
                    .from('observations')
                    .delete()
                    .eq('id', payload.id)
                    .eq('user_id', user.id);

                if (error) throw error;
            }
        } catch (error) {
            console.error('Error processing queue item:', error);
            failedItems.push(mapQueueItemIds(rawItem, idMap));
            const reason = error instanceof Error ? error.message : String(error);
            failureReasons.set(reason, (failureReasons.get(reason) || 0) + 1);
        }
    }

    setQueue(failedItems);

    if (failedItems.length === 0) {
        const { data, error } = await supabase
            .from('observations')
            .select('*')
            .eq('user_id', user.id)
            .order('date', { ascending: false });

        if (!error && data) {
            setLocalCache(data.map(mapToObservation));
        }
    }

    return {
        processed: reducedQueue.length,
        failed: failedItems.length,
        failureReasons: Array.from(failureReasons.entries()).map(([reason, count]) => `${count}x ${reason}`)
    };
};
