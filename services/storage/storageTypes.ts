import type { SessionContext } from '../sessionScope';
import { Observation } from '../../types';

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
    context?: SessionContext;
    itemIds?: string[];
    onProgress?: (current: number, total: number) => void;
}

export interface PersistenceOptions {
    context?: SessionContext;
    skipCache?: boolean;
}

export type SupabaseLikeError = {
    message?: string;
    code?: string;
    details?: string;
    hint?: string;
};

export interface ObservationRow {
    id: string;
    species_name: string;
    latin_name: string | null;
    taxonomic_group: Observation['taxonomicGroup'];
    date: string;
    time: string | null;
    count: number;
    male_count?: number | null;
    female_count?: number | null;
    unidentified_count?: number | null;
    location: string | null;
    gps_lat: number | null;
    gps_lon: number | null;
    municipality: string | null;
    department: string | null;
    country: string | null;
    altitude: number | null;
    comment: string | null;
    status: Observation['status'] | null;
    atlas_code: Observation['atlasCode'] | null;
    protocol: Observation['protocol'] | null;
    sexe: Observation['sexe'] | null;
    age: Observation['age'] | null;
    observation_condition: Observation['observationCondition'] | null;
    comportement: Observation['comportement'] | null;
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
