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

    it('« près de » n’est pas un qualificatif : l’ensemble reste une catégorie', () => {
        const result = analyze('hérons près de Castelbrume');
        expect(result.criteria.categories).toEqual(['ardeides']);
        expect(result.criteria.text).toBe('Castelbrume');
        expect(result.understood).toBe(false);
    });

    it('un lieu nommé n’est pas deviné : texte libre, l’assistant peut l’interpréter', () => {
        const result = analyze('rapaces à Pessac');
        expect(result.criteria.categories).toEqual(['rapaces_diurnes', 'rapaces_nocturnes']);
        expect(result.criteria.text).toBe('Pessac');
        expect(result.criteria.near).toBeNull();
        expect(result.understood).toBe(false);
    });
});

describe('analyse locale : la recherche par nom d’abord', () => {
    it.each(['Mars', 'Petit Mars changeant', 'Cèpe d’été', 'Saint-Mars-du-Désert', 'Hygrophore de mars', 'mars', 'été', 'printemps'])(
        '« %s » : ni mois ni saison sans contexte temporel', (phrase) => {
            const result = analyze(phrase);
            expect(result.criteria.period).toBeNull();
            expect(result.hasCriteria).toBe(false);
            expect(result.criteria.text).toBe(phrase);
        });

    it.each(['commune de Fougères', 'Étang des Canards', 'Île aux Oiseaux'])('« %s » : un nom propre reste un nom', (phrase) => {
        const result = analyze(phrase);
        expect(result.hasCriteria).toBe(false);
        expect(result.criteria.text).toBe(phrase);
    });

    it('un mois ou une saison avec un contexte temporel', () => {
        for (const phrase of ['en mai', 'mai dernier', 'mai 2024', 'au printemps', 'cet été', "l'hiver dernier", "pendant l'hiver", 'tout l’été', 'été 2023']) {
            expect(analyze(phrase).criteria.period ?? analyze(phrase).criteria.years.length, phrase).toBeTruthy();
        }
    });

    it('un mot seul reconnu n’est pas « clairement une phrase » ; avec un mot outil ou deux critères, si', () => {
        expect(analyze('Fougères').clearlyPhrase).toBe(false);
        expect(analyze('rapaces nocturnes').clearlyPhrase).toBe(false);
        expect(analyze('les fougères').clearlyPhrase).toBe(true);
        expect(analyze('rapaces 2024').clearlyPhrase).toBe(true);
        expect(analyze('buse').clearlyPhrase).toBe(false);
    });

    it('des passages non compris séparés ne sont jamais collés', () => {
        const result = analyze('chouette effraie en mai à Pessac');
        expect(result.criteria.text).toBeNull();
        expect(result.fragments).toEqual(['chouette effraie', 'Pessac']);
        expect(result.criteria.period).toMatchObject({ month: 5 });
    });

    it('mot outil : un petit mot DANS un nom ne fait pas une phrase', () => {
        expect(analyze('Cèpe d’été').hasFunctionWord).toBe(false);
        expect(analyze('Saint-Mars-du-Désert').hasFunctionWord).toBe(false);
        expect(analyze('mésange charbonnière').hasFunctionWord).toBe(false);
        expect(analyze('hérons cendrés près de Castelbrume').hasFunctionWord).toBe(true);
        expect(analyze('les oiseaux').hasFunctionWord).toBe(true);
    });

    it('clés héritées d’Object : jamais une saison, un nombre ou un critère', () => {
        for (const phrase of ['les oiseaux constructor', 'en constructor', 'cet constructor', 'les constructor derniers jours', 'toString', '__proto__ hiver', 'en hasOwnProperty']) {
            const result = analyze(phrase);
            expect(result.criteria.period, phrase).toBeNull();
        }
    });
});

describe('analyse locale : cas relevés à la relecture croisée', () => {
    it('« les oiseaux limicoles » : la catégorie seule', () => {
        const result = analyze('les oiseaux limicoles');
        expect(result.criteria.categories).toEqual(['limicoles']);
        expect(result.criteria.groups).toEqual([]);
    });

    it('les participes ne sont ni des qualificatifs ni une saison', () => {
        expect(analyze('rapaces entendus en mai').criteria).toMatchObject({ categories: ['rapaces_diurnes', 'rapaces_nocturnes'], text: null });
        expect(analyze('hérons aperçus en juin').criteria).toMatchObject({ categories: ['ardeides'], text: null });
        const ayant = analyze('oiseaux ayant été vus en mai');
        expect(ayant.criteria.period).toMatchObject({ kind: 'month', month: 5 });
        expect(ayant.understood).toBe(true);
    });

    it('« dans les environs de Bordeaux » n’est pas la position actuelle', () => {
        expect(analyze('dans les environs de Bordeaux').criteria.near).toBeNull();
        expect(analyze('dans le coin').criteria.near).toMatchObject({ kind: 'current_position' });
    });

    it('bornes d’années dans n’importe quel ordre', () => {
        expect(analyze('de 2022 à 2020').criteria.years).toEqual([2020, 2021, 2022]);
        expect(analyze('entre 2022 et 2020').criteria.years).toEqual([2020, 2021, 2022]);
    });

    it('« menaces » (le nom) n’est pas « menacés »', () => {
        expect(analyze('menaces').criteria.statuses).toEqual([]);
        expect(analyze('menacés').criteria.statuses).toEqual([Status.VU, Status.EN, Status.CR]);
        expect(analyze('quasi menacées').criteria.statuses).toEqual([Status.NT]);
    });

    it('un rayon de 0 km devient 0,1 km, jamais 10', () => {
        expect(analyze('à moins de 0 km de chez moi').criteria.near?.radiusKm).toBe(0.1);
        expect(analyze('dans un rayon de 5km autour de moi').criteria.near?.radiusKm).toBe(5);
    });

    it('départements : Corse, 2A et 2B reconnus ; un numéro inconnu ne l’est pas', () => {
        expect(analyze('en Corse').criteria.department).toBe('Corse');
        expect(analyze('dans le 2A').criteria.department).toBe('2A');
        expect(analyze('dans le 2b').criteria.department).toBe('2B');
        const unknown = analyze('dans le 99');
        expect(unknown.criteria.department).toBeNull();
        expect(unknown.understood).toBe(false);
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
