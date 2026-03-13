import { describe, expect, it } from 'vitest';
import { buildStatsReportData } from '../utils/statsReportData';
import {
    Age, Comportement, Observation, ObservationCondition,
    Protocol, Sexe, Status, TaxonomicGroup
} from '../types';

const makeObs = (overrides: Partial<Observation>): Observation => ({
    id: 'obs-1',
    speciesName: 'Espèce test',
    latinName: '',
    taxonomicGroup: TaxonomicGroup.BIRD,
    date: '2026-03-01',
    time: '09:00',
    count: 1,
    location: 'Lieu',
    gps: { lat: null, lon: null },
    municipality: 'Commune',
    department: '59',
    country: 'France',
    altitude: null,
    comment: '',
    status: Status.LC,
    atlasCode: '',
    protocol: Protocol.OPPORTUNIST,
    sexe: Sexe.UNKNOWN,
    age: Age.UNKNOWN,
    observationCondition: ObservationCondition.UNKNOWN,
    comportement: Comportement.UNKNOWN,
    ...overrides
});

describe('buildStatsReportData – KPIs', () => {
    it('renvoie des zéros pour un tableau vide', () => {
        const data = buildStatsReportData([]);
        expect(data.totalObservations).toBe(0);
        expect(data.uniqueSpecies).toBe(0);
        expect(data.uniqueGroups).toBe(0);
        expect(data.groupData).toHaveLength(0);
        expect(data.statusData).toHaveLength(0);
        expect(data.topSpecies).toHaveLength(0);
    });

    it('compte correctement les KPIs', () => {
        const obs = [
            makeObs({ id: '1', speciesName: 'Mésange bleue', taxonomicGroup: TaxonomicGroup.BIRD, municipality: 'Paris' }),
            makeObs({ id: '2', speciesName: 'Renard roux', taxonomicGroup: TaxonomicGroup.MAMMAL, municipality: 'Lyon' }),
            makeObs({ id: '3', speciesName: 'Mésange bleue', taxonomicGroup: TaxonomicGroup.BIRD, municipality: 'Paris' }),
        ];
        const data = buildStatsReportData(obs);
        expect(data.totalObservations).toBe(3);
        expect(data.uniqueSpecies).toBe(2);
        expect(data.uniqueLocations).toBe(2);
        expect(data.uniqueGroups).toBe(2);
    });
});

describe('buildStatsReportData – activityData', () => {
    it('produit toujours 12 mois dans l\'ordre', () => {
        const data = buildStatsReportData([makeObs({ date: '2026-06-15' })]);
        expect(data.activityData).toHaveLength(12);
        expect(data.activityData[0].name).toBe('janv.');
        expect(data.activityData[5].name).toBe('juin');
        expect(data.activityData[5].observations).toBe(1);
        expect(data.activityData[0].observations).toBe(0);
    });

    it('accumule plusieurs observations dans le même mois', () => {
        const obs = [
            makeObs({ id: '1', date: '2026-03-10' }),
            makeObs({ id: '2', date: '2026-03-22' }),
        ];
        const data = buildStatsReportData(obs);
        expect(data.activityData[2].observations).toBe(2); // mars = index 2
    });
});

describe('buildStatsReportData – rankedGroupData', () => {
    it('classe les groupes par volume décroissant', () => {
        const obs = [
            makeObs({ id: '1', taxonomicGroup: TaxonomicGroup.MAMMAL }),
            makeObs({ id: '2', taxonomicGroup: TaxonomicGroup.BIRD }),
            makeObs({ id: '3', taxonomicGroup: TaxonomicGroup.BIRD }),
            makeObs({ id: '4', taxonomicGroup: TaxonomicGroup.REPTILE }),
        ];
        const data = buildStatsReportData(obs);

        expect(data.rankedGroupData[0].name).toBe(TaxonomicGroup.BIRD);
        expect(data.rankedGroupData[0].value).toBe(2);
        expect(data.rankedGroupData[1].name).toBe(TaxonomicGroup.MAMMAL);
        expect(data.rankedGroupData[2].name).toBe(TaxonomicGroup.REPTILE);
    });

    it('calcule les pourcentages correctement', () => {
        const obs = [
            makeObs({ id: '1', taxonomicGroup: TaxonomicGroup.BIRD }),
            makeObs({ id: '2', taxonomicGroup: TaxonomicGroup.BIRD }),
            makeObs({ id: '3', taxonomicGroup: TaxonomicGroup.MAMMAL }),
            makeObs({ id: '4', taxonomicGroup: TaxonomicGroup.REPTILE }),
        ];
        const data = buildStatsReportData(obs);

        const bird = data.rankedGroupData.find((group) => group.name === TaxonomicGroup.BIRD);
        const mammal = data.rankedGroupData.find((group) => group.name === TaxonomicGroup.MAMMAL);
        expect(bird?.percentage).toBe(50);
        expect(mammal?.percentage).toBe(25);
    });

    it('agrège les groupes en Autres quand il y a trop de catégories', () => {
        const obs = [
            makeObs({ id: '1', taxonomicGroup: TaxonomicGroup.BIRD }),
            makeObs({ id: '2', taxonomicGroup: TaxonomicGroup.MAMMAL }),
            makeObs({ id: '3', taxonomicGroup: TaxonomicGroup.REPTILE }),
            makeObs({ id: '4', taxonomicGroup: TaxonomicGroup.AMPHIBIAN }),
            makeObs({ id: '5', taxonomicGroup: TaxonomicGroup.ODONATE }),
            makeObs({ id: '6', taxonomicGroup: TaxonomicGroup.BUTTERFLY }),
            makeObs({ id: '7', taxonomicGroup: TaxonomicGroup.MOTH }),
        ];
        const data = buildStatsReportData(obs);

        const others = data.rankedGroupData.find((group) => group.name === 'Autres');
        expect(others?.isOther).toBe(true);
        expect(others?.value).toBe(2);
        expect(data.rankedGroupData).toHaveLength(6);
    });
});

describe('buildStatsReportData – topSpecies', () => {
    it('classe par nombre décroissant et limite à 5', () => {
        const obs = [
            makeObs({ id: '1', speciesName: 'A', count: 10 }),
            makeObs({ id: '2', speciesName: 'B', count: 5 }),
            makeObs({ id: '3', speciesName: 'C', count: 8 }),
            makeObs({ id: '4', speciesName: 'D', count: 3 }),
            makeObs({ id: '5', speciesName: 'E', count: 7 }),
            makeObs({ id: '6', speciesName: 'F', count: 1 }),
        ];
        const data = buildStatsReportData(obs);
        expect(data.topSpecies).toHaveLength(5);
        expect(data.topSpecies[0]).toMatchObject({ name: 'A', count: 10 });
        expect(data.topSpecies[1]).toMatchObject({ name: 'C', count: 8 });
        expect(data.topSpecies[2]).toMatchObject({ name: 'E', count: 7 });
    });

    it('additionne les effectifs d\'une même espèce', () => {
        const obs = [
            makeObs({ id: '1', speciesName: 'Mésange', count: 3 }),
            makeObs({ id: '2', speciesName: 'Mésange', count: 7 }),
        ];
        const data = buildStatsReportData(obs);
        expect(data.topSpecies[0]).toMatchObject({ name: 'Mésange', count: 10 });
    });
});

describe('buildStatsReportData – badges', () => {
    it('débloque le badge Débutant à partir d\'1 observation', () => {
        const data = buildStatsReportData([makeObs({})]);
        const beginner = data.badges.find(b => b.id === 'beginner');
        expect(beginner?.unlocked).toBe(true);
    });

    it('ne débloque pas Expert avec moins de 50 observations', () => {
        const obs = Array.from({ length: 10 }, (_, i) => makeObs({ id: String(i) }));
        const data = buildStatsReportData(obs);
        const expert = data.badges.find(b => b.id === 'expert');
        expect(expert?.unlocked).toBe(false);
    });

    it('renvoie tous les badges définis', () => {
        const data = buildStatsReportData([]);
        expect(data.badges.length).toBeGreaterThan(0);
        data.badges.forEach(b => {
            expect(b).toHaveProperty('id');
            expect(b).toHaveProperty('name');
            expect(b).toHaveProperty('icon');
            expect(b).toHaveProperty('description');
            expect(b).toHaveProperty('unlocked');
        });
    });
});

describe('buildStatsReportData – cohérence avec buildTaxonSpeciesCards', () => {
    it('taxonSpeciesCards reflète les taxons présents dans les observations', () => {
        const obs = [
            makeObs({ id: '1', taxonomicGroup: TaxonomicGroup.BIRD, speciesName: 'Mésange bleue' }),
            makeObs({ id: '2', taxonomicGroup: TaxonomicGroup.MAMMAL, speciesName: 'Renard roux' }),
        ];
        const data = buildStatsReportData(obs);
        const groups = data.taxonSpeciesCards.map(c => c.taxonomicGroup);
        expect(groups).toContain(TaxonomicGroup.BIRD);
        expect(groups).toContain(TaxonomicGroup.MAMMAL);
    });
});
