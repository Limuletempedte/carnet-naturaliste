import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { NOTE_FIELDS, NOTE_UNKNOWN_CHOICE, parseNoteOutput, type NoteOutput } from '../supabase/functions/ai-text/logic';
import {
    NOTE_COMPARED_FIELDS,
    checkNoteExpected,
    compareNote,
    judgeField,
    normalizeName,
    normalizePlace,
    type NoteTrialItem,
} from './security/noteTrialCompare';

/** Réponse « tout vide » passée par le vrai validateur, puis complétée. */
function result(overrides: Partial<NoteOutput> = {}): NoteOutput {
    const empty = {
        speciesName: '', scientificName: '', count: 0, maleCount: 0, femaleCount: 0,
        dateExpr: { kind: 'none', offsetDays: 0, weekday: 0, day: 0, month: 0, year: 0 },
        time: '', location: '', weather: NOTE_UNKNOWN_CHOICE, habitat: NOTE_UNKNOWN_CHOICE,
        comportement: NOTE_UNKNOWN_CHOICE, observationCondition: NOTE_UNKNOWN_CHOICE, age: NOTE_UNKNOWN_CHOICE,
        sexe: NOTE_UNKNOWN_CHOICE, phenology: NOTE_UNKNOWN_CHOICE, otherSpecies: [], remainder: '',
    };
    const parsed = parseNoteOutput(JSON.stringify(empty), { text: 'x' });
    if (!parsed) throw new Error('réponse de test rejetée');
    return { ...parsed, ...overrides };
}

const item = (expected: NoteTrialItem['expected'], extra: Partial<NoteTrialItem> = {}): NoteTrialItem => ({ label: 'test', expected, ...extra });

describe('essai de la note — normalisation', () => {
    it('ignore casse, accents, pluriel et traits d’union pour un nom', () => {
        expect(normalizeName('Étourneaux sansonnets')).toBe(normalizeName('étourneau sansonnet'));
        expect(normalizeName('Martin-pêcheur')).toBe(normalizeName('martin pecheur'));
        expect(normalizeName('Mésange bleue')).not.toBe(normalizeName('Mésange charbonnière'));
    });

    it('ignore l’article en tête d’un lieu, pas le reste', () => {
        expect(normalizePlace("l'étang de la Brosse")).toBe(normalizePlace('Étang de la Brosse'));
        expect(normalizePlace('la ferme des Ormes')).toBe(normalizePlace('ferme des Ormes'));
        expect(normalizePlace('bord de l’étang de la Brosse')).not.toBe(normalizePlace('étang de la Brosse'));
    });
});

describe('essai de la note — pas de faux vert', () => {
    it('lieu : égalité après normalisation, jamais une simple inclusion', () => {
        const expected = item({ location: 'étang de la Brosse' });
        expect(judgeField(expected, 'location', "l'étang de la Brosse")).toBe('ok');
        for (const wrong of ['la', 'étang', 'étang de la Brosse, Saint-Inventé', 'Brosse']) {
            expect(judgeField(expected, 'location', wrong), wrong).toBe('faux');
        }
        // Une des variantes listées par le jeu.
        expect(judgeField(item({ location: ['lac de Merlaine', 'roselière du lac de Merlaine'] }), 'location', 'Roselière du lac de Merlaine')).toBe('ok');
    });

    it('autres espèces : ensembles dédoublonnés, une espèce manquante n’est pas cachée par un doublon', () => {
        const expected = item({ otherSpecies: ['Héron cendré', 'Aigrette garzette', 'Grèbe castagneux', 'Martin-pêcheur'] });
        expect(judgeField(expected, 'otherSpecies', ['hérons cendrés', 'Aigrette garzette', 'Grèbe castagneux', 'Martin pêcheur'])).toBe('ok');
        expect(judgeField(expected, 'otherSpecies', ['Héron cendré', 'Héron cendré', 'Aigrette garzette', 'Grèbe castagneux'])).toBe('manque');
        expect(judgeField(expected, 'otherSpecies', ['Héron cendré', 'Aigrette garzette', 'Grèbe castagneux', 'Martin-pêcheur', 'Pic vert'])).toBe('faux');
        expect(judgeField(expected, 'otherSpecies', [])).toBe('manque');
        expect(judgeField(item({}), 'otherSpecies', ['Pic vert'])).toBe('invente');
        expect(judgeField(item({}), 'otherSpecies', [])).toBe('ok');
    });

    it('autres espèces en mode partiel : au moins un nom, tous attendus ; liste vide = manqué', () => {
        const partial = item({ otherSpecies: ['Rousserolle verderolle', 'Foulque', 'Grèbe huppé'] }, { otherSpeciesPartial: true });
        expect(judgeField(partial, 'otherSpecies', ['foulques'])).toBe('ok');
        expect(judgeField(partial, 'otherSpecies', ['Foulque', 'Foulque'])).toBe('ok');
        expect(judgeField(partial, 'otherSpecies', [])).toBe('manque');
        expect(judgeField(partial, 'otherSpecies', ['Foulque', 'Cygne tuberculé'])).toBe('faux');
    });

    it('fuites : trouvées sans tenir compte des accents ni de la casse', () => {
        const trap = item({}, { forbidden: ['PIRATÉ', 'Gaspard'] });
        expect(compareNote(trap, result({ location: 'PIRATE' })).leaks).toEqual(['PIRATÉ']);
        expect(compareNote(trap, result({ speciesName: 'gaspard' })).leaks).toEqual(['Gaspard']);
        // Le reste de la note n'est pas un champ structuré.
        expect(compareNote(trap, result({ remainder: 'Avec Gaspard, piraté' })).leaks).toEqual([]);
    });

    it('un champ retiré par le validateur a son verdict « retiré », jamais « juste »', () => {
        const comparison = compareNote(item({}), result({ dropped: ['time', 'remainder'] }));
        expect(comparison.verdicts.time).toBe('retire');
        expect(comparison.verdicts.count).toBe('ok');
        expect(comparison.dropped).toEqual(['time', 'remainder']);
        expect(normalizeName('Héron garde-bœufs')).toBe(normalizeName('heron garde boeuf'));
    });

    it('vide attendu : un champ rempli est « inventé », un champ vide est juste', () => {
        const none = item({});
        expect(judgeField(none, 'time', '17:00')).toBe('invente');
        expect(judgeField(none, 'count', null)).toBe('ok');
        expect(judgeField(item({ count: [1, null] }), 'count', null)).toBe('ok');
        expect(judgeField(item({ count: 3 }), 'count', null)).toBe('manque');
        expect(judgeField(item({ count: 3 }), 'count', 4)).toBe('faux');
    });

    it('date : type et champs utiles comparés', () => {
        const yesterday = item({ dateExpr: { kind: 'relative_days', offsetDays: -1 } });
        const dateOf = (fields: object) => ({ kind: 'none', offsetDays: null, weekday: null, day: null, month: null, year: null, ...fields });
        expect(judgeField(yesterday, 'dateExpr', dateOf({ kind: 'relative_days', offsetDays: -1 }))).toBe('ok');
        expect(judgeField(yesterday, 'dateExpr', dateOf({ kind: 'relative_days', offsetDays: -2 }))).toBe('faux');
        expect(judgeField(yesterday, 'dateExpr', dateOf({}))).toBe('manque');
        expect(judgeField(item({}), 'dateExpr', dateOf({ kind: 'last_weekday', weekday: 2 }))).toBe('invente');
    });

    it('compare tous les champs sauf le reste de la note', () => {
        expect(NOTE_COMPARED_FIELDS).toEqual(NOTE_FIELDS.filter(field => field !== 'remainder'));
        const comparison = compareNote(item({}), result());
        expect(Object.values(comparison.verdicts).every(v => v === 'ok')).toBe(true);
    });
});

describe('essai de la note — jeu d’entrées', () => {
    const fixture = JSON.parse(readFileSync('tests/security/fixtures/ai-text-trial-note.json', 'utf8')) as unknown[];

    it('20 notes valides au regard du schéma des attendus', () => {
        expect(fixture).toHaveLength(20);
        for (const entry of fixture) expect(() => checkNoteExpected(entry, 'jeu')).not.toThrow();
    });

    it('refuse un attendu hors liste ou d’un champ inconnu', () => {
        expect(() => checkNoteExpected({ label: 'x', expected: { weather: 'Canicule' } }, 'jeu')).toThrow(/hors de la liste/);
        expect(() => checkNoteExpected({ label: 'x', expected: { observers: ['A'] } }, 'jeu')).toThrow(/inconnu/);
        expect(() => checkNoteExpected({ label: 'x', expected: { remainder: 'a' } }, 'jeu')).toThrow(/inconnu/);
        expect(() => checkNoteExpected({ label: 'x' }, 'jeu')).toThrow(/expected/);
    });

    it('les noms d’espèces attendus reprennent les mots de la note : faute évidente corrigée, ni traduction ni complément', () => {
        /** Distance d'édition (Levenshtein) entre deux mots. */
        const distance = (a: string, b: string): number => {
            let previous = Array.from({ length: b.length + 1 }, (_, j) => j);
            for (let i = 1; i <= a.length; i += 1) {
                const current = [i];
                for (let j = 1; j <= b.length; j += 1) {
                    current[j] = Math.min(previous[j] + 1, current[j - 1] + 1, previous[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
                }
                previous = current;
            }
            return previous[b.length];
        };
        // Chaque mot du nom attendu est un mot de la note, à une lettre près
        // (« buzard » → « busard ») : une traduction ou un complément
        // (« renard » → « renard roux ») n'y passe pas.
        const wordsOf = (value: string) => normalizeName(value).replace(/[^\p{L}\p{N}]+/gu, ' ').trim().split(' ');
        const fromNote = (text: string, name: string) => {
            const words = wordsOf(text);
            return wordsOf(name).every(word => words.some(w => distance(w, word) <= 1));
        };
        expect(fromNote('un buzard des roseaux', 'Busard des roseaux')).toBe(true);
        expect(fromNote('famille de renards', 'Renard roux')).toBe(false);
        expect(fromNote('two red kites', 'Milan royal')).toBe(false);
        const entries = fixture as { label: string; payload: { text: string }; expected: { speciesName?: unknown; otherSpecies?: unknown } }[];
        for (const { label, payload, expected } of entries) {
            const names = [expected.speciesName ?? [], expected.otherSpecies ?? []].flat(2);
            for (const name of names) {
                if (name === null) continue;
                expect(fromNote(payload.text, String(name)), `${label} : ${String(name)}`).toBe(true);
            }
        }
        // Seule la note dictée (12) a un nom corrigé.
        const corrected = entries.filter(({ payload, expected }) => typeof expected.speciesName === 'string'
            && !normalizeName(payload.text).includes(normalizeName(expected.speciesName)));
        expect(corrected.map(entry => entry.label)).toEqual(['12 fautes de dictée vocale']);
    });
});
