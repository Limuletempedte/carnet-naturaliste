import { describe, expect, it } from 'vitest';
import { Habitat, Status, TaxonomicGroup } from '../types';
import { analyzeNaturalSearch, countWords, normalizePhraseKey } from '../utils/naturalSearchLocal';

const analyze = (phrase: string) => analyzeNaturalSearch(phrase);

describe('analyse locale de la recherche : périodes', () => {
    it.each([
        ['ce mois-ci', { kind: 'this_month' }],
        ['le mois dernier', { kind: 'last_month' }],
        ['cette année', { kind: 'this_year' }],
        ["l'an dernier", { kind: 'last_year' }],
        ["l’année dernière", { kind: 'last_year' }],
        ["aujourd'hui", { kind: 'last_n_days', days: 1 }],
        ['les 10 derniers jours', { kind: 'last_n_days', days: 10 }],
        ['ces deux dernières semaines', { kind: 'last_n_days', days: 14 }],
        ['en mai', { kind: 'month', month: 5, yearScope: 'all' }],
        ['en mai dernier', { kind: 'month', month: 5, yearScope: 'most_recent' }],
        ["en mai de l'an dernier", { kind: 'month', month: 5, yearScope: 'last_year' }],
        ['en août cette année', { kind: 'month', month: 8, yearScope: 'this_year' }],
        ['au printemps', { kind: 'season', season: 'spring', yearScope: 'all' }],
        ['cet été', { kind: 'season', season: 'summer', yearScope: 'this_year' }],
        ["l'hiver dernier", { kind: 'season', season: 'winter', yearScope: 'most_recent' }],
    ])('« %s »', (phrase, expected) => {
        const result = analyze(phrase);
        expect(result.criteria.period).toMatchObject(expected);
        expect(result.understood).toBe(true);
        expect(result.hasCriteria).toBe(true);
    });

    it('années écrites, intervalles compris', () => {
        expect(analyze('en 2024').criteria.years).toEqual([2024]);
        expect(analyze('de 2020 à 2022').criteria.years).toEqual([2020, 2021, 2022]);
        expect(analyze('entre 2018 et 2019').criteria.years).toEqual([2018, 2019]);
        expect(analyze('2020-2022').criteria.years).toEqual([2020, 2021, 2022]);
        const may = analyze('mai 2024');
        expect(may.criteria.years).toEqual([2024]);
        expect(may.criteria.period).toMatchObject({ kind: 'month', month: 5, yearScope: 'all' });
    });

    it('une année écrite l’emporte sur une période qui fixe l’année (comme la fonction)', () => {
        const result = analyze('cette année 2024');
        expect(result.criteria.years).toEqual([2024]);
        expect(result.criteria.period).toBeNull();
        expect(result.notes.length).toBe(1);
    });

    it('une seconde période n’est pas comprise : elle reste en texte libre', () => {
        const result = analyze('en mai et en juin');
        expect(result.criteria.period).toMatchObject({ month: 5 });
        expect(result.understood).toBe(false);
        expect(result.unknownWords).toEqual(['juin']);
    });

    it('« été » participe n’est pas une saison', () => {
        const result = analyze('les oiseaux qui ont été vus en juin');
        expect(result.criteria.period).toMatchObject({ kind: 'month', month: 6 });
        expect(result.criteria.groups).toEqual([TaxonomicGroup.BIRD]);
        expect(result.understood).toBe(true);
    });
});

describe('analyse locale : groupes, catégories, statuts, milieux', () => {
    it('la phrase du plan, entièrement comprise', () => {
        const result = analyze('les rapaces vus en mai près de chez moi');
        expect(result.criteria.categories).toEqual(['rapaces_diurnes', 'rapaces_nocturnes']);
        expect(result.criteria.period).toMatchObject({ kind: 'month', month: 5, yearScope: 'all' });
        expect(result.criteria.near).toEqual({ kind: 'current_position', placeName: null, radiusKm: 10 });
        expect(result.criteria.text).toBeNull();
        expect(result.understood).toBe(true);
    });

    it('groupes et synonymes ; « papillons » = les deux groupes de papillons', () => {
        expect(analyze('oiseaux').criteria.groups).toEqual([TaxonomicGroup.BIRD]);
        expect(analyze('les chauves-souris').criteria.groups).toEqual([TaxonomicGroup.CHIROPTERA]);
        expect(analyze('libellules').criteria.groups).toEqual([TaxonomicGroup.ODONATE]);
        expect(analyze('papillons').criteria.groups).toEqual([TaxonomicGroup.BUTTERFLY, TaxonomicGroup.MOTH]);
        expect(analyze('papillons de nuit').criteria.groups).toEqual([TaxonomicGroup.MOTH]);
        expect(analyze('mammifères marins').criteria.groups).toEqual([TaxonomicGroup.MARINE_MAMMAL]);
    });

    it('catégories du dictionnaire par leurs synonymes', () => {
        expect(analyze('les canards').criteria.categories).toEqual(['canards']);
        expect(analyze('limicoles').criteria.categories).toEqual(['limicoles']);
        expect(analyze('chouettes et hiboux').criteria.categories).toEqual(['rapaces_nocturnes']);
        expect(analyze('rapaces nocturnes').criteria.categories).toEqual(['rapaces_nocturnes']);
        expect(analyze('mésanges et pics').criteria.categories).toEqual(['pics', 'mesanges']);
    });

    it('un nom suivi d’un qualificatif est une espèce : texte libre, sans catégorie ni groupe', () => {
        for (const phrase of ['hirondelles rustiques', 'canards colverts', 'mésanges bleues', 'hérons cendrés', 'oiseaux de mer']) {
            const result = analyze(phrase);
            expect(result.criteria.categories, phrase).toEqual([]);
            expect(result.criteria.groups, phrase).toEqual([]);
            expect(result.criteria.text, phrase).toBe(phrase);
            expect(result.understood, phrase).toBe(false);
        }
        const species = analyze('lézard des murailles en 2024');
        expect(species.criteria.text).toBe('lézard des murailles');
        expect(species.criteria.years).toEqual([2024]);
        const colverts = analyze('canards colverts cette année');
        expect(colverts.criteria.text).toBe('canards colverts');
        expect(colverts.criteria.categories).toEqual([]);
        expect(colverts.criteria.period).toMatchObject({ kind: 'this_year' });
    });

    it('statuts de la liste rouge', () => {
        expect(analyze('espèces menacées').criteria.statuses).toEqual([Status.VU, Status.EN, Status.CR]);
        expect(analyze('quasi menacées').criteria.statuses).toEqual([Status.NT]);
        expect(analyze('en danger critique').criteria.statuses).toEqual([Status.CR]);
    });

    it('milieux avec leur préposition', () => {
        expect(analyze('en forêt').criteria.habitats).toEqual([Habitat.FOREST_DECIDUOUS, Habitat.FOREST_CONIFEROUS, Habitat.FOREST_MIXED]);
        expect(analyze('en montagne').criteria.habitats).toEqual([Habitat.MOUNTAIN]);
        expect(analyze('en ville').criteria.habitats).toEqual([Habitat.URBAN]);
    });

    it('département nommé (« en », « dans le ») ou numéro ; jamais un mot courant', () => {
        expect(analyze('en Gironde').criteria.department).toBe('Gironde');
        expect(analyze('dans le Nord').criteria.department).toBe('Nord');
        expect(analyze('dans les Landes').criteria.department).toBe('Landes');
        expect(analyze('espèces menacées dans le 33').criteria.department).toBe('33');
        const north = analyze('au nord de la ville');
        expect(north.criteria.department).toBeNull();
        expect(north.understood).toBe(false);
    });

    it('« près de chez moi » et un rayon écrit', () => {
        expect(analyze('autour de moi').criteria.near).toMatchObject({ kind: 'current_position', radiusKm: 10 });
        expect(analyze('à moins de 5 km de chez moi').criteria.near).toMatchObject({ kind: 'current_position', radiusKm: 5 });
        expect(analyze('dans un rayon de 500 m autour de chez moi').criteria.near).toMatchObject({ radiusKm: 0.5 });
        // Rayon ramené à 100 km au plus.
        expect(analyze('à moins de 300 km de chez moi').criteria.near).toMatchObject({ radiusKm: 100 });
        // Un rayon sans « chez moi » n'est pas compris.
        const alone = analyze('à moins de 5 km');
        expect(alone.criteria.near).toBeNull();
        expect(alone.understood).toBe(false);
    });

    it('un lieu nommé n’est pas deviné : texte libre, l’assistant peut l’interpréter', () => {
        const result = analyze('rapaces à Pessac');
        expect(result.criteria.categories).toEqual(['rapaces_diurnes', 'rapaces_nocturnes']);
        expect(result.criteria.text).toBe('Pessac');
        expect(result.criteria.near).toBeNull();
        expect(result.understood).toBe(false);
    });
});

describe('analyse locale : nom simple et utilitaires', () => {
    it('un nom d’espèce seul n’a aucun critère : recherche par nom comme avant', () => {
        const result = analyze('buse variable');
        expect(result.hasCriteria).toBe(false);
        expect(result.criteria.text).toBe('buse variable');
        expect(analyze('').hasCriteria).toBe(false);
        expect(analyze('   ').criteria.text).toBeNull();
    });

    it('une balise reste du texte, jamais un critère', () => {
        const result = analyze('<img src=x onerror=alert(1)>');
        expect(result.hasCriteria).toBe(false);
        expect(result.understood).toBe(false);
    });

    it('clé normalisée : sans casse, accents ni ponctuation', () => {
        expect(normalizePhraseKey('Les RAPACES, vus en Mai !')).toBe('les rapaces vus en mai');
        expect(normalizePhraseKey("l'hiver  dernier")).toBe(normalizePhraseKey('L’Hiver dernier'));
        expect(normalizePhraseKey('Œdicnèmes')).toBe('oedicnemes');
        expect(countWords('les rapaces vus')).toBe(3);
    });
});
