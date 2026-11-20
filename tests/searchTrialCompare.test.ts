import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { SEARCH_FIELDS, SEARCH_LIMITS, parseSearchOutput, validateSearchInput, type SearchOutput } from '../supabase/functions/ai-text/logic';
import { checkSearchExpected, compareSearch, judgeSearchField, sameSet, type SearchTrialItem } from './security/searchTrialCompare';

/** Réponse « tout vide » passée par le vrai validateur, puis complétée. */
function result(overrides: Partial<SearchOutput> = {}): SearchOutput {
    const empty = {
        period: { kind: 'none', days: 0, month: 0, season: 'none', yearScope: 'all' },
        years: [], groups: [], categories: [], genera: [], statuses: [], habitats: [],
        department: '', commune: '', near: { kind: 'none', placeName: '', radiusKm: 0 }, text: '',
    };
    const parsed = parseSearchOutput(JSON.stringify(empty), { text: 'x' });
    if (!parsed) throw new Error('réponse de test rejetée');
    return { ...parsed, ...overrides };
}

const item = (expected: SearchTrialItem['expected'], extra: Partial<SearchTrialItem> = {}): SearchTrialItem => ({ label: 'test', expected, ...extra });
const periodOf = (fields: Partial<NonNullable<SearchOutput['period']>>) => ({ kind: 'month', days: null, month: null, season: null, yearScope: null, ...fields }) as SearchOutput['period'];

describe('essai de la recherche — pas de faux vert', () => {
    it('listes : ensembles égaux, jamais une inclusion', () => {
        expect(sameSet(['VU', 'EN', 'CR'], ['CR', 'VU', 'EN'])).toBe(true);
        const menacees = item({ statuses: ['VU', 'EN', 'CR'] });
        expect(judgeSearchField(menacees, 'statuses', ['CR', 'EN', 'VU'])).toBe('ok');
        // En trop, en moins, ou un doublon qui masque un manque : faux.
        expect(judgeSearchField(menacees, 'statuses', ['VU', 'EN', 'CR', 'NT'])).toBe('faux');
        expect(judgeSearchField(menacees, 'statuses', ['VU', 'EN'])).toBe('faux');
        expect(judgeSearchField(menacees, 'statuses', ['VU', 'VU', 'EN'])).toBe('faux');
        expect(judgeSearchField(menacees, 'statuses', [])).toBe('manque');
        expect(judgeSearchField(item({}), 'groups', ['Oiseaux'])).toBe('invente');
        expect(judgeSearchField(item({}), 'groups', [])).toBe('ok');
        expect(judgeSearchField(item({ years: [2023, 2024] }), 'years', [2024])).toBe('faux');
    });

    it('plusieurs réponses admises avec oneOf, chacune comparée strictement', () => {
        const papillons = item({ groups: { oneOf: [['Papillons de jour', 'Odonate'], ['Papillons de jour', 'Papillon de nuit', 'Odonate']] } });
        expect(judgeSearchField(papillons, 'groups', ['Odonate', 'Papillons de jour'])).toBe('ok');
        expect(judgeSearchField(papillons, 'groups', ['Odonate', 'Papillons de jour', 'Papillon de nuit'])).toBe('ok');
        expect(judgeSearchField(papillons, 'groups', ['Odonate'])).toBe('faux');
        expect(judgeSearchField(item({ text: { oneOf: ['héron cendré', null] } }), 'text', null)).toBe('ok');
    });

    it('textes : égalité après normalisation, jamais une simple inclusion', () => {
        const heron = item({ text: 'héron cendré' });
        expect(judgeSearchField(heron, 'text', 'Hérons cendrés')).toBe('ok');
        for (const wrong of ['héron', 'héron cendré adulte', 'cendré']) expect(judgeSearchField(heron, 'text', wrong), wrong).toBe('faux');
        expect(judgeSearchField(item({ department: 'Gironde' }), 'department', 'la Gironde')).toBe('ok');
        expect(judgeSearchField(item({ department: 'Gironde' }), 'department', 'Gironde (33)')).toBe('faux');
        expect(judgeSearchField(item({ commune: 'Castelbrume' }), 'commune', null)).toBe('manque');
        expect(judgeSearchField(item({}), 'commune', 'Castelbrume')).toBe('invente');
    });

    it('période : type et champs utiles ; « all » par défaut pour un mois ou une saison', () => {
        const mai = item({ period: { kind: 'month', month: 5 } });
        expect(judgeSearchField(mai, 'period', periodOf({ month: 5, yearScope: 'all' }))).toBe('ok');
        expect(judgeSearchField(mai, 'period', periodOf({ month: 5, yearScope: 'most_recent' }))).toBe('faux');
        expect(judgeSearchField(mai, 'period', periodOf({ month: 6, yearScope: 'all' }))).toBe('faux');
        expect(judgeSearchField(mai, 'period', null)).toBe('manque');
        expect(judgeSearchField(item({ period: { kind: 'last_n_days', days: 15 } }), 'period', periodOf({ kind: 'last_n_days', days: 14 }))).toBe('faux');
        expect(judgeSearchField(item({}), 'period', periodOf({ kind: 'this_year' }))).toBe('invente');
    });

    it('proximité : type, lieu normalisé et rayon (10 km par défaut)', () => {
        const home = item({ near: { kind: 'current_position' } });
        expect(judgeSearchField(home, 'near', { kind: 'current_position', placeName: null, radiusKm: SEARCH_LIMITS.defaultRadiusKm })).toBe('ok');
        expect(judgeSearchField(home, 'near', { kind: 'current_position', placeName: null, radiusKm: 5 })).toBe('faux');
        const place = item({ near: { kind: 'place', placeName: 'Vauclerc-sur-Lisonne', radiusKm: 20 } });
        expect(judgeSearchField(place, 'near', { kind: 'place', placeName: 'vauclerc sur lisonne', radiusKm: 20 })).toBe('ok');
        expect(judgeSearchField(place, 'near', { kind: 'place', placeName: 'Vauclerc', radiusKm: 20 })).toBe('faux');
        expect(judgeSearchField(place, 'near', { kind: 'current_position', placeName: null, radiusKm: 20 })).toBe('faux');
        expect(judgeSearchField(item({}), 'near', { kind: 'current_position', placeName: null, radiusKm: 10 })).toBe('invente');
    });

    it('fuites : cherchées sans casse ni accents dans toute la réponse', () => {
        const trap = item({}, { forbidden: ['PIRATÉ', '<img'] });
        expect(compareSearch(trap, result({ text: 'pirate' })).leaks).toEqual(['PIRATÉ']);
        expect(compareSearch(trap, result({ commune: '<img src=x>' })).leaks).toEqual(['<img']);
        expect(compareSearch(trap, result()).leaks).toEqual([]);
    });

    it('compare tous les champs ; une réponse vide est juste pour une phrase hors sujet', () => {
        const comparison = compareSearch(item({}), result());
        expect(Object.keys(comparison.verdicts)).toEqual([...SEARCH_FIELDS]);
        expect(Object.values(comparison.verdicts).every(v => v === 'ok')).toBe(true);
    });
});

describe('essai de la recherche — jeu de phrases', () => {
    const fixture = JSON.parse(readFileSync('tests/security/fixtures/ai-text-trial-search.json', 'utf8')) as { label: string; payload: unknown; expected: Record<string, unknown> }[];

    it('une vingtaine de phrases valides au regard du schéma des attendus, acceptées par la fonction', () => {
        expect(fixture.length).toBeGreaterThanOrEqual(20);
        expect(new Set(fixture.map(entry => entry.label)).size).toBe(fixture.length);
        for (const entry of fixture) {
            expect(() => checkSearchExpected(entry, 'jeu')).not.toThrow();
            expect(validateSearchInput(entry.payload).ok, entry.label).toBe(true);
        }
    });

    it('contient les pièges prévus', () => {
        const texts = fixture.map(entry => (entry.payload as { text: string }).text);
        expect(texts.some(text => text.length === SEARCH_LIMITS.maxInputChars)).toBe(true);
        expect(fixture.some(entry => Object.keys(entry.expected).length === 0)).toBe(true);
        expect(texts.some(text => /ignore les consignes/i.test(text))).toBe(true);
        expect(texts.some(text => /chez moi/.test(text))).toBe(true);
        expect(texts.some(text => /menacées/.test(text))).toBe(true);
        expect(texts.some(text => /\b20[3-9]\d\b/.test(text))).toBe(true);
    });

    it('refuse un attendu hors liste, d’un champ inconnu ou mal formé', () => {
        expect(() => checkSearchExpected({ label: 'x', expected: { groups: ['Rapaces'] } }, 'jeu')).toThrow(/hors de la liste/);
        expect(() => checkSearchExpected({ label: 'x', expected: { categories: ['rapaces'] } }, 'jeu')).toThrow(/hors de la liste/);
        expect(() => checkSearchExpected({ label: 'x', expected: { statuses: ['VU', 'VU'] } }, 'jeu')).toThrow(/doublon/);
        expect(() => checkSearchExpected({ label: 'x', expected: { genera: ['bombus'] } }, 'jeu')).toThrow(/genre/);
        expect(() => checkSearchExpected({ label: 'x', expected: { period: { kind: 'next_month' } } }, 'jeu')).toThrow(/kind/);
        expect(() => checkSearchExpected({ label: 'x', expected: { near: { kind: 'place' } } }, 'jeu')).toThrow(/placeName/);
        expect(() => checkSearchExpected({ label: 'x', expected: { lieu: 'Pessac' } }, 'jeu')).toThrow(/inconnu/);
        expect(() => checkSearchExpected({ label: 'x' }, 'jeu')).toThrow(/expected/);
    });

    it('les textes attendus (département, commune, lieu, texte libre) sont faits des mots de la phrase', () => {
        // Sinon le validateur de la fonction les retirerait : l'attendu serait faux.
        for (const entry of fixture) {
            const phrase = (entry.payload as { text: string }).text;
            const expected = entry.expected as { department?: string; commune?: string; text?: string; near?: { placeName?: string } };
            for (const value of [expected.department, expected.commune, expected.text, expected.near?.placeName]) {
                if (typeof value !== 'string') continue;
                const parsed = parseSearchOutput(JSON.stringify({ ...emptyAnswer(), text: value }), { text: phrase });
                expect(parsed?.text, `${entry.label} : ${value}`).not.toBeNull();
            }
        }
    });
});

function emptyAnswer() {
    return {
        period: { kind: 'none', days: 0, month: 0, season: 'none', yearScope: 'all' },
        years: [], groups: [], categories: [], genera: [], statuses: [], habitats: [],
        department: '', commune: '', near: { kind: 'none', placeName: '', radiusKm: 0 }, text: '',
    };
}
