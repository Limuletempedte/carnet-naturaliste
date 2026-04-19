import { supabase } from '../supabaseClient';
import { Observation } from '../types';
import { sanitizeCachedMediaValue, sanitizeCachedMediaValueWithTracking } from './storageCacheUtils';
import { OfflineAction, OfflineQueueItem, isTempId, mapQueueItemIds, reduceQueue } from './storageQueueUtils';
import { isUuid, generateUUID } from '../utils/uuidUtils';
import { logger } from '../utils/logger';

const LEGACY_QUEUE_KEY = 'offline_sync_queue';
const LEGACY_LOCAL_CACHE_KEY = 'local_observations_cache';
const QUEUE_KEY_PREFIX = 'offline_sync_queue';
const LOCAL_CACHE_KEY_PREFIX = 'local_observations_cache';
const STORAGE_NAMESPACE_ERROR = "Storage namespace absent. Réessayez après authentification.";
const LOCAL_CACHE_TTL_MS = 90 * 24 * 60 * 60 * 1000; // 90 days
const LOCAL_CACHE_TS_SUFFIX = '_ts';

export interface ObservationLoadResult {
    observations: Observation[];
    source: 'remote' | 'cache';
    warning?: string;
}

export interface SkippedSyncItem {
    id: string;
    action: string;
    reason: string;
}

export interface OfflineSyncResult {
    processed: number;
    failed: number;
    failureReasons: string[];
    skippedItems: SkippedSyncItem[];
}

export interface ProcessOfflineQueueOptions {
    itemIds?: string[];
    onProgress?: (current: number, total: number) => void;
}

interface PersistenceOptions {
    skipCache?: boolean;
}

let storageNamespace: string | null = null;
let processingQueue: Promise<OfflineSyncResult> | null = null;

const UPLOAD_TIMEOUT_MS = 30_000;
const REAUTH_CHECK_INTERVAL = 5;

const extractStoragePath = (publicUrl: string | null, userId: string): string | null => {
    if (!publicUrl || !publicUrl.includes('/storage/v1/object/public/photos/')) return null;
    const marker = '/storage/v1/object/public/photos/';
    const idx = publicUrl.indexOf(marker);
    if (idx === -1) return null;
    const path = publicUrl.substring(idx + marker.length);
    return path.startsWith(userId + '/') ? path : null;
};

const dataUrlToBlob = (dataUrl: string): Blob => {
    const [header, base64] = dataUrl.split(',');
    const mime = header.match(/:(.*?);/)?.[1] || 'application/octet-stream';
    const bytes = atob(base64);
    const arr = new Uint8Array(bytes.length);
    for (let i = 0; i < bytes.length; i++) arr[i] = bytes.charCodeAt(i);
    return new Blob([arr], { type: mime });
};

const withTimeout = <T>(promise: Promise<T>, ms: number, label: string): Promise<T> => {
    let timeoutId: ReturnType<typeof setTimeout>;
    const timeout = new Promise<never>((_, reject) => {
        timeoutId = setTimeout(() => reject(new Error(`${label} : délai dépassé (${ms / 1000}s)`)), ms);
    });
    return Promise.race([promise, timeout]).finally(() => clearTimeout(timeoutId));
};

const scopedKey = (keyPrefix: string, userId: string): string => `${keyPrefix}:${userId}`;
const getQueueScopedKey = (userId: string): string => scopedKey(QUEUE_KEY_PREFIX, userId);
const getCacheScopedKey = (userId: string): string => scopedKey(LOCAL_CACHE_KEY_PREFIX, userId);

const ensureStorageNamespace = (): string => {
    if (!storageNamespace) {
        throw new Error(STORAGE_NAMESPACE_ERROR);
    }
    return storageNamespace;
};

const ONLINE_AUTH_ERROR = 'User not authenticated';

const assertOnlineUserId = (userId?: string): string => {
    if (!navigator.onLine) {
        return userId || 'offline-user';
    }
    if (!userId) {
        throw new Error(ONLINE_AUTH_ERROR);
    }
    return userId;
};

const assertMutationAffectedRows = (count: number | null, action: 'update' | 'delete'): void => {
    if ((count ?? 0) < 1) {
        throw new Error(`Impossible de ${action === 'update' ? 'mettre à jour' : 'supprimer'}: observation introuvable ou accès refusé.`);
    }
};

const COUNT_BREAKDOWN_COLUMNS = ['male_count', 'female_count', 'unidentified_count'] as const;

type SupabaseLikeError = {
    message?: string;
    code?: string;
    details?: string;
    hint?: string;
};

const asSupabaseError = (error: unknown): SupabaseLikeError => {
    if (error && typeof error === 'object') return error as SupabaseLikeError;
    return {};
};

const stripCountBreakdownColumns = (row: Record<string, unknown>): Record<string, unknown> => {
    const next = { ...row };
    for (const key of COUNT_BREAKDOWN_COLUMNS) {
        delete next[key];
    }
    return next;
};

const isMissingCountBreakdownColumnError = (error: unknown): boolean => {
    const err = asSupabaseError(error);
    const combined = `${err.message || ''} ${err.details || ''} ${err.hint || ''}`.toLowerCase();
    const code = String(err.code || '').toUpperCase();
    const mentionsCountColumn = COUNT_BREAKDOWN_COLUMNS.some(column => combined.includes(column));
    if (!mentionsCountColumn) return false;

    return (
        code === '42703' // undefined_column
        || code === 'PGRST204' // column missing in schema cache
        || combined.includes('does not exist')
        || combined.includes('schema cache')
        || combined.includes('could not find')
    );
};

const WEATHER_COLUMN = 'weather_condition';

const stripWeatherColumn = (row: Record<string, unknown>): Record<string, unknown> => {
    const next = { ...row };
    delete next[WEATHER_COLUMN];
    return next;
};

const isMissingWeatherColumnError = (error: unknown): boolean => {
    const err = asSupabaseError(error);
    const combined = `${err.message || ''} ${err.details || ''} ${err.hint || ''}`.toLowerCase();
    const code = String(err.code || '').toUpperCase();
    if (!combined.includes(WEATHER_COLUMN)) return false;
    return (
        code === '42703'
        || code === 'PGRST204'
        || combined.includes('does not exist')
        || combined.includes('schema cache')
        || combined.includes('could not find')
    );
};

const isMissingColumnError = (error: unknown): boolean =>
    isMissingCountBreakdownColumnError(error) || isMissingWeatherColumnError(error);

/**
 * SR-08: detect transient network / server errors that justify falling back
 * to the offline queue instead of throwing (e.g. timeout, 5xx, service unavailable).
 * Business errors (auth, permissions, missing columns, validation) should still throw.
 */
const isRecoverableNetworkError = (error: unknown): boolean => {
    if (!error) return false;
    if (error instanceof DOMException && error.name === 'AbortError') return true;
    if (error instanceof TypeError) {
        const msg = error.message.toLowerCase();
        if (msg.includes('fetch') || msg.includes('network') || msg.includes('failed to fetch')) return true;
    }
    const err = asSupabaseError(error);
    const code = String(err.code || '').toUpperCase();
    // PostgREST / Supabase-specific transient codes
    if (code === 'PGRST301' || code === 'PGRST002' || code === '57P03') return true;
    const maybeStatus = (error as { status?: number }).status;
    if (typeof maybeStatus === 'number' && maybeStatus >= 500 && maybeStatus < 600) return true;
    const msg = (err.message || '').toLowerCase();
    if (msg.includes('timeout') || msg.includes('délai dépassé') || msg.includes('service unavailable')) return true;
    if (msg.includes('network') || msg.includes('fetch failed') || msg.includes('connect')) return true;
    return false;
};

const notifyRecoverableError = (action: 'sauvegarde' | 'mise à jour' | 'suppression') => {
    window.dispatchEvent(new CustomEvent('supabase-recoverable-error', { detail: { action } }));
};

/**
 * Run a Supabase-like operation and retry once with the row stripped of columns
 * that the server complains are missing (PostgREST code 42703 / PGRST204).
 * Preserves the legacy fallback behaviour used when a migration is pending.
 */
async function withColumnFallback<R extends { error: SupabaseLikeError | null }>(
    row: Record<string, unknown>,
    operation: (effectiveRow: Record<string, unknown>) => PromiseLike<R>
): Promise<R> {
    const first = await operation(row);
    if (first.error && isMissingColumnError(first.error)) {
        const strippedRow = stripMissingColumns(row, first.error);
        const strippedColumns = Object.keys(row).filter(k => !(k in strippedRow));
        // SR-13: schema drift visible — retry sans les colonnes manquantes
        logger.warn('[storageService] Migration de schéma manquante — retry sans colonnes:', strippedColumns.join(', '));
        window.dispatchEvent(new CustomEvent('schema-drift-detected', { detail: { columns: strippedColumns } }));
        return await operation(strippedRow);
    }
    return first;
}

const stripMissingColumns = (row: Record<string, unknown>, error: unknown): Record<string, unknown> => {
    let result = row;
    if (isMissingCountBreakdownColumnError(error)) result = stripCountBreakdownColumns(result);
    if (isMissingWeatherColumnError(error)) result = stripWeatherColumn(result);
    return result;
};

interface ObservationRow {
    id: string;
    species_name: string;
    latin_name: string;
    taxonomic_group: Observation['taxonomicGroup'];
    date: string;
    time: string;
    count: number;
    male_count?: number | null;
    female_count?: number | null;
    unidentified_count?: number | null;
    location: string;
    gps_lat: number;
    gps_lon: number;
    municipality: string;
    department: string;
    country: string;
    altitude: number;
    comment: string;
    status: Observation['status'];
    atlas_code: Observation['atlasCode'];
    protocol: Observation['protocol'];
    sexe: Observation['sexe'];
    age: Observation['age'];
    observation_condition: Observation['observationCondition'];
    comportement: Observation['comportement'];
    weather_condition?: string | null;
    photo_url?: string | null;
    wikipedia_image?: string | null;
    sound_url?: string | null;
    habitat?: string | null;
    phenology?: string | null;
    observers?: string[] | null;
    created_at?: string | null;
    updated_at?: string | null;
}

const mapToObservation = (row: ObservationRow): Observation => ({
    id: row.id,
    speciesName: row.species_name,
    latinName: row.latin_name,
    taxonomicGroup: row.taxonomic_group,
    date: row.date,
    time: row.time,
    count: row.count,
    maleCount: row.male_count ?? undefined,
    femaleCount: row.female_count ?? undefined,
    unidentifiedCount: row.unidentified_count ?? undefined,
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
    weather: (row.weather_condition || 'Non renseigné') as Observation['weather'],
    photo: row.photo_url ?? undefined,
    wikipediaImage: row.wikipedia_image ?? undefined,
    sound: row.sound_url ?? undefined,
    createdAt: row.created_at ?? undefined,
    updatedAt: row.updated_at ?? undefined,
    habitat: (row.habitat ?? undefined) as Observation['habitat'],
    phenology: (row.phenology ?? undefined) as Observation['phenology'],
    observers: row.observers && row.observers.length > 0 ? row.observers : undefined,
});

const mapToRow = (obs: Observation, userId: string): Record<string, unknown> => {
    const row: Record<string, unknown> = {
        user_id: userId,
        species_name: obs.speciesName,
        latin_name: obs.latinName,
        taxonomic_group: obs.taxonomicGroup,
        date: obs.date,
        time: obs.time,
        count: obs.count,
        male_count: obs.maleCount ?? null,
        female_count: obs.femaleCount ?? null,
        unidentified_count: obs.unidentifiedCount ?? null,
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
        weather_condition: obs.weather || 'Non renseigné',
        photo_url: obs.photo,
        wikipedia_image: obs.wikipediaImage,
        sound_url: obs.sound,
        habitat: obs.habitat ?? null,
        phenology: obs.phenology ?? null,
        observers: obs.observers && obs.observers.length > 0 ? obs.observers : null
    };

    if (isUuid(obs.id)) {
        row.id = obs.id;
    }

    return row;
};

const parseJson = <T,>(raw: string | null, fallback: T, onCorrupt?: (err: unknown) => void): T => {
    if (!raw) return fallback;
    try {
        return JSON.parse(raw) as T;
    } catch (err) {
        onCorrupt?.(err);
        return fallback;
    }
};

const notifyStorageCorruption = (scope: 'queue' | 'cache' | 'presets') => {
    window.dispatchEvent(new CustomEvent('storage-corruption-detected', { detail: { scope } }));
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

const MAX_QUEUE_ITEM_AGE_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

const getQueue = (): OfflineQueueItem[] => {
    const { queueKey } = getScopedKeys();
    const queue = parseJson<OfflineQueueItem[]>(localStorage.getItem(queueKey), [], (err) => {
        logger.error('[storageService] File d\'attente offline corrompue — données locales perdues:', err);
        notifyStorageCorruption('queue');
    });
    if (!Array.isArray(queue)) return [];
    const now = Date.now();
    return queue.filter(item => {
        if (now - item.timestamp > MAX_QUEUE_ITEM_AGE_MS) {
            logger.warn('[storageService] Item de queue expiré (>30j), supprimé:', item.id);
            return false;
        }
        return true;
    });
};

export const getOfflineQueueSnapshot = (): OfflineQueueItem[] => {
    ensureStorageNamespace();
    return getQueue().sort((a, b) => a.timestamp - b.timestamp);
};

const setQueue = (queue: OfflineQueueItem[]) => {
    const { queueKey } = getScopedKeys();
    try {
        localStorage.setItem(queueKey, JSON.stringify(queue));
    } catch {
        window.dispatchEvent(new CustomEvent('storage-quota-exceeded'));
        throw new Error("File d'attente hors-ligne pleine. Synchronisez vos données avant d'ajouter de nouvelles observations.");
    }
};

const addToQueue = (action: OfflineAction, payload: Observation | { id: string }) => {
    // SI-06: Validate payload before queuing
    if (action === 'INSERT' || action === 'UPDATE') {
        const obs = payload as Observation;
        if (!obs.speciesName?.trim() || !obs.date) {
            logger.warn('[storageService] Payload invalide ignoré (speciesName ou date manquant):', action, payload);
            return;
        }
    } else if (action === 'DELETE') {
        const del = payload as { id: string };
        if (!del.id?.trim()) {
            logger.warn('[storageService] Payload DELETE ignoré (id manquant)');
            return;
        }
    }
    const queue = getQueue();
    queue.push({
        id: generateUUID(),
        action,
        payload,
        timestamp: Date.now()
    });
    setQueue(queue);
};

const getLocalCache = (): Observation[] => {
    const { cacheKey } = getScopedKeys();
    const tsRaw = localStorage.getItem(cacheKey + LOCAL_CACHE_TS_SUFFIX);
    if (tsRaw) {
        const cachedAt = Number(tsRaw);
        if (Date.now() - cachedAt > LOCAL_CACHE_TTL_MS) {
            localStorage.removeItem(cacheKey);
            localStorage.removeItem(cacheKey + LOCAL_CACHE_TS_SUFFIX);
            return [];
        }
    }
    return parseJson<Observation[]>(localStorage.getItem(cacheKey), [], (err) => {
        logger.error('[storageService] Cache local corrompu — données locales perdues:', err);
        notifyStorageCorruption('cache');
    });
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
        localStorage.setItem(cacheKey + LOCAL_CACHE_TS_SUFFIX, String(Date.now()));
        if (strippedMediaCount > 0) {
            window.dispatchEvent(new CustomEvent('media-stripped-offline', { detail: { count: strippedMediaCount } }));
        }
    } catch (e) {
        // SR-11: cache non persisté — données volatiles jusqu'au prochain load distant
        logger.warn('[storageService] Cache local non persisté (quota dépassé), données volatiles jusqu\'au prochain load distant:', e);
        window.dispatchEvent(new CustomEvent('storage-quota-exceeded'));
    }
};

const replaceObservationIdInCache = (oldId: string, newId: string) => {
    const cache = getLocalCache();
    const seen = new Set<string>();
    const updated = cache
        .map(obs => (obs.id === oldId ? { ...obs, id: newId } : obs))
        .filter(obs => {
            if (seen.has(obs.id)) return false;
            seen.add(obs.id);
            return true;
        });
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
    } catch (error: unknown) {
        logger.error('Error fetching observations:', error);
        const err = asSupabaseError(error);
        if (cached.length > 0) {
            return {
                observations: cached,
                source: 'cache',
                warning: err.message || "Chargement distant impossible, affichage du cache local."
            };
        }
        throw new Error(err.message || 'Chargement des observations impossible');
    }
};

export const saveObservation = async (
    observation: Observation,
    options: PersistenceOptions = {}
): Promise<Observation> => {
    ensureStorageNamespace();

    const { data: { user } } = await supabase.auth.getUser();
    const userId = assertOnlineUserId(user?.id);

    if (!navigator.onLine) {
        const offlineObs = { ...observation, id: observation.id || `temp-${generateUUID()}` };
        addToQueue('INSERT', offlineObs);
        if (!options.skipCache) {
            upsertObservationInCache(offlineObs);
        }
        return offlineObs;
    }

    const row = mapToRow(observation, userId);

    let data: ObservationRow | null = null;
    let error: SupabaseLikeError | null = null;
    try {
        const response = await withColumnFallback(row, (effectiveRow) =>
            supabase.from('observations').insert(effectiveRow).select().single()
        );
        data = response.data as ObservationRow | null;
        error = response.error;
    } catch (thrown) {
        error = asSupabaseError(thrown);
    }

    if (error) {
        // SR-08: fall back to the offline queue on transient network/server errors
        if (isRecoverableNetworkError(error) && !isMissingColumnError(error)) {
            logger.warn('[storageService] Erreur Supabase récupérable lors du save — fallback queue offline:', error);
            const offlineObs = { ...observation, id: observation.id || `temp-${generateUUID()}` };
            addToQueue('INSERT', offlineObs);
            if (!options.skipCache) {
                upsertObservationInCache(offlineObs);
            }
            notifyRecoverableError('sauvegarde');
            return offlineObs;
        }
        logger.error('Error saving observation:', error);
        const msg = isMissingColumnError(error)
            ? 'Une migration de base de données est manquante. Contactez l\'administrateur.'
            : (error.message || 'Sauvegarde impossible');
        throw new Error(msg);
    }

    const savedObs = mapToObservation(data as ObservationRow);
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
    const userId = assertOnlineUserId(user?.id);

    if (!navigator.onLine) {
        addToQueue('UPDATE', observation);
        if (!options.skipCache) {
            upsertObservationInCache(observation);
        }
        return;
    }

    const row = mapToRow(observation, userId);

    // SI-08: Select updated_at to detect concurrent modifications
    let data: unknown = null;
    let error: SupabaseLikeError | null = null;
    try {
        const response = await withColumnFallback(row, (effectiveRow) =>
            supabase
                .from('observations')
                .update(effectiveRow)
                .eq('id', observation.id)
                .eq('user_id', userId)
                .select('id, updated_at')
        );
        data = response.data;
        error = response.error;
    } catch (thrown) {
        error = asSupabaseError(thrown);
    }

    if (error) {
        // SR-08: fall back to the offline queue on transient network/server errors
        if (isRecoverableNetworkError(error) && !isMissingColumnError(error)) {
            logger.warn('[storageService] Erreur Supabase récupérable lors de l\'update — fallback queue offline:', error);
            addToQueue('UPDATE', observation);
            if (!options.skipCache) {
                upsertObservationInCache(observation);
            }
            notifyRecoverableError('mise à jour');
            return;
        }
        logger.error('Error updating observation:', error);
        const msg = isMissingColumnError(error)
            ? 'Une migration de base de données est manquante. Contactez l\'administrateur.'
            : (error.message || 'Mise à jour impossible');
        throw new Error(msg);
    }
    assertMutationAffectedRows(Array.isArray(data) ? data.length : 0, 'update');

    if (!options.skipCache) {
        upsertObservationInCache(observation);
    }
};

export const deleteObservation = async (id: string): Promise<void> => {
    ensureStorageNamespace();

    const { data: { user } } = await supabase.auth.getUser();
    const userId = assertOnlineUserId(user?.id);

    if (!navigator.onLine) {
        addToQueue('DELETE', { id });

        const currentCache = getLocalCache();
        const updatedCache = currentCache.filter(obs => obs.id !== id);
        setLocalCache(updatedCache);
        return;
    }

    // SI-20: Return media URLs from DELETE for storage cleanup (single round-trip)
    let data: Array<{ id: string; photo_url: string | null; sound_url: string | null }> | null = null;
    let error: SupabaseLikeError | null = null;
    try {
        const response = await supabase
            .from('observations')
            .delete()
            .eq('id', id)
            .eq('user_id', userId)
            .select('id, photo_url, sound_url');
        data = response.data;
        error = response.error;
    } catch (thrown) {
        error = asSupabaseError(thrown);
    }

    if (error) {
        // SR-08: fall back to the offline queue on transient network/server errors
        if (isRecoverableNetworkError(error)) {
            logger.warn('[storageService] Erreur Supabase récupérable lors du delete — fallback queue offline:', error);
            addToQueue('DELETE', { id });
            const currentCache = getLocalCache();
            const updatedCache = currentCache.filter(obs => obs.id !== id);
            setLocalCache(updatedCache);
            notifyRecoverableError('suppression');
            return;
        }
        logger.error('Error deleting observation:', error);
        throw new Error(error.message || 'Suppression impossible');
    }
    assertMutationAffectedRows(Array.isArray(data) ? data.length : 0, 'delete');

    // SI-20: Clean up storage files (best-effort)
    const deleted = Array.isArray(data) ? data[0] : null;
    if (deleted) {
        const photoPath = extractStoragePath(deleted.photo_url, userId);
        const soundPath = extractStoragePath(deleted.sound_url, userId);
        const pathsToRemove = [photoPath, soundPath].filter((p): p is string => p !== null);
        if (pathsToRemove.length > 0) {
            await supabase.storage.from('photos').remove(pathsToRemove).catch(err => {
                logger.warn('[storageService] Échec nettoyage fichiers storage:', err);
            });
        }
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

    const fileName = `${user.id}/photos/${Date.now()}-${generateUUID()}.jpg`;
    const { error: uploadError } = await withTimeout(
        supabase.storage
            .from('photos')
            .upload(fileName, file, {
                contentType: 'image/jpeg',
                upsert: false
            }),
        UPLOAD_TIMEOUT_MS,
        'Upload photo'
    );

    if (uploadError) {
        logger.error('Error uploading photo:', uploadError);
        throw new Error(uploadError.message);
    }

    const { data: { publicUrl } } = supabase.storage
        .from('photos')
        .getPublicUrl(fileName);

    if (!publicUrl) {
        throw new Error('URL publique de la photo non disponible.');
    }

    return publicUrl;
};

const ALLOWED_AUDIO_TYPES = new Set([
    'audio/mpeg', 'audio/ogg', 'audio/wav', 'audio/webm', 'audio/mp4', 'audio/x-m4a',
]);

export const uploadSound = async (file: Blob): Promise<string> => {
    if (!navigator.onLine) {
        throw new Error("Impossible d'envoyer un son en mode hors-ligne. Veuillez réessayer une fois connecté.");
    }

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('User not authenticated');

    const contentType = file.type || 'audio/mpeg';
    if (!ALLOWED_AUDIO_TYPES.has(contentType)) {
        throw new Error(`Type audio non autorisé (${contentType}). Formats acceptés : MP3, OGG, WAV, WebM, M4A.`);
    }
    const extension = contentType.split('/')[1]?.split(';')[0] || 'mp3';
    const fileName = `${user.id}/sounds/${Date.now()}-${generateUUID()}.${extension}`;

    const { error: uploadError } = await withTimeout(
        supabase.storage
            .from('photos')
            .upload(fileName, file, {
                contentType,
                upsert: false
            }),
        UPLOAD_TIMEOUT_MS,
        'Upload son'
    );

    if (uploadError) {
        logger.error('Error uploading sound:', uploadError);
        throw new Error(uploadError.message);
    }

    const { data: { publicUrl } } = supabase.storage
        .from('photos')
        .getPublicUrl(fileName);

    if (!publicUrl) {
        throw new Error('URL publique du son non disponible.');
    }

    return publicUrl;
};

export const processOfflineQueue = async (options: ProcessOfflineQueueOptions = {}): Promise<OfflineSyncResult> => {
    // SI-02: Mutex — concurrent calls coalesce to the same execution
    if (processingQueue) {
        return processingQueue;
    }
    processingQueue = _processOfflineQueueInner(options);
    try {
        return await processingQueue;
    } finally {
        processingQueue = null;
    }
};

const _processOfflineQueueInner = async (options: ProcessOfflineQueueOptions = {}): Promise<OfflineSyncResult> => {
    ensureStorageNamespace();
    // SI-14: Capture namespace at start to detect mid-sync account switch
    const capturedNamespace = storageNamespace;

    if (!navigator.onLine) {
        return { processed: 0, failed: 0, failureReasons: [], skippedItems: [] };
    }

    const queue = getQueue();
    if (queue.length === 0) {
        return { processed: 0, failed: 0, failureReasons: [], skippedItems: [] };
    }

    const itemIds = Array.isArray(options.itemIds) ? options.itemIds : [];
    const hasScopedProcessing = itemIds.length > 0;
    const itemIdSet = hasScopedProcessing ? new Set(itemIds) : null;

    const queueToProcess = hasScopedProcessing && itemIdSet
        ? queue.filter(item => itemIdSet.has(item.id))
        : queue;
    const preservedQueueItems = hasScopedProcessing && itemIdSet
        ? queue.filter(item => !itemIdSet.has(item.id))
        : [];

    if (queueToProcess.length === 0) {
        return { processed: 0, failed: 0, failureReasons: [], skippedItems: [] };
    }

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
        return {
            processed: queueToProcess.length,
            failed: queueToProcess.length,
            failureReasons: ['User not authenticated'],
            skippedItems: []
        };
    }

    const reducedQueue = reduceQueue(queueToProcess);
    const failedItems: OfflineQueueItem[] = [];
    const skippedItems: SkippedSyncItem[] = [];
    const idMap = new Map<string, string>();
    const failureReasons = new Map<string, number>();
    const RETRY_DELAYS = [1000, 3000, 9000];

    // SI-16: Re-upload data URL media (photos/sounds stored offline) to Supabase Storage
    const reUploadDataUrlMedia = async (row: Record<string, unknown>): Promise<Record<string, unknown>> => {
        const updated = { ...row };
        if (typeof updated.photo_url === 'string' && updated.photo_url.startsWith('data:')) {
            const blob = dataUrlToBlob(updated.photo_url as string);
            updated.photo_url = await uploadPhoto(blob);
        }
        if (typeof updated.sound_url === 'string' && updated.sound_url.startsWith('data:')) {
            const blob = dataUrlToBlob(updated.sound_url as string);
            updated.sound_url = await uploadSound(blob);
        }
        return updated;
    };

    const processOneItem = async (item: OfflineQueueItem, userId: string) => {
        if (item.action === 'INSERT') {
            const payload = item.payload as Observation;
            let row = await reUploadDataUrlMedia(mapToRow(payload, userId));

            if (isTempId(payload.id)) {
                const rowWithoutId = { ...row };
                delete rowWithoutId.id;
                const { data, error } = await withColumnFallback(rowWithoutId, (effective) =>
                    supabase.from('observations').insert(effective).select('*').single()
                );

                if (error) throw error;

                const created = mapToObservation(data);
                idMap.set(payload.id, created.id);
                replaceObservationIdInCache(payload.id, created.id);
            } else {
                const { error } = await withColumnFallback(row, (effective) =>
                    supabase.from('observations').upsert(effective, { onConflict: 'id' })
                );

                if (error) throw error;
            }
        } else if (item.action === 'UPDATE') {
            const payload = item.payload as Observation;

            if (isTempId(payload.id) && !idMap.has(payload.id)) {
                throw new Error('SKIP_TEMP_ID');
            }

            const row = await reUploadDataUrlMedia(mapToRow(payload, userId));
            const { data, error } = await withColumnFallback(row, (effective) =>
                supabase
                    .from('observations')
                    .update(effective)
                    .eq('id', payload.id)
                    .eq('user_id', userId)
                    .select('id')
            );

            if (error) throw error;
            // SI-07: Verify the UPDATE actually affected a row
            assertMutationAffectedRows(Array.isArray(data) ? data.length : 0, 'update');
        } else if (item.action === 'DELETE') {
            const payload = item.payload as { id: string };

            if (isTempId(payload.id) && !idMap.has(payload.id)) {
                return; // Nothing to delete
            }

            const { error } = await supabase
                .from('observations')
                .delete()
                .eq('id', payload.id)
                .eq('user_id', userId)
                .select('id');

            if (error) throw error;
        }
    };

    const remainingItems = [...reducedQueue];
    for (let i = 0; i < reducedQueue.length; i++) {
        // SI-13: Re-verify auth token periodically during long queues
        if (i > 0 && i % REAUTH_CHECK_INTERVAL === 0) {
            const { data: { user: recheck } } = await supabase.auth.getUser();
            if (!recheck) {
                const remaining = reducedQueue.slice(i);
                remaining.forEach(ri => {
                    failedItems.push(mapQueueItemIds(ri, idMap));
                    failureReasons.set('Session expirée pendant la synchronisation.', (failureReasons.get('Session expirée pendant la synchronisation.') || 0) + 1);
                });
                break;
            }
        }
        const rawItem = reducedQueue[i];
        const item = mapQueueItemIds(rawItem, idMap);
        options.onProgress?.(i + 1, reducedQueue.length);

        let succeeded = false;
        for (let attempt = 0; attempt <= RETRY_DELAYS.length; attempt++) {
            try {
                await processOneItem(item, user.id);
                succeeded = true;
                break;
            } catch (error) {
                const msg = error instanceof Error ? error.message : '';
                // Don't retry on skip or missing temp ID — collect as skipped
                if (msg === 'SKIP_TEMP_ID') {
                    const p = item.payload as { id?: string; speciesName?: string };
                    skippedItems.push({
                        id: p.id || item.id,
                        action: item.action,
                        reason: 'ID temporaire sans correspondance serveur (l\'INSERT initial n\'a pas été synchronisé).'
                    });
                    succeeded = true; // Remove from remaining (skipped, not failed)
                    break;
                }
                if (attempt < RETRY_DELAYS.length) {
                    await new Promise(r => setTimeout(r, RETRY_DELAYS[attempt]));
                } else {
                    logger.error('Error processing queue item:', error);
                    failedItems.push(mapQueueItemIds(rawItem, idMap));
                    const reason = error instanceof Error ? error.message : String(error);
                    failureReasons.set(reason, (failureReasons.get(reason) || 0) + 1);
                }
            }
        }
        // SI-05: Update persisted queue after each processed item (crash protection)
        if (succeeded) {
            remainingItems.splice(remainingItems.indexOf(rawItem), 1);
            setQueue([...preservedQueueItems, ...remainingItems, ...failedItems].sort((a, b) => a.timestamp - b.timestamp));
        }
    }

    setQueue([...preservedQueueItems, ...failedItems].sort((a, b) => a.timestamp - b.timestamp));

    // Refresh cache from server after sync (even partial) to stay consistent
    const { data: refreshData, error: fetchError } = await supabase
        .from('observations')
        .select('*')
        .eq('user_id', user.id)
        .order('date', { ascending: false });

    if (!fetchError && refreshData) {
        setLocalCache(refreshData.map(mapToObservation));
        // SI-12: Re-inject failed INSERT observations into cache so they remain visible
        const failedInserts = failedItems
            .filter(item => item.action === 'INSERT')
            .map(item => item.payload as Observation);
        if (failedInserts.length > 0) {
            bulkUpsertObservationsInCache(failedInserts);
        }
    }

    // SI-14: Warn if namespace changed during processing
    if (storageNamespace !== capturedNamespace) {
        logger.warn('[storageService] Namespace changed during sync — was', capturedNamespace, 'now', storageNamespace);
    }

    return {
        processed: reducedQueue.length,
        failed: failedItems.length,
        failureReasons: Array.from(failureReasons.entries()).map(([reason, count]) => `${count}x ${reason}`),
        skippedItems
    };
};
