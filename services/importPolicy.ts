import { Observation } from '../types';

export interface PlannedImportObservation {
    originalId: string;
    observation: Observation;
    mode: 'insert' | 'update';
    regeneratedId: boolean;
}

export type ImportConflictMode = 'merge' | 'no-overwrite';

export interface ImportPlanOptions {
    conflictMode?: ImportConflictMode;
}

import { isUuid, generateUUID } from '../utils/uuidUtils';

export const applyImportedObservationPolicy = (
    imported: Observation,
    knownIds: Set<string>,
    options: ImportPlanOptions = {}
): PlannedImportObservation => {
    const originalId = String(imported.id || '').trim();
    const hasValidId = isUuid(originalId);
    const conflictMode: ImportConflictMode = options.conflictMode ?? 'merge';
    const idAlreadyExists = hasValidId && knownIds.has(originalId);

    const nextId = (() => {
        if (!hasValidId) return generateUUID();
        // SI-28: Preserve valid non-conflicting UUIDs (identity preservation for re-imports)
        if (!idAlreadyExists) return originalId;
        if (conflictMode === 'merge') return originalId;
        return generateUUID();
    })();
    const mode: 'insert' | 'update' = knownIds.has(nextId) ? 'update' : 'insert';

    knownIds.add(nextId);

    return {
        originalId,
        observation: {
            ...imported,
            id: nextId
        },
        mode,
        regeneratedId: nextId !== originalId
    };
};

export const buildImportPersistencePlan = (
    importedObservations: Observation[],
    existingObservations: Observation[],
    options: ImportPlanOptions = {}
): PlannedImportObservation[] => {
    const knownIds = new Set(existingObservations.map(obs => obs.id));
    return importedObservations.map(imported => applyImportedObservationPolicy(imported, knownIds, options));
};

// SR-19 : détection de doublons par contenu (même espèce, même date, même coordonnées GPS arrondies)
export interface ContentDuplicate {
    key: string;
    incomingId: string;
    existingId: string;
}

const buildContentKey = (obs: Observation): string | null => {
    const species = (obs.speciesName || '').trim().toLowerCase();
    const date = (obs.date || '').trim();
    const lat = obs.gps?.lat;
    const lon = obs.gps?.lon;
    if (!species || !date || typeof lat !== 'number' || typeof lon !== 'number') return null;
    return `${species}|${date}|${lat.toFixed(5)}|${lon.toFixed(5)}`;
};

export const detectContentDuplicates = (
    incoming: Observation[],
    existing: Observation[]
): ContentDuplicate[] => {
    const existingByKey = new Map<string, string>();
    for (const obs of existing) {
        const key = buildContentKey(obs);
        if (key && !existingByKey.has(key)) existingByKey.set(key, obs.id);
    }
    const duplicates: ContentDuplicate[] = [];
    for (const obs of incoming) {
        const key = buildContentKey(obs);
        if (!key) continue;
        const existingId = existingByKey.get(key);
        if (existingId && existingId !== obs.id) {
            duplicates.push({ key, incomingId: obs.id, existingId });
        }
    }
    return duplicates;
};
