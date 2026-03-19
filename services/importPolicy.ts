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

import { isUuid } from '../utils/uuidUtils';

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
        if (!hasValidId) return crypto.randomUUID();
        if (!idAlreadyExists) return crypto.randomUUID();
        if (conflictMode === 'merge') return originalId;
        return crypto.randomUUID();
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
