import { captureSessionContext, assertSessionContext, setSessionIdentity, getSessionUserId, inSession, StaleSessionError, removeUnownedLegacyState, type SessionContext } from './sessionScope';
import { supabase } from '../supabaseClient';
import { Observation } from '../types';
import { sanitizeCachedMediaValue, sanitizeCachedMediaValueWithTracking } from './storageCacheUtils';
import { OfflineAction, OfflineQueueItem, isTempId, mapQueueItemIds, reduceQueue } from './storageQueueUtils';
import { generateUUID } from '../utils/uuidUtils';
import { logger } from '../utils/logger';
import type {
    ObservationLoadResult,
    SkippedSyncItem,
    OfflineSyncResult,
    ProcessOfflineQueueOptions,
    PersistenceOptions,
    ObservationRow,
    SupabaseLikeError,
} from './storage/storageTypes';
import { mapToObservation, mapToRow } from './storage/storageMappers';
import { extractStoragePath, dataUrlToBlob, scopedKey, assertOnlineUserId, asSupabaseError, parseJson } from './storage/storageHelpers';
import { isRecoverableNetworkError, notifyRecoverableError } from './storage/storagePredicates';
import { isMissingColumnError, withColumnFallback } from './storage/storageSchema';
import { uploadPhoto, uploadSound } from './storage/storageMedia';
import { CACHE_SCHEMA_VERSION, sanitizeCachedObservations } from './storage/storageCacheValidation';

const QUEUE_KEY_PREFIX = 'offline_sync_queue';
const LOCAL_CACHE_KEY_PREFIX = 'local_observations_cache';
const LOCAL_CACHE_TTL_MS = 90 * 24 * 60 * 60 * 1000; // 90 days
const LOCAL_CACHE_TS_SUFFIX = '_ts';
const LOCAL_CACHE_VERSION_SUFFIX = '_v';

// Types déplacés dans ./storage/storageTypes — ré-export de l'API publique
// (les imports existants depuis './storageService' restent inchangés).
export type { ObservationLoadResult, SkippedSyncItem, OfflineSyncResult, ProcessOfflineQueueOptions };
// Fonctions publiques extraites dans ./storage/* — ré-export pour ne pas
// modifier les importeurs (App.tsx, hooks, ObservationForm).
export { isDuplicateKeyError } from './storage/storagePredicates';
export { uploadPhoto, uploadSound };

let processingQueue: { context: SessionContext; promise: Promise<OfflineSyncResult> } | null = null;

const REAUTH_CHECK_INTERVAL = 5;

const getQueueScopedKey = (userId: string): string => scopedKey(QUEUE_KEY_PREFIX, userId);
const getCacheScopedKey = (userId: string): string => scopedKey(LOCAL_CACHE_KEY_PREFIX, userId);

const operationUserId = async (context: SessionContext): Promise<string> => {
    assertSessionContext(context);
    if (!navigator.onLine) return context.userId;
    const { data: { user } } = await inSession(context, () => supabase.auth.getUser());
    const userId = assertOnlineUserId(user?.id);
    if (userId !== context.userId) throw new StaleSessionError();
    return userId;
};

const assertMutationAffectedRows = (count: number | null, action: 'update' | 'delete'): void => {
    if ((count ?? 0) < 1) {
        throw new Error(`Impossible de ${action === 'update' ? 'mettre à jour' : 'supprimer'}: observation introuvable ou accès refusé.`);
    }
};

const notifyStorageCorruption = (scope: 'queue' | 'cache' | 'presets') => {
    window.dispatchEvent(new CustomEvent('storage-corruption-detected', { detail: { scope } }));
};

export const setStorageNamespace = (userId: string | null): void => {
    setSessionIdentity(userId);
};

export const clearScopedOfflineData = (userId?: string): void => {
    const targetUserId = (userId ?? getSessionUserId() ?? '').trim();
    if (!targetUserId) return;

    localStorage.removeItem(getQueueScopedKey(targetUserId));
    localStorage.removeItem(getCacheScopedKey(targetUserId));
    localStorage.removeItem(getCacheScopedKey(targetUserId) + LOCAL_CACHE_TS_SUFFIX);
    localStorage.removeItem(getCacheScopedKey(targetUserId) + LOCAL_CACHE_VERSION_SUFFIX);
};

export const migrateLegacyLocalStorageToScoped = (_userId: string): void => {
    // Aucun propriétaire fiable : ne jamais attribuer un ancien cache au prochain compte.
    removeUnownedLegacyState();
};

const getScopedKeys = (context: SessionContext): { queueKey: string; cacheKey: string } => {
    assertSessionContext(context);
    const userId = context.userId;
    return {
        queueKey: getQueueScopedKey(userId),
        cacheKey: getCacheScopedKey(userId)
    };
};

const MAX_QUEUE_ITEM_AGE_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

const getQueue = (context: SessionContext): OfflineQueueItem[] => {
    const { queueKey } = getScopedKeys(context);
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

export const getOfflineQueueSnapshot = (context = captureSessionContext()): OfflineQueueItem[] => {
    assertSessionContext(context);
    return getQueue(context).sort((a, b) => a.timestamp - b.timestamp);
};

const setQueue = (queue: OfflineQueueItem[], context: SessionContext) => {
    const { queueKey } = getScopedKeys(context);
    try {
        localStorage.setItem(queueKey, JSON.stringify(queue));
    } catch {
        window.dispatchEvent(new CustomEvent('storage-quota-exceeded'));
        throw new Error("File d'attente hors-ligne pleine. Synchronisez vos données avant d'ajouter de nouvelles observations.");
    }
};

const addToQueue = (action: OfflineAction, payload: Observation | { id: string }, context: SessionContext) => {
    assertSessionContext(context);
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
    const queue = getQueue(context);
    queue.push({
        id: generateUUID(),
        action,
        payload,
        timestamp: Date.now()
    });
    setQueue(queue, context);
};

const getLocalCache = (context: SessionContext): Observation[] => {
    const { cacheKey } = getScopedKeys(context);
    const tsRaw = localStorage.getItem(cacheKey + LOCAL_CACHE_TS_SUFFIX);
    if (tsRaw) {
        const cachedAt = Number(tsRaw);
        if (Date.now() - cachedAt > LOCAL_CACHE_TTL_MS) {
            localStorage.removeItem(cacheKey);
            localStorage.removeItem(cacheKey + LOCAL_CACHE_TS_SUFFIX);
            localStorage.removeItem(cacheKey + LOCAL_CACHE_VERSION_SUFFIX);
            return [];
        }
    }

    const raw = parseJson<unknown>(localStorage.getItem(cacheKey), null, (err) => {
        logger.error('[storageService] Cache local corrompu — données locales perdues:', err);
        notifyStorageCorruption('cache');
    });
    if (raw === null) return [];

    // Versionnage du cache (migration douce) : aucune migration nécessaire en v1 —
    // la validation de forme ci-dessous fait office de filet quel que soit l'écart de
    // version (cache d'une app plus ancienne, ou plus récente après retour arrière).
    const storedVersion = Number(localStorage.getItem(cacheKey + LOCAL_CACHE_VERSION_SUFFIX) ?? 0);
    if (storedVersion > CACHE_SCHEMA_VERSION) {
        logger.warn(`[storageService] Cache local écrit par une version plus récente (v${storedVersion} > v${CACHE_SCHEMA_VERSION}) — lecture tolérante.`);
    }

    const { observations, dropped, invalidRoot } = sanitizeCachedObservations(raw);
    if (invalidRoot) {
        logger.error('[storageService] Cache local de forme inattendue (racine non-tableau) — ignoré.');
        notifyStorageCorruption('cache');
        return [];
    }
    if (dropped > 0) {
        // On n'écarte que les entrées inexploitables — jamais le cache entier.
        logger.warn(`[storageService] ${dropped} entrée(s) de cache local invalide(s) ignorée(s) (${observations.length} conservée(s)).`);
    }
    return observations;
};

const setLocalCache = (observations: Observation[], context: SessionContext) => {
    assertSessionContext(context);
    try {
        const { cacheKey } = getScopedKeys(context);
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
        localStorage.setItem(cacheKey + LOCAL_CACHE_VERSION_SUFFIX, String(CACHE_SCHEMA_VERSION));
        if (strippedMediaCount > 0) {
            window.dispatchEvent(new CustomEvent('media-stripped-offline', { detail: { count: strippedMediaCount } }));
        }
    } catch (e) {
        assertSessionContext(context);
        // SR-11: cache non persisté — données volatiles jusqu'au prochain load distant
        logger.warn('[storageService] Cache local non persisté (quota dépassé), données volatiles jusqu\'au prochain load distant:', e);
        window.dispatchEvent(new CustomEvent('storage-quota-exceeded'));
    }
};

const replaceObservationIdInCache = (oldId: string, newId: string, context: SessionContext) => {
    const cache = getLocalCache(context);
    const seen = new Set<string>();
    const updated = cache
        .map(obs => (obs.id === oldId ? { ...obs, id: newId } : obs))
        .filter(obs => {
            if (seen.has(obs.id)) return false;
            seen.add(obs.id);
            return true;
        });
    setLocalCache(updated, context);
};

const upsertObservationInCache = (observation: Observation, context: SessionContext) => {
    const cache = getLocalCache(context);
    const index = cache.findIndex(obs => obs.id === observation.id);
    if (index === -1) {
        setLocalCache([observation, ...cache], context);
        return;
    }

    const next = [...cache];
    next[index] = observation;
    setLocalCache(next, context);
};

export const bulkUpsertObservationsInCache = (newObservations: Observation[], context = captureSessionContext()): void => {
    const cache = getLocalCache(context);
    const mergedById = new Map(cache.map(obs => [obs.id, obs] as [string, Observation]));
    for (const obs of newObservations) {
        mergedById.set(obs.id, obs);
    }
    setLocalCache(Array.from(mergedById.values()), context);
};

/**
 * Audit v2 (H8) : réconcilie une liste d'observations issue du serveur avec la
 * file d'attente hors-ligne. Les actions non synchronisées (créations/éditions
 * en attente ou en échec, suppressions en attente) sont appliquées sur la liste
 * serveur pour que l'utilisateur ne « perde » jamais de vue ses saisies
 * hors-ligne — y compris après une synchronisation partielle, où `getObservations`
 * écrasait sinon la ré-injection SI-12 avec les seules données serveur.
 */
export const applyPendingQueueToObservations = (observations: Observation[], context = captureSessionContext()): Observation[] => {
    assertSessionContext(context);
    let queue: OfflineQueueItem[];
    try {
        queue = getOfflineQueueSnapshot(context);
    } catch {
        assertSessionContext(context);
        return observations;
    }
    if (queue.length === 0) return observations;

    const byId = new Map(observations.map(obs => [obs.id, obs] as [string, Observation]));
    for (const item of queue) {
        if (item.action === 'DELETE') {
            const id = (item.payload as { id: string }).id;
            if (id) byId.delete(id);
        } else {
            const obs = item.payload as Observation;
            if (obs?.id) byId.set(obs.id, obs);
        }
    }
    return Array.from(byId.values());
};

export const getObservations = async (context = captureSessionContext()): Promise<ObservationLoadResult> => {
    assertSessionContext(context);
    const cached = getLocalCache(context);

    if (!navigator.onLine) {
        return { observations: cached, source: 'cache' };
    }

    try {
        const { data: { user } } = await inSession(context, () => supabase.auth.getUser());
        if (!user) throw new Error('Utilisateur non authentifié');
        if (user.id !== context.userId) throw new StaleSessionError();

        // SI-29: Supabase PostgREST plafonne une requête non paginée à 1000 lignes
        // par défaut. Sans pagination, les utilisateurs >1000 obs ont un state
        // incomplet — cassait la détection de collisions à l'import (#PR).
        const PAGE_SIZE = 1000;
        const rows: ObservationRow[] = [];
        for (let from = 0; ; from += PAGE_SIZE) {
            const { data, error } = await inSession(context, () => supabase
                .from('observations')
                .select('*')
                .eq('user_id', user.id)
                .order('date', { ascending: false })
                .range(from, from + PAGE_SIZE - 1));

            assertSessionContext(context);
            if (error) throw error;
            if (!data || data.length === 0) break;
            rows.push(...(data as ObservationRow[]));
            if (data.length < PAGE_SIZE) break;
        }

        // H8 : réconcilier avec la file hors-ligne avant de remplacer le cache,
        // pour ne pas faire disparaître les observations en attente/en échec.
        const observations = applyPendingQueueToObservations(rows.map(mapToObservation), context);
        setLocalCache(observations, context);
        return { observations, source: 'remote' };
    } catch (error: unknown) {
        assertSessionContext(context);
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
    const context = options.context ?? captureSessionContext();
    assertSessionContext(context);

    const userId = await operationUserId(context);

    if (!navigator.onLine) {
        const offlineObs = { ...observation, id: observation.id || `temp-${generateUUID()}` };
        addToQueue('INSERT', offlineObs, context);
        if (!options.skipCache) {
            upsertObservationInCache(offlineObs, context);
        }
        return offlineObs;
    }

    const row = mapToRow(observation, userId);

    let data: ObservationRow | null = null;
    let error: SupabaseLikeError | null = null;
    try {
        const response = await inSession(context, () => withColumnFallback(row, (effectiveRow) => { assertSessionContext(context); return supabase.from('observations').insert(effectiveRow).select().single(); }
        ));
        data = response.data as ObservationRow | null;
        error = response.error;
    } catch (thrown) {
        error = asSupabaseError(thrown);
    }

    assertSessionContext(context);
    if (error) {
        // SR-08: fall back to the offline queue on transient network/server errors
        if (isRecoverableNetworkError(error) && !isMissingColumnError(error)) {
            logger.warn('[storageService] Erreur Supabase récupérable lors du save — fallback queue offline:', error);
            const offlineObs = { ...observation, id: observation.id || `temp-${generateUUID()}` };
            addToQueue('INSERT', offlineObs, context);
            if (!options.skipCache) {
                upsertObservationInCache(offlineObs, context);
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
        upsertObservationInCache(savedObs, context);
    }

    return savedObs;
};

export const updateObservation = async (
    observation: Observation,
    options: PersistenceOptions = {}
): Promise<void> => {
    const context = options.context ?? captureSessionContext();
    assertSessionContext(context);

    const userId = await operationUserId(context);

    if (!navigator.onLine) {
        addToQueue('UPDATE', observation, context);
        if (!options.skipCache) {
            upsertObservationInCache(observation, context);
        }
        return;
    }

    const row = mapToRow(observation, userId);

    // SI-08: Select updated_at to detect concurrent modifications
    let data: unknown = null;
    let error: SupabaseLikeError | null = null;
    try {
        const response = await inSession(context, () => withColumnFallback(row, (effectiveRow) => { assertSessionContext(context); return supabase
                .from('observations')
                .update(effectiveRow)
                .eq('id', observation.id)
                .eq('user_id', userId)
                .select('id, updated_at'); }
        ));
        data = response.data;
        error = response.error;
    } catch (thrown) {
        error = asSupabaseError(thrown);
    }

    assertSessionContext(context);
    if (error) {
        // SR-08: fall back to the offline queue on transient network/server errors
        if (isRecoverableNetworkError(error) && !isMissingColumnError(error)) {
            logger.warn('[storageService] Erreur Supabase récupérable lors de l\'update — fallback queue offline:', error);
            addToQueue('UPDATE', observation, context);
            if (!options.skipCache) {
                upsertObservationInCache(observation, context);
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
        upsertObservationInCache(observation, context);
    }
};

/**
 * Audit v2 (H9) : met à jour UNIQUEMENT la colonne `wikipedia_image` d'une
 * observation. Utilisé par l'enrichissement automatique au démarrage, qui ne
 * doit pas réécrire la ligne entière (sinon une édition concurrente de
 * l'utilisateur serait écrasée en base). Online uniquement, best-effort : les
 * erreurs sont journalisées, pas propagées (l'enrichissement n'est pas critique).
 */
export const setObservationWikipediaImage = async (id: string, wikipediaImage: string, context = captureSessionContext()): Promise<void> => {
    assertSessionContext(context);
    const { data: { user } } = await inSession(context, () => supabase.auth.getUser());
    const userId = user?.id;
    if (!userId) return;
    if (userId !== context.userId) throw new StaleSessionError();

    const { error } = await inSession(context, () => supabase
        .from('observations')
        .update({ wikipedia_image: wikipediaImage })
        .eq('id', id)
        .eq('user_id', userId));

    assertSessionContext(context);
    if (error) {
        logger.warn('[storageService] Enrichissement image non persisté:', error);
        return;
    }

    // Met à jour le seul champ image dans le cache, sans toucher aux autres
    // champs (qui ont pu être modifiés par l'utilisateur entre-temps).
    const cache = getLocalCache(context);
    const index = cache.findIndex(obs => obs.id === id);
    if (index !== -1) {
        const next = [...cache];
        next[index] = { ...next[index], wikipediaImage };
        setLocalCache(next, context);
    }
};

export const deleteObservation = async (id: string, context = captureSessionContext()): Promise<void> => {
    assertSessionContext(context);

    const userId = await operationUserId(context);

    if (!navigator.onLine) {
        addToQueue('DELETE', { id }, context);

        const currentCache = getLocalCache(context);
        const updatedCache = currentCache.filter(obs => obs.id !== id);
        setLocalCache(updatedCache, context);
        return;
    }

    // SI-20: Return media URLs from DELETE for storage cleanup (single round-trip)
    let data: Array<{ id: string; photo_url: string | null; sound_url: string | null }> | null = null;
    let error: SupabaseLikeError | null = null;
    try {
        const response = await inSession(context, () => supabase
            .from('observations')
            .delete()
            .eq('id', id)
            .eq('user_id', userId)
            .select('id, photo_url, sound_url'));
        data = response.data;
        error = response.error;
    } catch (thrown) {
        error = asSupabaseError(thrown);
    }

    assertSessionContext(context);
    if (error) {
        // SR-08: fall back to the offline queue on transient network/server errors
        if (isRecoverableNetworkError(error)) {
            logger.warn('[storageService] Erreur Supabase récupérable lors du delete — fallback queue offline:', error);
            addToQueue('DELETE', { id }, context);
            const currentCache = getLocalCache(context);
            const updatedCache = currentCache.filter(obs => obs.id !== id);
            setLocalCache(updatedCache, context);
            notifyRecoverableError('suppression');
            return;
        }
        logger.error('Error deleting observation:', error);
        throw new Error(error.message || 'Suppression impossible');
    }
    assertMutationAffectedRows(Array.isArray(data) ? data.length : 0, 'delete');

    // SI-20: Clean up storage files (best-effort)
    assertSessionContext(context);
    const deleted = Array.isArray(data) ? data[0] : null;
    if (deleted) {
        const photoPath = extractStoragePath(deleted.photo_url, userId);
        const soundPath = extractStoragePath(deleted.sound_url, userId);
        const pathsToRemove = [photoPath, soundPath].filter((p): p is string => p !== null);
        if (pathsToRemove.length > 0) {
            await inSession(context, () => supabase.storage.from('photos').remove(pathsToRemove).catch(err => {
                logger.warn('[storageService] Échec nettoyage fichiers storage:', err);
            }));
        }
    }

    const currentCache = getLocalCache(context);
    const updatedCache = currentCache.filter(obs => obs.id !== id);
    setLocalCache(updatedCache, context);
};




export const processOfflineQueue = async (options: ProcessOfflineQueueOptions = {}): Promise<OfflineSyncResult> => {
    const context = options.context ?? captureSessionContext();
    assertSessionContext(context);
    if (processingQueue && processingQueue.context.sessionGeneration === context.sessionGeneration) return processingQueue.promise;
    const task = { context, promise: _processOfflineQueueInner(options, context) };
    processingQueue = task;
    try { return await task.promise; }
    finally { if (processingQueue === task) processingQueue = null; }
};

const _processOfflineQueueInner = async (options: ProcessOfflineQueueOptions, context: SessionContext): Promise<OfflineSyncResult> => {
    assertSessionContext(context);
    if (!navigator.onLine) {
        return { processed: 0, failed: 0, failureReasons: [], skippedItems: [] };
    }

    const queue = getQueue(context);
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

    const { data: { user } } = await inSession(context, () => supabase.auth.getUser());
    if (!user) {
        return {
            processed: queueToProcess.length,
            failed: queueToProcess.length,
            failureReasons: ['User not authenticated'],
            skippedItems: []
        };
    }

    if (user.id !== context.userId) throw new StaleSessionError();
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
            updated.photo_url = await uploadPhoto(blob, context);
        }
        if (typeof updated.sound_url === 'string' && updated.sound_url.startsWith('data:')) {
            const blob = dataUrlToBlob(updated.sound_url as string);
            updated.sound_url = await uploadSound(blob, context);
        }
        return updated;
    };

    const processOneItem = async (item: OfflineQueueItem, userId: string) => {
        assertSessionContext(context);
        if (item.action === 'INSERT') {
            const payload = item.payload as Observation;
            let row = await reUploadDataUrlMedia(mapToRow(payload, userId));

            assertSessionContext(context);
            if (isTempId(payload.id)) {
                const rowWithoutId = { ...row };
                delete rowWithoutId.id;
                const { data, error } = await inSession(context, () => withColumnFallback(rowWithoutId, (effective) => { assertSessionContext(context); return supabase.from('observations').insert(effective).select('*').single(); }
                ));

                assertSessionContext(context);
                if (error) throw error;

                const created = mapToObservation(data);
                idMap.set(payload.id, created.id);
                replaceObservationIdInCache(payload.id, created.id, context);
            } else {
                const { error } = await inSession(context, () => withColumnFallback(row, (effective) => { assertSessionContext(context); return supabase.from('observations').upsert(effective, { onConflict: 'id' }); }
                ));

                assertSessionContext(context);
                if (error) throw error;
            }
        } else if (item.action === 'UPDATE') {
            const payload = item.payload as Observation;

            if (isTempId(payload.id) && !idMap.has(payload.id)) {
                throw new Error('SKIP_TEMP_ID');
            }

            const row = await reUploadDataUrlMedia(mapToRow(payload, userId));
            assertSessionContext(context);
            const { data, error } = await inSession(context, () => withColumnFallback(row, (effective) => { assertSessionContext(context); return supabase
                    .from('observations')
                    .update(effective)
                    .eq('id', payload.id)
                    .eq('user_id', userId)
                    .select('id'); }
            ));

            assertSessionContext(context);
            if (error) throw error;
            // SI-07: Verify the UPDATE actually affected a row
            assertMutationAffectedRows(Array.isArray(data) ? data.length : 0, 'update');
        } else if (item.action === 'DELETE') {
            const payload = item.payload as { id: string };

            if (isTempId(payload.id) && !idMap.has(payload.id)) {
                return; // Nothing to delete
            }

            const { error } = await inSession(context, () => supabase
                .from('observations')
                .delete()
                .eq('id', payload.id)
                .eq('user_id', userId)
                .select('id'));

            assertSessionContext(context);
            if (error) throw error;
        }
    };

    const remainingItems = [...reducedQueue];
    for (let i = 0; i < reducedQueue.length; i++) {
        assertSessionContext(context);
        // SI-13: Re-verify auth token periodically during long queues
        if (i > 0 && i % REAUTH_CHECK_INTERVAL === 0) {
            const { data: { user: recheck } } = await inSession(context, () => supabase.auth.getUser());
            if (!recheck || recheck.id !== context.userId) {
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
                assertSessionContext(context);
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
                    await inSession(context, () => new Promise(r => setTimeout(r, RETRY_DELAYS[attempt])));
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
            setQueue([...preservedQueueItems, ...remainingItems, ...failedItems].sort((a, b) => a.timestamp - b.timestamp), context);
        }
    }

    setQueue([...preservedQueueItems, ...failedItems].sort((a, b) => a.timestamp - b.timestamp), context);

    // Refresh cache from server after sync (even partial) to stay consistent
    const { data: refreshData, error: fetchError } = await inSession(context, () => supabase
        .from('observations')
        .select('*')
        .eq('user_id', user.id)
        .order('date', { ascending: false }));

    assertSessionContext(context);
    if (!fetchError && refreshData) {
        setLocalCache(refreshData.map(mapToObservation), context);
        // SI-12: Re-inject failed INSERT observations into cache so they remain visible
        const failedInserts = failedItems
            .filter(item => item.action === 'INSERT')
            .map(item => item.payload as Observation);
        if (failedInserts.length > 0) {
            bulkUpsertObservationsInCache(failedInserts, context);
        }
    }

    return {
        processed: reducedQueue.length,
        failed: failedItems.length,
        failureReasons: Array.from(failureReasons.entries()).map(([reason, count]) => `${count}x ${reason}`),
        skippedItems
    };
};
