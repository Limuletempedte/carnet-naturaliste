import { supabase } from '../supabaseClient';
import { Observation } from '../types';

// Helper to map Supabase row to Observation
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

// Helper to map Observation to Supabase row
const mapToRow = (obs: Observation, userId: string) => ({
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
});

// Offline Queue Management
const QUEUE_KEY = 'offline_sync_queue';
const LOCAL_CACHE_KEY = 'local_observations_cache';

const addToQueue = (action: 'INSERT' | 'UPDATE' | 'DELETE', payload: any) => {
    const queue = JSON.parse(localStorage.getItem(QUEUE_KEY) || '[]');
    queue.push({ action, payload, timestamp: Date.now() });
    localStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
};

const getLocalCache = (): Observation[] => {
    return JSON.parse(localStorage.getItem(LOCAL_CACHE_KEY) || '[]');
};

const setLocalCache = (observations: Observation[]) => {
    localStorage.setItem(LOCAL_CACHE_KEY, JSON.stringify(observations));
};

export const getObservations = async (): Promise<Observation[]> => {
    if (!navigator.onLine) {
        console.log('Offline: Fetching from local cache');
        return getLocalCache();
    }

    try {
        const { data, error } = await supabase
            .from('observations')
            .select('*')
            .order('date', { ascending: false });

        if (error) throw error;

        const observations = data.map(mapToObservation);
        setLocalCache(observations); // Update cache
        return observations;
    } catch (error) {
        console.error('Error fetching observations:', error);
        // Fallback to cache on error
        return getLocalCache();
    }
};

export const saveObservation = async (observation: Observation): Promise<Observation> => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user && navigator.onLine) throw new Error('User not authenticated');

    // For offline, we might not have user, but we need one for the row mapping.
    // We assume user was logged in before going offline and we can get session or handle it.
    // If completely offline from start, auth might be an issue. 
    // For PWA, we assume 'user' object might be null if session expired, 
    // but usually supabase client persists session.

    const userId = user?.id || 'offline-user'; // Fallback for offline queue if needed

    if (!navigator.onLine) {
        console.log('Offline: Queuing insert');
        const offlineObs = { ...observation, id: observation.id || `temp-${Date.now()}` };
        addToQueue('INSERT', offlineObs);

        // Optimistic update
        const currentCache = getLocalCache();
        setLocalCache([offlineObs, ...currentCache]);
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

    // Update cache
    const currentCache = getLocalCache();
    setLocalCache([savedObs, ...currentCache]);

    return savedObs;
};

export const updateObservation = async (observation: Observation): Promise<void> => {
    const { data: { user } } = await supabase.auth.getUser();
    const userId = user?.id || 'offline-user';

    if (!navigator.onLine) {
        console.log('Offline: Queuing update');
        addToQueue('UPDATE', observation);

        // Optimistic update
        const currentCache = getLocalCache();
        const updatedCache = currentCache.map(obs => obs.id === observation.id ? observation : obs);
        setLocalCache(updatedCache);
        return;
    }

    const row = mapToRow(observation, userId);

    const { error } = await supabase
        .from('observations')
        .update(row)
        .eq('id', observation.id);

    if (error) {
        console.error('Error updating observation:', error);
        throw new Error(error.message);
    }

    // Update cache
    const currentCache = getLocalCache();
    const updatedCache = currentCache.map(obs => obs.id === observation.id ? observation : obs);
    setLocalCache(updatedCache);
};

export const deleteObservation = async (id: string): Promise<void> => {
    if (!navigator.onLine) {
        console.log('Offline: Queuing delete');
        addToQueue('DELETE', { id });

        // Optimistic update
        const currentCache = getLocalCache();
        const updatedCache = currentCache.filter(obs => obs.id !== id);
        setLocalCache(updatedCache);
        return;
    }

    const { error } = await supabase
        .from('observations')
        .delete()
        .eq('id', id);

    if (error) {
        console.error('Error deleting observation:', error);
        throw new Error(error.message);
    }

    // Update cache
    const currentCache = getLocalCache();
    const updatedCache = currentCache.filter(obs => obs.id !== id);
    setLocalCache(updatedCache);
};

export const syncObservations = async (observations: Observation[]): Promise<void> => {
    // Legacy bulk import, keeping it simple for now
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('User not authenticated');

    const rows = observations.map(obs => mapToRow(obs, user.id));

    const { error } = await supabase
        .from('observations')
        .upsert(rows);

    if (error) {
        console.error('Error syncing observations:', error);
        throw new Error(error.message);
    }
};

export const uploadPhoto = async (file: Blob): Promise<string> => {
    if (!navigator.onLine) {
        throw new Error("Impossible d'envoyer une photo en mode hors-ligne. Veuillez réessayer une fois connecté.");
    }

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('User not authenticated');

    const fileName = `${user.id}/${Date.now()}.jpg`;
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

// Background Sync Function (to be called when online)
export const processOfflineQueue = async () => {
    if (!navigator.onLine) return;

    const queue = JSON.parse(localStorage.getItem(QUEUE_KEY) || '[]');
    if (queue.length === 0) return;

    console.log(`Processing ${queue.length} offline actions...`);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const newQueue = [];

    for (const item of queue) {
        try {
            if (item.action === 'INSERT') {
                // Remove temp ID if needed, or handle it. 
                // For now, we just insert. If ID was temp, Supabase generates new one.
                // Issue: Optimistic UI has temp ID. We might need to reload data after sync.

                // If id starts with temp-, remove it to let DB generate UUID
                const row = mapToRow(item.payload, user.id);
                if (String(id).startsWith('temp-')) {
                    await supabase.from('observations').insert(row);
                } else {
                    await supabase.from('observations').upsert(row);
                }
            } else if (item.action === 'UPDATE') {
                const row = mapToRow(item.payload, user.id);
                await supabase.from('observations').update(row).eq('id', item.payload.id);
            } else if (item.action === 'DELETE') {
                await supabase.from('observations').delete().eq('id', item.payload.id);
            }
        } catch (error) {
            console.error('Error processing queue item:', error);
            newQueue.push(item); // Keep failed items
        }
    }

    localStorage.setItem(QUEUE_KEY, JSON.stringify(newQueue));

    // Refresh cache from server after sync
    if (newQueue.length === 0) {
        const { data } = await supabase.from('observations').select('*').order('date', { ascending: false });
        if (data) {
            setLocalCache(data.map(mapToObservation));
        }
    }
};