import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Age, Comportement, ObservationCondition, Protocol, Sexe, Status, TaxonomicGroup, WeatherCondition } from '../types';
import { CACHE_SCHEMA_VERSION, sanitizeCachedObservations } from '../services/storage/storageCacheValidation';

vi.mock('../supabaseClient', () => ({
    supabase: {
        from: vi.fn(),
        auth: { getUser: vi.fn(async () => ({ data: { user: { id: 'user-1' } } })) },
        storage: { from: vi.fn() }
    }
}));

const CACHE_KEY = 'local_observations_cache:user-1';

const makeObservation = (id: string) => ({
    id,
    speciesName: 'Mésange',
    latinName: 'Parus major',
    taxonomicGroup: TaxonomicGroup.BIRD,
    date: '2026-03-01',
    time: '12:00',
    count: 1,
    location: 'Parc',
    gps: { lat: null, lon: null },
    municipality: 'Paris',
    department: '75',
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
    weather: WeatherCondition.UNKNOWN
});

describe('sanitizeCachedObservations (helper pur)', () => {
    it('signale une racine non-tableau sans rien conserver', () => {
        expect(sanitizeCachedObservations({ foo: 'bar' })).toEqual({ observations: [], dropped: 0, invalidRoot: true });
        expect(sanitizeCachedObservations('texte')).toEqual({ observations: [], dropped: 0, invalidRoot: true });
        expect(sanitizeCachedObservations(null)).toEqual({ observations: [], dropped: 0, invalidRoot: true });
    });

    it('conserve les entrées valides et écarte seulement les inexploitables', () => {
        const valid = makeObservation('a1');
        const result = sanitizeCachedObservations([
            valid,
            null,                                   // pas un objet
            'texte',                                // pas un objet
            { id: '', speciesName: 'X', date: 'd' }, // id vide
            { id: 'b2', speciesName: '', date: 'd' }, // espèce vide
            { id: 'c3', speciesName: 'Y' },          // date manquante
        ]);
        expect(result.invalidRoot).toBe(false);
        expect(result.dropped).toBe(5);
        expect(result.observations).toHaveLength(1);
        expect(result.observations[0].id).toBe('a1');
    });

    it('normalise gps et count manquants (anciens schémas) sans écarter l’entrée', () => {
        const result = sanitizeCachedObservations([
            { id: 'a1', speciesName: 'Mésange', date: '2026-03-01' },
            { id: 'b2', speciesName: 'Pinson', date: '2026-03-02', gps: { lat: 48.85, lon: 2.35 }, count: 4 },
        ]);
        expect(result.dropped).toBe(0);
        expect(result.observations[0].gps).toEqual({ lat: null, lon: null });
        expect(result.observations[0].count).toBe(1);
        // Les valeurs déjà valides sont conservées telles quelles.
        expect(result.observations[1].gps).toEqual({ lat: 48.85, lon: 2.35 });
        expect(result.observations[1].count).toBe(4);
    });

    it('écarte un gps non numérique sans perdre l’observation', () => {
        const result = sanitizeCachedObservations([
            { id: 'a1', speciesName: 'Mésange', date: '2026-03-01', gps: { lat: 'nord', lon: Infinity } },
        ]);
        expect(result.dropped).toBe(0);
        expect(result.observations[0].gps).toEqual({ lat: null, lon: null });
    });
});

describe('cache local versionné (intégration via getObservations, offline)', () => {
    beforeEach(() => {
        vi.resetModules();
        localStorage.clear();
        vi.stubGlobal('navigator', { onLine: false });
    });

    it('lit un cache valide sans version stockée (migration douce v0 → lecture OK)', async () => {
        localStorage.setItem(CACHE_KEY, JSON.stringify([makeObservation('a1')]));
        const storageService = await import('../services/storageService');
        storageService.setStorageNamespace('user-1');

        const result = await storageService.getObservations();
        expect(result.source).toBe('cache');
        expect(result.observations).toHaveLength(1);
        expect(result.observations[0].id).toBe('a1');
    });

    it('ne garde que les entrées valides d’un cache partiellement corrompu', async () => {
        localStorage.setItem(CACHE_KEY, JSON.stringify([
            makeObservation('a1'),
            { pas: 'une observation' },
            makeObservation('b2'),
        ]));
        const storageService = await import('../services/storageService');
        storageService.setStorageNamespace('user-1');

        const result = await storageService.getObservations();
        expect(result.observations.map(o => o.id)).toEqual(['a1', 'b2']);
    });

    it('ignore un cache dont la racine n’est pas un tableau et notifie la corruption', async () => {
        localStorage.setItem(CACHE_KEY, JSON.stringify({ oops: true }));
        const corruptionListener = vi.fn();
        window.addEventListener('storage-corruption-detected', corruptionListener);

        const storageService = await import('../services/storageService');
        storageService.setStorageNamespace('user-1');

        const result = await storageService.getObservations();
        expect(result.observations).toEqual([]);
        expect(corruptionListener).toHaveBeenCalledTimes(1);
        window.removeEventListener('storage-corruption-detected', corruptionListener);
    });

    it('tolère une version de cache plus récente que l’app (retour arrière)', async () => {
        localStorage.setItem(CACHE_KEY, JSON.stringify([makeObservation('a1')]));
        localStorage.setItem(`${CACHE_KEY}_v`, String(CACHE_SCHEMA_VERSION + 5));
        const storageService = await import('../services/storageService');
        storageService.setStorageNamespace('user-1');

        const result = await storageService.getObservations();
        expect(result.observations).toHaveLength(1);
    });

    it('écrit la version du schéma à chaque écriture du cache', async () => {
        const storageService = await import('../services/storageService');
        storageService.setStorageNamespace('user-1');

        storageService.bulkUpsertObservationsInCache([makeObservation('a1') as never]);

        expect(localStorage.getItem(`${CACHE_KEY}_v`)).toBe(String(CACHE_SCHEMA_VERSION));
        expect(localStorage.getItem(`${CACHE_KEY}_ts`)).not.toBeNull();
    });

    it('clearScopedOfflineData supprime aussi les clés timestamp et version', async () => {
        localStorage.setItem(CACHE_KEY, '[]');
        localStorage.setItem(`${CACHE_KEY}_ts`, '123');
        localStorage.setItem(`${CACHE_KEY}_v`, '1');
        const storageService = await import('../services/storageService');

        storageService.clearScopedOfflineData('user-1');

        expect(localStorage.getItem(CACHE_KEY)).toBeNull();
        expect(localStorage.getItem(`${CACHE_KEY}_ts`)).toBeNull();
        expect(localStorage.getItem(`${CACHE_KEY}_v`)).toBeNull();
    });

    it('purge TTL : supprime cache, timestamp et version après 90 jours', async () => {
        localStorage.setItem(CACHE_KEY, JSON.stringify([makeObservation('a1')]));
        localStorage.setItem(`${CACHE_KEY}_ts`, String(Date.now() - 91 * 24 * 60 * 60 * 1000));
        localStorage.setItem(`${CACHE_KEY}_v`, '1');
        const storageService = await import('../services/storageService');
        storageService.setStorageNamespace('user-1');

        const result = await storageService.getObservations();
        expect(result.observations).toEqual([]);
        expect(localStorage.getItem(CACHE_KEY)).toBeNull();
        expect(localStorage.getItem(`${CACHE_KEY}_ts`)).toBeNull();
        expect(localStorage.getItem(`${CACHE_KEY}_v`)).toBeNull();
    });
});
