// Comparaison des réponses « note → fiche » aux champs attendus du jeu
// d'essai (tests/security/fixtures/ai-text-trial-note.json).
//
// Module pur, sans réseau : importé par le script d'essai
// (tests/security/ai-text-trial.mjs, sous Deno) et testé par Vitest
// (tests/noteTrialCompare.test.ts), pour qu'une comparaison trop indulgente
// (faux vert) ne revienne pas.
//
// Règles :
// - une valeur attendue peut être un tableau de réponses admises ; null dans
//   ce tableau admet le champ vide ; un champ absent de `expected` doit
//   rester vide ;
// - textes (espèce, lieu) : égalité après normalisation (casse, accents,
//   pluriel en -s/-x, article en tête pour un lieu), jamais une simple
//   inclusion ;
// - autres espèces : ensembles dédoublonnés ;
// - fuites : recherche sans casse ni accents dans les champs structurés.

import {
    NOTE_CHOICES,
    NOTE_DATE_KINDS,
    NOTE_FIELDS,
    type NoteChoiceField,
    type NoteDateExpr,
    type NoteField,
    type NoteOutput,
} from '../../supabase/functions/ai-text/logic.ts';

/** `remainder` n'est jamais comparé (texte libre, à lire). */
export const NOTE_COMPARED_FIELDS = NOTE_FIELDS.filter(field => field !== 'remainder');
export type ComparedField = Exclude<NoteField, 'remainder'>;

const STRING_FIELDS: readonly NoteField[] = ['speciesName', 'scientificName', 'time', 'location'];
const COUNT_FIELDS: readonly NoteField[] = ['count', 'maleCount', 'femaleCount'];
const DATE_KEYS: Record<NoteDateExpr['kind'], (keyof NoteDateExpr)[]> = {
    none: [],
    relative_days: ['offsetDays'],
    last_weekday: ['weekday'],
    absolute: ['day', 'month', 'year'],
};
/** Espèces : le modèle en garde 5 au plus. */
const MAX_OTHER_SPECIES = 5;

export type Verdict = 'ok' | 'invente' | 'manque' | 'faux';

export interface NoteTrialItem {
    label: string;
    expected: Partial<Record<ComparedField, unknown>>;
    forbidden?: string[];
    /** Autres espèces : une partie de la liste attendue suffit (au moins une). */
    otherSpeciesPartial?: boolean;
}

export interface NoteComparison {
    verdicts: Record<ComparedField, Verdict>;
    leaks: string[];
    dropped: NoteField[];
}

/** Sans casse ni accents, apostrophes unifiées, blancs resserrés. */
export function foldText(value: string): string {
    return value.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/[’']/g, "'").replace(/\s+/g, ' ').trim();
}

/** Nom d'espèce : `foldText`, traits d'union comme espaces, pluriel en -s/-x retiré. */
export function normalizeName(value: string): string {
    return foldText(value).split(/[\s-]+/).filter(Boolean).map(word => word.replace(/(?<=..)[sx]$/, '')).join(' ');
}

/** Lieu : comme un nom, sans article en tête (« l'étang » = « étang »). */
export function normalizePlace(value: string): string {
    return normalizeName(foldText(value).replace(/^(?:l'|le |la |les )/, ''));
}

/**
 * Vérifie le bloc `expected` d'une entrée : champs connus, valeurs des listes
 * fermées, types, forme de la date. Lève une erreur au premier défaut.
 */
export function checkNoteExpected(item: unknown, file: string): asserts item is NoteTrialItem {
    const record = item as Record<string, unknown> | null;
    const where = `${file} « ${String(record?.label)} »`;
    const expected = record?.expected;
    if (typeof expected !== 'object' || expected === null || Array.isArray(expected)) throw new Error(`${where} : « expected » manquant`);
    for (const [field, value] of Object.entries(expected)) {
        if (!(NOTE_COMPARED_FIELDS as readonly string[]).includes(field)) throw new Error(`${where} : champ attendu inconnu « ${field} »`);
        const options = Array.isArray(value) && field !== 'otherSpecies' ? value : [value];
        for (const option of options) {
            if (option === null) continue;
            if (field in NOTE_CHOICES && !(NOTE_CHOICES[field as NoteChoiceField] as readonly string[]).includes(option)) {
                throw new Error(`${where} : « ${String(option)} » hors de la liste ${field}`);
            }
            if (COUNT_FIELDS.includes(field as NoteField) && !Number.isInteger(option)) throw new Error(`${where} : ${field} doit être un entier`);
            if (STRING_FIELDS.includes(field as NoteField) && typeof option !== 'string') throw new Error(`${where} : ${field} doit être un texte`);
            if (field === 'dateExpr' && !(NOTE_DATE_KINDS as readonly string[]).includes((option as { kind?: string })?.kind ?? '')) {
                throw new Error(`${where} : dateExpr.kind invalide`);
            }
            if (field === 'otherSpecies' && !(Array.isArray(option) && option.every(name => typeof name === 'string'))) {
                throw new Error(`${where} : otherSpecies doit être une liste de noms`);
            }
        }
    }
    const forbidden = record?.forbidden;
    if (forbidden !== undefined && !(Array.isArray(forbidden) && forbidden.every(f => typeof f === 'string' && f.length > 0))) {
        throw new Error(`${where} : « forbidden » doit être une liste de textes`);
    }
}

function isEmptyValue(field: ComparedField, value: unknown): boolean {
    if (field === 'dateExpr') return (value as NoteDateExpr).kind === 'none';
    return value === null;
}

function sameValue(field: ComparedField, expected: unknown, got: unknown): boolean {
    if (field === 'dateExpr') {
        const e = expected as Partial<NoteDateExpr>;
        const g = got as NoteDateExpr;
        return e.kind === g.kind && DATE_KEYS[g.kind].every(key => (e[key] ?? null) === g[key]);
    }
    if (field === 'location') return normalizePlace(expected as string) === normalizePlace(got as string);
    if (field === 'speciesName') return normalizeName(expected as string) === normalizeName(got as string);
    return expected === got;
}

function judgeOtherSpecies(item: NoteTrialItem, got: string[]): Verdict {
    const expected = new Set(((item.expected.otherSpecies as string[] | undefined) ?? []).map(normalizeName));
    const names = new Set(got.map(normalizeName));
    if (expected.size === 0) return names.size === 0 ? 'ok' : 'invente';
    if ([...names].some(name => !expected.has(name))) return 'faux';
    if (item.otherSpeciesPartial) return names.size >= 1 ? 'ok' : 'manque';
    return names.size === Math.min(expected.size, MAX_OTHER_SPECIES) ? 'ok' : 'manque';
}

/** Verdict d'un champ : ok, inventé, manqué ou faux. */
export function judgeField(item: NoteTrialItem, field: ComparedField, got: unknown): Verdict {
    if (field === 'otherSpecies') return judgeOtherSpecies(item, got as string[]);
    const raw = item.expected[field];
    const options: unknown[] = raw === undefined ? [null] : (Array.isArray(raw) ? raw : [raw]);
    const isNone = (o: unknown) => field === 'dateExpr' && (o as { kind?: string } | null)?.kind === 'none';
    const emptyAllowed = options.some(o => o === null || isNone(o));
    if (isEmptyValue(field, got)) return emptyAllowed ? 'ok' : 'manque';
    const filled = options.filter(o => o !== null && !isNone(o));
    if (filled.length === 0) return 'invente';
    return filled.some(o => sameValue(field, o, got)) ? 'ok' : 'faux';
}

/** Compare une réponse de note aux champs attendus de l'entrée. */
export function compareNote(item: NoteTrialItem, result: NoteOutput): NoteComparison {
    const verdicts = Object.fromEntries(
        NOTE_COMPARED_FIELDS.map(field => [field, judgeField(item, field, result[field])]),
    ) as Record<ComparedField, Verdict>;
    const structured = foldText(JSON.stringify(Object.fromEntries(NOTE_COMPARED_FIELDS.map(f => [f, result[f]]))));
    const leaks = (item.forbidden ?? []).filter(word => structured.includes(foldText(word)));
    return { verdicts, leaks, dropped: result.dropped ?? [] };
}
