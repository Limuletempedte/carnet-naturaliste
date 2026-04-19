import { describe, expect, it, beforeEach } from 'vitest';
import {
    Age,
    Comportement,
    Observation,
    ObservationCondition,
    Protocol,
    Sexe,
    Status,
    TaxonomicGroup,
    WeatherCondition,
} from '../types';
import {
    computeEarnedBadgeIds,
    detectNewlyEarnedBadges,
    getPreviouslyEarnedBadgeIds,
    setPreviouslyEarnedBadgeIds,
    isBadgesSeeded,
    markBadgesSeeded,
    EARNED_BADGES_STORAGE_KEY,
    BADGES_SEED_FLAG_KEY,
} from '../utils/badgeUtils';

const makeObs = (overrides: Partial<Observation>): Observation => ({
    id: overrides.id ?? 'obs-default',
    speciesName: overrides.speciesName ?? 'Espèce',
    latinName: '',
    taxonomicGroup: TaxonomicGroup.BIRD,
    date: '2026-04-20',
    time: '10:00',
    count: 1,
    location: '',
    gps: { lat: null, lon: null },
    municipality: 'Commune',
    department: '',
    country: 'France',
    altitude: null,
    comment: '',
    status: Status.NE,
    atlasCode: '',
    protocol: Protocol.OPPORTUNIST,
    sexe: Sexe.UNKNOWN,
    age: Age.UNKNOWN,
    observationCondition: ObservationCondition.UNKNOWN,
    comportement: Comportement.UNKNOWN,
    weather: WeatherCondition.UNKNOWN,
    ...overrides,
});

beforeEach(() => {
    localStorage.clear();
});

describe('computeEarnedBadgeIds', () => {
    it('renvoie "beginner" après une première observation', () => {
        const earned = computeEarnedBadgeIds([makeObs({ id: '1' })]);
        expect(earned.has('beginner')).toBe(true);
        expect(earned.has('explorer')).toBe(false);
    });

    it('renvoie "explorer" à partir de 10 observations', () => {
        const obs = Array.from({ length: 10 }, (_, i) => makeObs({ id: `obs-${i}` }));
        const earned = computeEarnedBadgeIds(obs);
        expect(earned.has('explorer')).toBe(true);
    });
});

describe('detectNewlyEarnedBadges (VP-20)', () => {
    it('renvoie uniquement les badges qui passent de non-gagné à gagné', () => {
        setPreviouslyEarnedBadgeIds(new Set(['beginner']));
        const obs = Array.from({ length: 10 }, (_, i) => makeObs({ id: `obs-${i}` }));
        const newly = detectNewlyEarnedBadges(obs);
        const ids = newly.map(b => b.id);
        expect(ids).toContain('explorer');
        expect(ids).not.toContain('beginner');
    });

    it('renvoie [] si rien de nouveau', () => {
        const obs = [makeObs({ id: '1' })];
        setPreviouslyEarnedBadgeIds(new Set(['beginner']));
        const newly = detectNewlyEarnedBadges(obs);
        expect(newly).toEqual([]);
    });
});

describe('persistance localStorage', () => {
    it('fallback sur Set vide si le JSON stocké est corrompu', () => {
        localStorage.setItem(EARNED_BADGES_STORAGE_KEY, '{invalid json');
        expect(getPreviouslyEarnedBadgeIds().size).toBe(0);
    });

    it('markBadgesSeeded positionne le flag isBadgesSeeded', () => {
        expect(isBadgesSeeded()).toBe(false);
        markBadgesSeeded();
        expect(isBadgesSeeded()).toBe(true);
        expect(localStorage.getItem(BADGES_SEED_FLAG_KEY)).toBe('true');
    });

    it('setPreviouslyEarnedBadgeIds sérialise en array JSON', () => {
        setPreviouslyEarnedBadgeIds(new Set(['beginner', 'explorer']));
        const raw = localStorage.getItem(EARNED_BADGES_STORAGE_KEY);
        expect(raw).toBeTruthy();
        const parsed = JSON.parse(raw as string);
        expect(parsed).toEqual(expect.arrayContaining(['beginner', 'explorer']));
    });
});
