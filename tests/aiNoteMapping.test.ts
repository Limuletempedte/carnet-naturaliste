import { describe, expect, it } from 'vitest';
import type { AiNoteResult } from '../services/aiAssistService';
import type { ObservationFormData } from '../services/observationFormService';
import { Habitat, TaxonomicGroup, WeatherCondition } from '../types';
import {
    appendToComment,
    applyNoteFields,
    buildNoteProposals,
    commentContains,
    describeNoteDateExpr,
    findExactSpeciesMatch,
    initialNoteSelection,
    NOTE_PROPOSAL_ORDER,
    noteSpeciesQuery,
    resolveNoteDate,
    type NoteProposalKey,
} from '../utils/aiNoteMapping';
import { createEmptyFormData } from '../utils/observationFormHelpers';

const form = (overrides: Partial<ObservationFormData> = {}): ObservationFormData => ({
    ...createEmptyFormData(TaxonomicGroup.BIRD),
    date: '2026-11-20',
    time: '10:15',
    ...overrides,
});

const result = (overrides: Partial<AiNoteResult> = {}): AiNoteResult => ({
    speciesName: null, scientificName: null, count: null, maleCount: null, femaleCount: null,
    dateExpr: { kind: 'none' }, time: null, location: null, weather: null, habitat: null,
    comportement: null, observationCondition: null, age: null, sexe: null, phenology: null,
    otherSpecies: [], remainder: null, dropped: [],
    ...overrides,
});

const TODAY = '2026-11-20';

describe('resolveNoteDate — dates relatives', () => {
    it('ajoute le décalage à la date du formulaire', () => {
        expect(resolveNoteDate({ kind: 'relative_days', offsetDays: 0 }, '2026-11-20', TODAY)).toBe('2026-11-20');
        expect(resolveNoteDate({ kind: 'relative_days', offsetDays: -1 }, '2026-11-20', TODAY)).toBe('2026-11-19');
    });

    it('change de mois et d’année', () => {
        expect(resolveNoteDate({ kind: 'relative_days', offsetDays: -1 }, '2026-03-01', TODAY)).toBe('2026-02-28');
        expect(resolveNoteDate({ kind: 'relative_days', offsetDays: -1 }, '2024-03-01', TODAY)).toBe('2024-02-29');
        expect(resolveNoteDate({ kind: 'relative_days', offsetDays: -2 }, '2026-01-01', TODAY)).toBe('2025-12-30');
        expect(resolveNoteDate({ kind: 'relative_days', offsetDays: -366 }, '2026-11-20', TODAY)).toBe('2025-11-19');
    });

    it('n’est pas troublée par le passage à l’heure d’hiver', () => {
        expect(resolveNoteDate({ kind: 'relative_days', offsetDays: -1 }, '2026-10-26', TODAY)).toBe('2026-10-25');
    });

    it('ne propose jamais de date future, ni de décalage positif', () => {
        expect(resolveNoteDate({ kind: 'relative_days', offsetDays: 1 }, '2026-11-20', TODAY)).toBeNull();
        // Fiche datée dans le futur : « aujourd'hui » relatif à elle serait futur.
        expect(resolveNoteDate({ kind: 'relative_days', offsetDays: 0 }, '2026-11-25', TODAY)).toBeNull();
    });

    it('refuse une date du formulaire illisible', () => {
        expect(resolveNoteDate({ kind: 'relative_days', offsetDays: -1 }, '', TODAY)).toBeNull();
        expect(resolveNoteDate({ kind: 'relative_days', offsetDays: -1 }, '2026-02-30', TODAY)).toBeNull();
    });
});

describe('resolveNoteDate — jour de la semaine', () => {
    // Le 20 novembre 2026 est un vendredi.
    it('prend le jour le plus récent STRICTEMENT avant la date du formulaire', () => {
        expect(resolveNoteDate({ kind: 'last_weekday', weekday: 2 }, '2026-11-20', TODAY)).toBe('2026-11-17'); // mardi
        expect(resolveNoteDate({ kind: 'last_weekday', weekday: 4 }, '2026-11-20', TODAY)).toBe('2026-11-19'); // jeudi = hier
        expect(resolveNoteDate({ kind: 'last_weekday', weekday: 5 }, '2026-11-20', TODAY)).toBe('2026-11-13'); // vendredi : une semaine avant
        expect(resolveNoteDate({ kind: 'last_weekday', weekday: 7 }, '2026-11-20', TODAY)).toBe('2026-11-15'); // dimanche
    });

    it('traverse un changement d’année', () => {
        // 1er janvier 2027 : un vendredi ; « lundi dernier » = 28 décembre 2026.
        expect(resolveNoteDate({ kind: 'last_weekday', weekday: 1 }, '2027-01-01', '2027-01-01')).toBe('2026-12-28');
    });
});

describe('resolveNoteDate — date absolue', () => {
    it('sans année : l’occurrence passée la plus récente, au plus tard le jour du formulaire', () => {
        expect(resolveNoteDate({ kind: 'absolute', day: 12, month: 5, year: null }, '2026-11-20', TODAY)).toBe('2026-05-12');
        expect(resolveNoteDate({ kind: 'absolute', day: 20, month: 11, year: null }, '2026-11-20', TODAY)).toBe('2026-11-20');
        expect(resolveNoteDate({ kind: 'absolute', day: 25, month: 12, year: null }, '2026-11-20', TODAY)).toBe('2025-12-25');
    });

    it('29 février sans année : la dernière année bissextile', () => {
        expect(resolveNoteDate({ kind: 'absolute', day: 29, month: 2, year: null }, '2026-11-20', TODAY)).toBe('2024-02-29');
        expect(resolveNoteDate({ kind: 'absolute', day: 29, month: 2, year: null }, '2028-02-28', '2028-03-01')).toBe('2024-02-29');
        expect(resolveNoteDate({ kind: 'absolute', day: 29, month: 2, year: null }, '2028-03-01', '2028-03-01')).toBe('2028-02-29');
    });

    it('avec année : la date telle quelle si elle existe et n’est pas future', () => {
        expect(resolveNoteDate({ kind: 'absolute', day: 3, month: 4, year: 2025 }, '2026-11-20', TODAY)).toBe('2025-04-03');
        expect(resolveNoteDate({ kind: 'absolute', day: 29, month: 2, year: 2026 }, '2026-11-20', TODAY)).toBeNull();
        expect(resolveNoteDate({ kind: 'absolute', day: 21, month: 11, year: 2026 }, '2026-11-20', TODAY)).toBeNull();
    });

    it('décrit en clair ce que la note a écrit', () => {
        expect(describeNoteDateExpr({ kind: 'relative_days', offsetDays: -1 })).toBe('hier');
        expect(describeNoteDateExpr({ kind: 'relative_days', offsetDays: -5 })).toBe('il y a 5 jours');
        expect(describeNoteDateExpr({ kind: 'last_weekday', weekday: 2 })).toBe('mardi dernier');
        expect(describeNoteDateExpr({ kind: 'absolute', day: 1, month: 5, year: null })).toBe('1er mai');
    });
});

describe('buildNoteProposals — pré-cochage', () => {
    const fresh = form();
    const ctx = (current: ObservationFormData, snapshot: ObservationFormData = current) =>
        ({ snapshot, current, defaults: { date: fresh.date, time: fresh.time }, today: TODAY });

    it('pré-coche un champ vide ou à sa valeur par défaut, resté identique', () => {
        const proposals = buildNoteProposals(result({
            speciesName: 'mésange charbonnière', count: 3, dateExpr: { kind: 'relative_days', offsetDays: -1 },
            time: '08:30', location: 'étang', weather: 'Ensoleillé', habitat: 'Eau douce',
        }), ctx(fresh));
        const checked = initialNoteSelection(proposals);
        expect([...checked]).toEqual(['species', 'count', 'date', 'time', 'location', 'habitat', 'weather']);
    });

    it('ne pré-coche pas un champ déjà rempli', () => {
        const filled = form({ speciesName: 'Merle noir', count: 2, location: 'jardin', weather: WeatherCondition.CLOUDY });
        const proposals = buildNoteProposals(result({ speciesName: 'mésange', count: 3, location: 'étang', weather: 'Ensoleillé' }), ctx(filled));
        expect(proposals.map(p => p.key)).toEqual(['species', 'count', 'location', 'weather']);
        expect(proposals.every(p => !p.preChecked)).toBe(true);
        expect(proposals.find(p => p.key === 'location')).toMatchObject({ current: 'jardin', proposed: 'étang' });
    });

    it('ne pré-coche pas un champ modifié depuis l’ouverture du panneau, même revenu à vide', () => {
        const snapshot = form({ location: 'bois' });
        const current = form({ location: '' });
        const [location] = buildNoteProposals(result({ location: 'étang' }), ctx(current, snapshot));
        expect(location.preChecked).toBe(false);
    });

    it('une fiche existante n’a pas de date ni d’heure « par défaut »', () => {
        const existing = form({ date: '2026-05-14', time: '12:00' });
        const proposals = buildNoteProposals(result({ dateExpr: { kind: 'relative_days', offsetDays: -1 }, time: '08:00' }),
            { snapshot: existing, current: existing, defaults: null, today: TODAY });
        expect(proposals.map(p => [p.key, p.preChecked])).toEqual([['date', false], ['time', false]]);
    });

    it('affiche la date calculée en clair, avec la référence', () => {
        const [date] = buildNoteProposals(result({ dateExpr: { kind: 'last_weekday', weekday: 2 } }), ctx(fresh));
        expect(date.proposed).toBe('17/11/2026');
        expect(date.detail).toContain('mardi 17 novembre 2026');
        expect(date.detail).toContain('« mardi dernier »');
        expect(date.detail).toContain('20/11/2026');
    });

    it('ne pré-coche jamais le reste de la note', () => {
        const [remainder] = buildNoteProposals(result({ remainder: 'Avec Paul.' }), ctx(fresh));
        expect(remainder).toMatchObject({ key: 'remainder', preChecked: false });
    });

    it('ne pré-coche une répartition que si elle sera appliquée telle que la note la dit', () => {
        // Nombre proposé et pré-coché : 5 = 2 + 1 + 2 non identifiés.
        const fine = buildNoteProposals(result({ count: 5, maleCount: 2, femaleCount: 1 }), ctx(fresh));
        expect(fine.find(p => p.key === 'breakdown')?.preChecked).toBe(true);
        // Fiche à 10, nombre de la note (5) non pré-coché : appliquée sur 10, pas telle que la note la dit.
        const ten = form({ count: 10 });
        const other = buildNoteProposals(result({ count: 5, maleCount: 2, femaleCount: 1 }), ctx(ten));
        expect(other.find(p => p.key === 'breakdown')?.preChecked).toBe(false);
        // Sans total dans la note, une répartition qui dépasse le total de la fiche.
        const over = buildNoteProposals(result({ maleCount: 2, femaleCount: 1 }), ctx(fresh));
        const breakdown = over.find(p => p.key === 'breakdown');
        expect(breakdown?.preChecked).toBe(false);
        expect(breakdown?.detail).toMatch(/Ne sera pas appliquée/);
        expect(breakdown?.detail).not.toMatch(/Cochez aussi/);
    });

    it('fiche sans date valable : compte depuis aujourd’hui et le dit', () => {
        const noDate = form({ date: '' });
        const [date] = buildNoteProposals(result({ dateExpr: { kind: 'relative_days', offsetDays: -1 } }), ctx(noDate));
        expect(date.proposed).toBe('19/11/2026');
        expect(date.detail).toMatch(/compté depuis aujourd'hui \(20\/11\/2026\), car la fiche n'avait pas de date valable/);
        const applied = applyNoteFields(noDate, result({ dateExpr: { kind: 'relative_days', offsetDays: -1 } }), new Set<NoteProposalKey>(['date']), { referenceDate: '', today: TODAY, keepNote: false, noteText: '' });
        expect(applied.form.date).toBe('2026-11-19');
    });

    it('calcule la répartition affichée avec le total qui sera appliqué', () => {
        const ten = form({ count: 10 });
        const note = result({ count: 5, maleCount: 2, femaleCount: 1 });
        const withCount = buildNoteProposals(note, { ...ctx(ten), selection: new Set<NoteProposalKey>(['count', 'breakdown']) });
        expect(withCount.find(p => p.key === 'breakdown')?.proposed).toBe('2 mâles, 1 femelle, 2 non identifiés');
        const withoutCount = buildNoteProposals(note, { ...ctx(ten), selection: new Set<NoteProposalKey>(['breakdown']) });
        expect(withoutCount.find(p => p.key === 'breakdown')?.proposed).toBe('2 mâles, 1 femelle, 7 non identifiés');
        // Comme l'application : 10 / 2 / 1 / 7.
        const applied = applyNoteFields(ten, note, new Set<NoteProposalKey>(['breakdown']), { referenceDate: '2026-11-20', today: TODAY, keepNote: false, noteText: '' });
        expect(applied.form).toMatchObject({ count: 10, maleCount: 2, femaleCount: 1, unidentifiedCount: 7 });
        const tooSmall = buildNoteProposals(result({ count: 5, maleCount: 4, femaleCount: 2 }), { ...ctx(form({ count: 2 })), selection: new Set<NoteProposalKey>(['breakdown']) });
        expect(tooSmall.find(p => p.key === 'breakdown')?.detail).toMatch(/Ne sera pas appliquée/);
    });

    it('ne propose pas une valeur identique à la valeur actuelle', () => {
        const current = form({ speciesName: 'Mésange charbonnière', count: 3 });
        expect(buildNoteProposals(result({ speciesName: 'mésange charbonniere', count: 3, dateExpr: { kind: 'relative_days', offsetDays: 0 } }), ctx(current))).toEqual([]);
    });

    it('n’affiche jamais un champ nommé dans dropped', () => {
        const proposals = buildNoteProposals(result({
            speciesName: 'mésange', count: 3, location: 'étang', remainder: 'reste',
            dropped: ['speciesName', 'count', 'location', 'remainder'],
        }), ctx(fresh));
        expect(proposals).toEqual([]);
    });

    it('propose le nom latin seul quand la note n’écrit que lui', () => {
        const [species] = buildNoteProposals(result({ scientificName: 'Parus major' }), ctx(fresh));
        expect(species).toMatchObject({ key: 'species', proposed: 'Parus major', preChecked: true });
    });

    it('suit l’ordre d’application, l’espèce en premier', () => {
        const proposals = buildNoteProposals(result({
            weather: 'Pluie', remainder: 'Chant entendu.', location: 'bois', time: '07:00', count: 2, speciesName: 'pic vert',
        }), ctx(fresh));
        const keys = proposals.map(p => p.key);
        expect(keys[0]).toBe('species');
        expect(keys).toEqual([...keys].sort((a, b) => NOTE_PROPOSAL_ORDER.indexOf(a) - NOTE_PROPOSAL_ORDER.indexOf(b)));
    });

    it('montre une balise écrite dans la note comme un texte brut', () => {
        const [location] = buildNoteProposals(result({ location: '<img src=x onerror=alert(1)>' }), ctx(fresh));
        expect(location.proposed).toBe('<img src=x onerror=alert(1)>');
    });
});

describe('applyNoteFields', () => {
    const options = { referenceDate: '2026-11-20', today: TODAY, keepNote: false, noteText: 'note' };
    const all = (keys: NoteProposalKey[]) => new Set<NoteProposalKey>(keys);

    it('n’applique que les cases cochées', () => {
        const outcome = applyNoteFields(form(), result({ count: 3, location: 'étang', weather: 'Pluie' }), all(['location']), options);
        expect(outcome.form.location).toBe('étang');
        expect(outcome.form.count).toBe(1);
        expect(outcome.form.weather).toBe(WeatherCondition.UNKNOWN);
        expect(outcome.applied).toEqual(['location']);
        expect(outcome.weatherApplied).toBe(false);
    });

    it('n’applique jamais un champ de dropped, même coché', () => {
        const outcome = applyNoteFields(form(), result({ location: 'étang', habitat: 'Eau douce', dropped: ['location', 'habitat'] }), all(['location', 'habitat']), options);
        expect(outcome.form.location).toBe('');
        expect(outcome.form.habitat).toBe(Habitat.UNKNOWN);
        expect(outcome.applied).toEqual([]);
    });

    it('signale la météo appliquée (à marquer comme modifiée) et les sections à déplier', () => {
        const outcome = applyNoteFields(form(), result({ weather: 'Pluie', location: 'bois', comportement: 'Chasse' }), all(['weather', 'location', 'comportement']), options);
        expect(outcome.form.weather).toBe('Pluie');
        expect(outcome.weatherApplied).toBe(true);
        expect(outcome.touchesAdvancedLocation).toBe(true);
        expect(outcome.touchesAdvancedDetails).toBe(true);
    });

    it('applique la date calculée par rapport à la date de référence', () => {
        const outcome = applyNoteFields(form({ date: '2026-11-20' }), result({ dateExpr: { kind: 'relative_days', offsetDays: -2 } }), all(['date']), options);
        expect(outcome.form.date).toBe('2026-11-18');
    });

    it('ventile mâles et femelles, le reste en non identifiés, après validation', () => {
        const outcome = applyNoteFields(form(), result({ count: 5, maleCount: 2, femaleCount: 1 }), all(['count', 'breakdown']), options);
        expect(outcome.form).toMatchObject({ count: 5, maleCount: 2, femaleCount: 1, unidentifiedCount: 2 });
        expect(outcome.skipped).toEqual([]);
        const exact = applyNoteFields(form(), result({ count: 3, maleCount: 2, femaleCount: 1 }), all(['count', 'breakdown']), options);
        expect(exact.form).toMatchObject({ count: 3, maleCount: 2, femaleCount: 1, unidentifiedCount: '' });
    });

    it('n’applique pas une répartition incohérente avec le total gardé', () => {
        // Total non coché : le total actuel (1) reste, la répartition (2 + 1) ne tient pas.
        const outcome = applyNoteFields(form(), result({ count: 3, maleCount: 2, femaleCount: 1 }), all(['breakdown']), options);
        expect(outcome.form).toMatchObject({ count: 1, maleCount: '', femaleCount: '', unidentifiedCount: '' });
        expect(outcome.applied).toEqual([]);
        expect(outcome.skipped).toEqual([{ key: 'breakdown', reason: expect.stringContaining('ne correspond pas au total (1)') }]);
    });

    it('garde la note dans le commentaire sans doublon, et ignore alors le reste de la note', () => {
        const keep = { ...options, keepNote: true, noteText: '3 mésanges, ensoleillé. Nourrissage.' };
        const once = applyNoteFields(form({ comment: 'Déjà là.' }), result({ remainder: 'Nourrissage.' }), all(['remainder']), keep);
        expect(once.form.comment).toBe('Déjà là.\n\n3 mésanges, ensoleillé. Nourrissage.');
        expect(once.applied).toEqual([]);
        const twice = applyNoteFields(once.form, result({ remainder: 'Nourrissage.' }), all(['remainder']), keep);
        expect(twice.form.comment).toBe(once.form.comment);
    });

    it('sans la note entière, ajoute le reste de la note au commentaire', () => {
        const outcome = applyNoteFields(form({ comment: 'Avant.' }), result({ remainder: 'Nourrissage au sol.' }), all(['remainder']), options);
        expect(outcome.form.comment).toBe('Avant.\n\nNourrissage au sol.');
        expect(outcome.applied).toEqual(['remainder']);
    });

    it('prévient quand un nouveau nombre rend fausse la répartition déjà saisie', () => {
        const outcome = applyNoteFields(form({ count: 3, maleCount: 2, femaleCount: 1 }), result({ count: 5 }), all(['count']), options);
        expect(outcome.form.count).toBe(5);
        expect(outcome.warnings).toEqual([expect.stringContaining('ne correspond plus')]);
    });

    it('ne touche ni à l’espèce, ni à la position, ni aux observateurs', () => {
        const start = form({ speciesName: 'Merle', latinName: 'Turdus merula', gps: { lat: 45, lon: 1 }, observers: ['A'] });
        const outcome = applyNoteFields(start, result({ speciesName: 'mésange', scientificName: 'Parus major', count: 3 }),
            all(['species', 'count']), options);
        expect(outcome.form).toMatchObject({ speciesName: 'Merle', latinName: 'Turdus merula', gps: { lat: 45, lon: 1 }, observers: ['A'] });
        expect(outcome.form.count).toBe(3);
    });
});

describe('commentaire', () => {
    it('n’ajoute jamais un texte déjà présent (casse et espaces ignorés)', () => {
        expect(appendToComment('', 'Note')).toEqual({ comment: 'Note', tooLong: false });
        expect(appendToComment('Une NOTE  ici', 'note ici')).toEqual({ comment: 'Une NOTE  ici', tooLong: false });
    });

    it('ne dépasse jamais la limite du commentaire en base (5 000 caractères)', () => {
        const long = 'a'.repeat(4990);
        expect(appendToComment(long, 'une note de plus')).toEqual({ comment: long, tooLong: true });
        const outcome = applyNoteFields(form({ comment: long }), result({ remainder: 'reste de la note' }), new Set<NoteProposalKey>(['remainder']), { referenceDate: '2026-11-20', today: TODAY, keepNote: false, noteText: '' });
        expect(outcome.form.comment).toBe(long);
        expect(outcome.skipped[0].reason).toMatch(/5\u202f000|5 000/);
        const kept = applyNoteFields(form({ comment: long }), result({ count: 2 }), new Set<NoteProposalKey>(['count']), { referenceDate: '2026-11-20', today: TODAY, keepNote: true, noteText: 'note entière' });
        expect(kept.form.comment).toBe(long);
        expect(kept.noteKept).toBe(false);
        expect(kept.warnings.join(' ')).toMatch(/pas été ajoutée au commentaire/);
        expect(commentContains('abc', '')).toBe(false);
    });
});

describe('espèce : chemin de l’aide photo', () => {
    const suggestions = [
        { displayName: 'Mésange bleue', latinName: 'Cyanistes caeruleus', commonName: 'Mésange bleue' },
        { displayName: 'Mésange charbonnière', latinName: 'Parus major', commonName: 'Mésange charbonnière' },
    ];

    it('cherche le nom latin s’il existe, sinon le nom commun', () => {
        expect(noteSpeciesQuery(result({ speciesName: 'mésange charbonnière', scientificName: 'Parus major' }))).toEqual({ query: 'Parus major', by: 'latin' });
        expect(noteSpeciesQuery(result({ speciesName: 'mésange charbonnière' }))).toEqual({ query: 'mésange charbonnière', by: 'common' });
        expect(noteSpeciesQuery(result())).toBeNull();
    });

    it('ne retient qu’une correspondance exacte', () => {
        expect(findExactSpeciesMatch(suggestions, result({ scientificName: 'parus  major' }))?.displayName).toBe('Mésange charbonnière');
        expect(findExactSpeciesMatch(suggestions, result({ speciesName: 'mesange charbonniere' }))?.latinName).toBe('Parus major');
        expect(findExactSpeciesMatch(suggestions, result({ speciesName: 'mésange' }))).toBeUndefined();
        expect(findExactSpeciesMatch(suggestions, result({ scientificName: 'Parus' }))).toBeUndefined();
    });
});
