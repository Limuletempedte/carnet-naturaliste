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
