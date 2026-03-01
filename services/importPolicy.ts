import { Observation } from '../types';

export interface PlannedImportObservation {
    originalId: string;
    observation: Observation;
    mode: 'insert' | 'update';
    regeneratedId: boolean;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const isUuid = (value: unknown): value is string => {
    return typeof value === 'string' && UUID_RE.test(value.trim());
};

export const applyImportedObservationPolicy = (
    imported: Observation,
    knownIds: Set<string>
): PlannedImportObservation => {
    const originalId = String(imported.id || '').trim();
    const hasValidId = isUuid(originalId);
    const nextId = hasValidId ? originalId : crypto.randomUUID();
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
