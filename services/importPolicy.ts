import { Observation } from '../types';

export interface PlannedImportObservation {
    originalId: string;
    observation: Observation;
    mode: 'insert' | 'update';
    regeneratedId: boolean;
}

import { isUuid } from '../utils/uuidUtils';

export const applyImportedObservationPolicy = (
    imported: Observation,
    knownIds: Set<string>
): PlannedImportObservation => {
    const originalId = String(imported.id || '').trim();
    const hasValidId = isUuid(originalId);
    const nextId = (hasValidId && knownIds.has(originalId)) ? originalId : crypto.randomUUID();
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
    existingObservations: Observation[]
): PlannedImportObservation[] => {
    const knownIds = new Set(existingObservations.map(obs => obs.id));
    return importedObservations.map(imported => applyImportedObservationPolicy(imported, knownIds));
};
