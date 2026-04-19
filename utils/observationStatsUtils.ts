import { TAXON_LOGOS } from '../constants';
import { Observation, TaxonomicGroup } from '../types';
import { normalizeSearchText } from './textUtils';

export interface TaxonSpeciesCard {
    taxonomicGroup: TaxonomicGroup;
    logo: string;
    speciesCount: number;
}

const getObservationSpeciesKey = (observation: Observation): string => {
    const rawSpeciesName = observation.speciesName || observation.latinName || '';
    return normalizeSearchText(rawSpeciesName);
};

export const buildTaxonSpeciesCards = (observations: Observation[]): TaxonSpeciesCard[] => {
    const uniqueSpeciesPerTaxon = new Map<TaxonomicGroup, Set<string>>();

    observations.forEach((observation) => {
        const logo = TAXON_LOGOS[observation.taxonomicGroup];
        if (!logo) return;

        const speciesKey = getObservationSpeciesKey(observation);
        if (!speciesKey) return;

        const taxonSet = uniqueSpeciesPerTaxon.get(observation.taxonomicGroup) ?? new Set<string>();
        taxonSet.add(speciesKey);
        uniqueSpeciesPerTaxon.set(observation.taxonomicGroup, taxonSet);
    });

    return (Object.entries(TAXON_LOGOS) as Array<[TaxonomicGroup, string]>)
        .filter(([, logo]) => Boolean(logo))
        .map(([taxonomicGroup, logo]) => ({
            taxonomicGroup,
            logo,
            speciesCount: uniqueSpeciesPerTaxon.get(taxonomicGroup)?.size ?? 0
        }))
        .filter((card) => card.speciesCount > 0);
};

// VP-22 — Streaks (séries de jours consécutifs avec observation)
// Utilise obs.date au format ISO local YYYY-MM-DD (stocké tel quel dans Observation).
// Algorithme tolérant au fuseau horaire : pas de conversion UTC.

const MS_PER_DAY = 86_400_000;

const parseLocalDate = (iso: string): Date | null => {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
    if (!m) return null;
    const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    return Number.isFinite(d.getTime()) ? d : null;
};

const toLocalDateKey = (d: Date): string => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
};

const diffInDays = (a: Date, b: Date): number => {
    const aMid = new Date(a.getFullYear(), a.getMonth(), a.getDate()).getTime();
    const bMid = new Date(b.getFullYear(), b.getMonth(), b.getDate()).getTime();
    return Math.round((aMid - bMid) / MS_PER_DAY);
};

const collectUniqueDates = (observations: Observation[]): Date[] => {
    const seen = new Set<string>();
    const result: Date[] = [];
    observations.forEach(obs => {
        const d = parseLocalDate(obs.date);
        if (!d) return;
        const key = toLocalDateKey(d);
        if (seen.has(key)) return;
        seen.add(key);
        result.push(d);
    });
    return result;
};

export const computeCurrentStreak = (observations: Observation[], today: Date = new Date()): number => {
    const dates = collectUniqueDates(observations).sort((a, b) => b.getTime() - a.getTime());
    if (dates.length === 0) return 0;

    const mostRecent = dates[0];
    const gapFromToday = diffInDays(today, mostRecent);
    if (gapFromToday > 1) return 0; // rupture > 1 jour → série cassée

    let streak = 1;
    for (let i = 1; i < dates.length; i++) {
        const gap = diffInDays(dates[i - 1], dates[i]);
        if (gap === 1) {
            streak += 1;
        } else {
            break;
        }
    }
    return streak;
};

export const computeLongestStreak = (observations: Observation[]): number => {
    const dates = collectUniqueDates(observations).sort((a, b) => a.getTime() - b.getTime());
    if (dates.length === 0) return 0;

    let longest = 1;
    let current = 1;
    for (let i = 1; i < dates.length; i++) {
        const gap = diffInDays(dates[i], dates[i - 1]);
        if (gap === 1) {
            current += 1;
            if (current > longest) longest = current;
        } else if (gap > 1) {
            current = 1;
        }
        // gap === 0 ne peut pas arriver grâce à collectUniqueDates
    }
    return longest;
};
