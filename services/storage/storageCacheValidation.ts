import { Observation } from '../../types';

/**
 * Versionnage + validation de forme du cache local d'observations.
 *
 * Le cache (`local_observations_cache:{userId}`) est du JSON écrit par des versions
 * successives de l'app : après un déploiement, sa forme peut ne plus correspondre au
 * code qui le lit. Principe « migration douce » : on garde tout ce qui est valide,
 * on n'écarte que les entrées inexploitables — on n'efface jamais des observations
 * valides en bloc.
 */

/**
 * Version du schéma du cache local. À incrémenter si la forme des observations
 * cachées change de façon incompatible (avec, alors, une migration dédiée ici).
 * v1 = première version versionnée (schéma courant).
 */
export const CACHE_SCHEMA_VERSION = 1;

export interface CacheValidationResult {
    /** Entrées valides (éventuellement normalisées). */
    observations: Observation[];
    /** Nombre d'entrées écartées car inexploitables. */
    dropped: number;
    /** Vrai si la racine n'était pas un tableau (cache inexploitable en bloc). */
    invalidRoot: boolean;
}

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
    typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * Garde minimale : une entrée de cache est exploitable si elle a un id, un nom
 * d'espèce et une date (les champs dont l'app et la file de sync ont besoin).
 * Les autres champs sont tolérés manquants (anciens schémas) et normalisés.
 */
const isUsableCachedObservation = (value: Record<string, unknown>): boolean =>
    typeof value.id === 'string' && value.id.trim() !== ''
    && typeof value.speciesName === 'string' && value.speciesName.trim() !== ''
    && typeof value.date === 'string' && value.date.trim() !== '';

/** Normalise les champs dont l'absence ferait planter l'app (gps.lat/lon lus partout). */
const normalizeCachedObservation = (value: Record<string, unknown>): Observation => {
    const gps = isPlainObject(value.gps) ? value.gps : {};
    return {
        ...value,
        gps: {
            lat: typeof gps.lat === 'number' && Number.isFinite(gps.lat) ? gps.lat : null,
            lon: typeof gps.lon === 'number' && Number.isFinite(gps.lon) ? gps.lon : null,
        },
        count: typeof value.count === 'number' && Number.isFinite(value.count) ? value.count : 1,
    } as unknown as Observation;
};

/** Valide/normalise le contenu brut du cache local (JSON déjà parsé). */
export const sanitizeCachedObservations = (raw: unknown): CacheValidationResult => {
    if (!Array.isArray(raw)) {
        return { observations: [], dropped: 0, invalidRoot: true };
    }

    const observations: Observation[] = [];
    let dropped = 0;
    for (const entry of raw) {
        if (isPlainObject(entry) && isUsableCachedObservation(entry)) {
            observations.push(normalizeCachedObservation(entry));
        } else {
            dropped += 1;
        }
    }
    return { observations, dropped, invalidRoot: false };
};
