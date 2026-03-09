import { Observation } from '../types';

export interface StartupEnrichmentSelection {
    candidates: Observation[];
    skippedDueToMissingLatin: number;
}

export const selectStartupEnrichmentCandidates = (
    observations: Observation[],
    limit: number
): StartupEnrichmentSelection => {
    const observationsWithoutMedia = observations.filter(obs => !obs.photo && !obs.wikipediaImage);
    const skippedDueToMissingLatin = observationsWithoutMedia.filter(obs => !obs.latinName?.trim()).length;
    const safeLimit = Math.max(0, limit);

    const candidates = observationsWithoutMedia
        .filter(obs => !!obs.latinName?.trim())
        .slice(0, safeLimit);

    return {
        candidates,
        skippedDueToMissingLatin
    };
};
