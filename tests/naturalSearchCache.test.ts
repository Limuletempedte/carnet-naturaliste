import { beforeEach, describe, expect, it } from 'vitest';
import { ACCOUNT_SCOPED_STORAGE_PREFIXES } from '../services/accountService';
import {
    NATURAL_SEARCH_CACHE_MAX,
    NATURAL_SEARCH_CACHE_PREFIX,
    NATURAL_SEARCH_CACHE_VERSION,
    clearNaturalSearchCache,
    naturalSearchCachePurges,
    readCachedSearch,
    rememberSearch,
} from '../services/naturalSearchCache';
import { captureSessionContext, setSessionIdentity } from '../services/sessionScope';
import { emptyCriteria, type SearchCriteria } from '../utils/aiSearchFilters';
import { TAXON_CATEGORIES_VERSION } from '../utils/taxonCategories';

const criteria = (overrides: Partial<SearchCriteria> = {}): SearchCriteria => ({ ...emptyCriteria(), ...overrides });

describe('cache des phrases comprises', () => {
    beforeEach(() => {
        localStorage.clear();
        setSessionIdentity('user-1');
    });

    it('garde les critères par personne, clé normalisée, et les relit', () => {
        rememberSearch('Les rapaces vus en MAI !', criteria({ categories: ['rapaces_diurnes'] }), captureSessionContext());
        expect(readCachedSearch('les rapaces vus en mai')?.categories).toEqual(['rapaces_diurnes']);
        expect(localStorage.getItem(`${NATURAL_SEARCH_CACHE_PREFIX}:user-1`)).not.toBeNull();
        setSessionIdentity('user-2');
        expect(readCachedSearch('les rapaces vus en mai')).toBeNull();
    });

    it('forme relative seulement : ni date calculée, ni position', () => {
        rememberSearch('près de chez moi le mois dernier', criteria({
            period: { kind: 'last_month', days: null, month: null, season: null, yearScope: null },
            near: { kind: 'current_position', placeName: null, radiusKm: 10, lat: 45.1, lon: 1.2 } as SearchCriteria['near'],
        }), captureSessionContext());
        const raw = localStorage.getItem(`${NATURAL_SEARCH_CACHE_PREFIX}:user-1`) ?? '';
        expect(raw).toContain('last_month');
        expect(raw).not.toContain('45.1');
        expect(raw).not.toMatch(/\d{4}-\d{2}-\d{2}/);
    });

    it('versionné avec le dictionnaire des catégories : une autre version est ignorée', () => {
        expect(NATURAL_SEARCH_CACHE_VERSION).toContain(String(TAXON_CATEGORIES_VERSION));
        localStorage.setItem(`${NATURAL_SEARCH_CACHE_PREFIX}:user-1`, JSON.stringify({
            version: '1-categories-1',
            entries: [{ key: 'les canards', criteria: criteria({ categories: ['canards'] }) }],
        }));
        expect(readCachedSearch('les canards')).toBeNull();
    });

    it('garde les 50 dernières phrases', () => {
        const context = captureSessionContext();
        for (let i = 0; i < NATURAL_SEARCH_CACHE_MAX + 5; i += 1) rememberSearch(`phrase ${i}`, criteria({ text: `mot${i}` }), context);
        const stored = JSON.parse(localStorage.getItem(`${NATURAL_SEARCH_CACHE_PREFIX}:user-1`) ?? '{}');
        expect(stored.entries).toHaveLength(50);
        expect(readCachedSearch('phrase 54')?.text).toBe('mot54');
        expect(readCachedSearch('phrase 0')).toBeNull();
    });

    it('une entrée abîmée est relue comme une réponse du serveur : rien d’inconnu n’est appliqué', () => {
        localStorage.setItem(`${NATURAL_SEARCH_CACHE_PREFIX}:user-1`, JSON.stringify({
            version: NATURAL_SEARCH_CACHE_VERSION,
            entries: [{ key: 'x y', criteria: { groups: ['Dragons'], text: '<script>' } }],
        }));
        const read = readCachedSearch('x y');
        expect(read?.groups).toEqual([]);
        expect(read?.text).toBeNull();
        expect(read?.dropped).toEqual(['groups', 'text']);
        localStorage.setItem(`${NATURAL_SEARCH_CACHE_PREFIX}:user-1`, '{pas du json');
        expect(readCachedSearch('x y')).toBeNull();
    });

    it('effacé au retrait de l’accord, et avec le compte', () => {
        const context = captureSessionContext();
        rememberSearch('les canards', criteria({ categories: ['canards'] }), context);
        clearNaturalSearchCache(context);
        expect(readCachedSearch('les canards')).toBeNull();
        expect(ACCOUNT_SCOPED_STORAGE_PREFIXES).toContain(NATURAL_SEARCH_CACHE_PREFIX);
    });

    it('une réponse partie avant le retrait de l’accord ne remplit pas de nouveau le cache', () => {
        const context = captureSessionContext();
        const before = naturalSearchCachePurges();
        clearNaturalSearchCache(context);
        rememberSearch('les canards', criteria({ categories: ['canards'] }), context, before);
        expect(readCachedSearch('les canards')).toBeNull();
        rememberSearch('les canards', criteria({ categories: ['canards'] }), context, naturalSearchCachePurges());
        expect(readCachedSearch('les canards')?.categories).toEqual(['canards']);
    });
});
