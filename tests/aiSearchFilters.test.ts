import { describe, expect, it } from 'vitest';
import { SEARCH_FIELDS, SEARCH_LIMITS } from '../supabase/functions/ai-text/logic';
import { Habitat, Status, TaxonomicGroup, type Observation } from '../types';
import {
    AI_SEARCH_FIELDS,
    AI_SEARCH_LIMITS,
    applyAiFilter,
    buildFilterPlan,
    clampRadiusKm,
    criteriaIsEmpty,
    emptyCriteria,
    parseSearchResult,
    removeCriterion,
    resolvePeriod,
    type SearchCriteria,
    type SearchPeriod,
} from '../utils/aiSearchFilters';
import { normalizeDepartment, observationInDepartment } from '../utils/frenchDepartments';
import { distanceKm } from '../utils/geoDistance';
import { searchTextMatches } from '../utils/textUtils';

/** Date locale figée (jamais l'heure réelle). */
const at = (iso: string) => {
    const [y, m, d] = iso.split('-').map(Number);
    return new Date(y, m - 1, d, 12, 0, 0);
};

const period = (kind: SearchPeriod['kind'], extra: Partial<SearchPeriod> = {}): SearchPeriod => ({
    kind, days: null, month: null, season: null, yearScope: null, ...extra,
});

const criteria = (overrides: Partial<SearchCriteria> = {}): SearchCriteria => ({ ...emptyCriteria(), ...overrides });

const obs = (overrides: Partial<Observation> = {}): Observation => ({
    id: Math.random().toString(36).slice(2),
    speciesName: 'Espèce',
    latinName: '',
    taxonomicGroup: TaxonomicGroup.BIRD,
    date: '2026-05-10',
    time: '08:00',
    count: 1,
    location: '',
    gps: { lat: null, lon: null },
    municipality: '',
    department: '',
    country: 'France',
    altitude: null,
    comment: '',
    status: Status.LC,
    atlasCode: '',
    protocol: 'Opportuniste' as Observation['protocol'],
    sexe: 'Non renseigné' as Observation['sexe'],
    age: 'Non renseigné' as Observation['age'],
    observationCondition: 'Non renseigné' as Observation['observationCondition'],
    comportement: 'Non renseigné' as Observation['comportement'],
    weather: 'Non renseigné' as Observation['weather'],
    ...overrides,
});

describe('constantes recopiées de la fonction ai-text', () => {
    it('mêmes bornes et mêmes champs', () => {
        expect(AI_SEARCH_LIMITS).toEqual(SEARCH_LIMITS);
        expect([...AI_SEARCH_FIELDS]).toEqual([...SEARCH_FIELDS]);
    });
});

describe('périodes converties au moment d’appliquer', () => {
    it('ce mois-ci et le mois dernier, y compris au changement d’année', () => {
        expect(resolvePeriod(period('this_month'), at('2026-11-21'))).toMatchObject({ kind: 'range', start: '2026-11-01', end: '2026-11-30' });
        expect(resolvePeriod(period('last_month'), at('2026-11-21'))).toMatchObject({ kind: 'range', start: '2026-10-01', end: '2026-10-31' });
        expect(resolvePeriod(period('last_month'), at('2027-01-03'))).toMatchObject({ kind: 'range', start: '2026-12-01', end: '2026-12-31' });
        // Une phrase rejouée plus tard reste juste : le mois dernier suit la date.
        expect(resolvePeriod(period('last_month'), at('2027-03-15'))).toMatchObject({ start: '2027-02-01', end: '2027-02-28' });
    });

    it('29 février : le mois dernier d’une année bissextile', () => {
        expect(resolvePeriod(period('last_month'), at('2028-03-01'))).toMatchObject({ start: '2028-02-01', end: '2028-02-29' });
        expect(resolvePeriod(period('month', { month: 2, yearScope: 'this_year' }), at('2028-06-01'))).toMatchObject({ end: '2028-02-29' });
    });

    it('cette année, l’an dernier', () => {
        expect(resolvePeriod(period('this_year'), at('2026-11-21'))).toEqual({ kind: 'year', year: 2026, label: 'cette année (2026)' });
        expect(resolvePeriod(period('last_year'), at('2027-01-01'))).toMatchObject({ kind: 'year', year: 2026 });
    });

    it('les N derniers jours, aujourd’hui compris', () => {
        expect(resolvePeriod(period('last_n_days', { days: 1 }), at('2026-11-21'))).toMatchObject({ start: '2026-11-21', end: '2026-11-21' });
        expect(resolvePeriod(period('last_n_days', { days: 10 }), at('2026-11-21'))).toMatchObject({ start: '2026-11-12', end: '2026-11-21' });
        expect(resolvePeriod(period('last_n_days', { days: 7 }), at('2027-01-03'))).toMatchObject({ start: '2026-12-28' });
    });

    it('un mois : toutes les années, cette année, l’an dernier, « le dernier »', () => {
        const now = at('2026-11-21');
        expect(resolvePeriod(period('month', { month: 5, yearScope: 'all' }), now)).toMatchObject({ kind: 'months', months: [5] });
        expect(resolvePeriod(period('month', { month: 5, yearScope: 'this_year' }), now)).toMatchObject({ start: '2026-05-01', end: '2026-05-31' });
        expect(resolvePeriod(period('month', { month: 5, yearScope: 'last_year' }), now)).toMatchObject({ start: '2025-05-01' });
        // « mai dernier » le 21 novembre 2026 : mai 2026.
        expect(resolvePeriod(period('month', { month: 5, yearScope: 'most_recent' }), now)).toMatchObject({ start: '2026-05-01' });
        // « novembre dernier » en novembre : le mois en cours n'est pas « dernier ».
        expect(resolvePeriod(period('month', { month: 11, yearScope: 'most_recent' }), now)).toMatchObject({ start: '2025-11-01' });
        // « décembre dernier » en janvier : décembre de l'année d'avant.
        expect(resolvePeriod(period('month', { month: 12, yearScope: 'most_recent' }), at('2027-01-05'))).toMatchObject({ start: '2026-12-01' });
    });

    it('une période dans le futur ne donne rien et le dit', () => {
        const result = resolvePeriod(period('month', { month: 12, yearScope: 'this_year' }), at('2026-11-21'));
        expect(result.kind).toBe('future');
        expect(result.label).toMatch(/à venir/);
        const plan = buildFilterPlan(criteria({ period: period('season', { season: 'summer', yearScope: 'this_year' }) }), at('2026-04-01'));
        expect(plan.aiFilter?.nothing).toBe(true);
        expect(plan.chips[0].tone).toBe('warning');
        expect(applyAiFilter([obs({ date: '2026-07-01' })], plan.aiFilter).kept).toEqual([]);
    });

    it('saisons météorologiques ; l’hiver va de décembre à février', () => {
        const now = at('2026-11-21');
        expect(resolvePeriod(period('season', { season: 'spring', yearScope: 'all' }), now)).toMatchObject({ kind: 'months', months: [3, 4, 5] });
        expect(resolvePeriod(period('season', { season: 'winter', yearScope: 'all' }), now)).toMatchObject({ kind: 'months', months: [1, 2, 12] });
        expect(resolvePeriod(period('season', { season: 'summer', yearScope: 'this_year' }), now)).toMatchObject({ start: '2026-06-01', end: '2026-08-31' });
        // « L'été dernier » en novembre : l'été 2026 ; en juillet : l'été 2025 (celui en cours n'est pas terminé).
        expect(resolvePeriod(period('season', { season: 'summer', yearScope: 'most_recent' }), now)).toMatchObject({ start: '2026-06-01' });
        expect(resolvePeriod(period('season', { season: 'summer', yearScope: 'most_recent' }), at('2026-07-15'))).toMatchObject({ start: '2025-06-01' });
        // « L'hiver dernier » en novembre 2026 : décembre 2025 à février 2026.
        expect(resolvePeriod(period('season', { season: 'winter', yearScope: 'most_recent' }), now)).toMatchObject({ start: '2025-12-01', end: '2026-02-28' });
        // En janvier 2028, l'hiver en cours n'est pas « dernier » : décembre 2026 à février 2027.
        expect(resolvePeriod(period('season', { season: 'winter', yearScope: 'most_recent' }), at('2028-01-10'))).toMatchObject({ start: '2026-12-01', end: '2027-02-28' });
        // « Cet hiver » en décembre : celui qui commence (février bissextile).
        expect(resolvePeriod(period('season', { season: 'winter', yearScope: 'this_year' }), at('2027-12-10'))).toMatchObject({ start: '2027-12-01', end: '2028-02-29' });
        // « Cet hiver » en novembre : celui de janvier dernier.
        expect(resolvePeriod(period('season', { season: 'winter', yearScope: 'this_year' }), now)).toMatchObject({ start: '2025-12-01', end: '2026-02-28' });
    });
});

describe('plan de filtres', () => {
    const now = at('2026-11-21');

    it('ce qui a un filtre existant y est écrit (année, dates, groupe, statut, texte)', () => {
        const plan = buildFilterPlan(criteria({
            years: [2024], groups: [TaxonomicGroup.MAMMAL], statuses: [Status.VU], text: 'canards colverts',
        }), now);
        expect(plan.writes).toEqual({ yearFilter: '2024', taxonomicGroupFilter: TaxonomicGroup.MAMMAL, statusFilter: Status.VU, searchTerm: 'canards colverts' });
        expect(plan.aiFilter).toBeNull();
        expect(plan.owners).toEqual({ yearFilter: 'years', taxonomicGroupFilter: 'groups', statusFilter: 'statuses', searchTerm: 'text' });
        const dates = buildFilterPlan(criteria({ period: period('last_month') }), now);
        expect(dates.writes).toEqual({ startDateFilter: '2026-10-01', endDateFilter: '2026-10-31' });
    });

    it('le reste va dans l’AiFilter (plusieurs groupes, catégories, mois de toutes les années, statuts, habitats)', () => {
        const plan = buildFilterPlan(criteria({
            period: period('month', { month: 5, yearScope: 'all' }),
            years: [2020, 2021],
            groups: [TaxonomicGroup.BUTTERFLY, TaxonomicGroup.MOTH],
            categories: ['rapaces_diurnes'],
            statuses: [Status.VU, Status.EN],
            habitats: [Habitat.MOUNTAIN],
        }), now);
        expect(plan.writes).toEqual({});
        expect(plan.aiFilter).toMatchObject({
            months: [5], years: [2020, 2021], groups: [TaxonomicGroup.BUTTERFLY, TaxonomicGroup.MOTH],
            categories: ['rapaces_diurnes'], statuses: [Status.VU, Status.EN], habitats: [Habitat.MOUNTAIN], nothing: false,
        });
        // Une étiquette par critère.
        expect(plan.chips.map(chip => chip.id)).toEqual([
            'years', 'period', 'groups:Papillons de jour', 'groups:Papillon de nuit', 'categories:rapaces_diurnes',
            'statuses:VU', 'statuses:EN', 'habitats:Montagne',
        ]);
    });

    it('un groupe unique avec une catégorie : union dans l’AiFilter (pas un ET impossible)', () => {
        const plan = buildFilterPlan(criteria({ groups: [TaxonomicGroup.MAMMAL], categories: ['rapaces_diurnes'] }), now);
        expect(plan.writes.taxonomicGroupFilter).toBeUndefined();
        const kept = applyAiFilter([
            obs({ taxonomicGroup: TaxonomicGroup.MAMMAL, latinName: 'Vulpes vulpes' }),
            obs({ latinName: 'Buteo buteo' }),
            obs({ latinName: 'Parus major' }),
        ], plan.aiFilter).kept;
        expect(kept.map(item => item.latinName)).toEqual(['Vulpes vulpes', 'Buteo buteo']);
    });

    it('rayon borné entre 0,1 et 100 km, au dixième', () => {
        expect(clampRadiusKm(0)).toBe(10);
        expect(clampRadiusKm(0.01)).toBe(0.1);
        expect(clampRadiusKm(250)).toBe(100);
        expect(clampRadiusKm(2.345)).toBe(2.3);
        expect(clampRadiusKm(-1)).toBeNull();
        const parsed = parseSearchResult({ near: { kind: 'current_position', placeName: null, radiusKm: 500 } });
        expect(parsed?.near?.radiusKm).toBe(100);
    });

    it('« près de chez moi » : appliqué seulement avec une position ; sinon étiquette d’erreur, jamais abandonné', () => {
        const near = criteria({ near: { kind: 'current_position', placeName: null, radiusKm: 10 } });
        const ok = buildFilterPlan(near, now, { status: 'ok', lat: 44.8, lon: -0.6 });
        expect(ok.writes.geo).toEqual({ lat: 44.8, lon: -0.6, radiusKm: 10 });
        expect(ok.chips[0]).toMatchObject({ label: 'autour de ma position actuelle (10 km)', tone: 'ok' });
        const denied = buildFilterPlan(near, now, { status: 'denied' });
        expect(denied.writes.geo).toBeUndefined();
        expect(denied.chips[0]).toMatchObject({ tone: 'error' });
        expect(denied.chips[0].label).toMatch(/position refusée/);
        const place = buildFilterPlan(criteria({ near: { kind: 'place', placeName: 'Castelbrume', radiusKm: 5 } }), now, { status: 'not_found' });
        expect(place.chips[0].label).toBe('autour de Castelbrume (5 km) : lieu introuvable, critère non appliqué');
    });

    it('département normalisé par la table locale (« Gironde » = 33)', () => {
        expect(normalizeDepartment('Gironde')).toBe('33');
        expect(normalizeDepartment('la gironde')).toBe('33');
        expect(normalizeDepartment('33')).toBe('33');
        expect(normalizeDepartment('1')).toBe('01');
        expect(normalizeDepartment('Côtes-d’Armor')).toBe('22');
        expect(normalizeDepartment('cotes d armor')).toBe('22');
        expect(normalizeDepartment('2a')).toBe('2A');
        expect(normalizeDepartment('La Réunion')).toBe('974');
        expect(normalizeDepartment('Atlantide')).toBeNull();
        expect(normalizeDepartment('99')).toBeNull();
        expect(observationInDepartment('33', '33')).toBe(true);
        expect(observationInDepartment('Gironde', '33')).toBe(true);
        expect(observationInDepartment('20', '2B')).toBe(true);
        // « Corse » ou « 20 » : 2A, 2B et 20.
        expect(normalizeDepartment('Corse')).toBe('20');
        expect(normalizeDepartment('20')).toBe('20');
        expect(observationInDepartment('2A', '20')).toBe(true);
        expect(observationInDepartment('Haute-Corse', '20')).toBe(true);
        expect(observationInDepartment('20', '20')).toBe(true);
        expect(observationInDepartment('33', '20')).toBe(false);
        expect(buildFilterPlan(criteria({ department: 'Corse' }), now).chips[0].label).toBe('Corse (20)');
        expect(observationInDepartment('', '33')).toBe(false);
        const plan = buildFilterPlan(criteria({ department: 'Gironde' }), now);
        expect(plan.aiFilter?.department).toBe('33');
        expect(plan.chips[0].label).toBe('Gironde (33)');
        const unknown = buildFilterPlan(criteria({ department: 'Atlantide' }), now);
        expect(unknown.aiFilter).toBeNull();
        expect(unknown.chips[0].tone).toBe('error');
    });

    it('commune comparée sans casse ni accents', () => {
        const plan = buildFilterPlan(criteria({ commune: 'saint-emilion' }), now);
        const kept = applyAiFilter([obs({ municipality: 'Saint-Émilion' }), obs({ municipality: 'Libourne' })], plan.aiFilter).kept;
        expect(kept.map(item => item.municipality)).toEqual(['Saint-Émilion']);
    });

    it('catégories et genres : premier mot du nom latin ; observations sans nom latin comptées', () => {
        const plan = buildFilterPlan(criteria({ categories: ['mesanges'], genera: ['Sitta', 'Certhia brachydactyla'] }), now);
        const result = applyAiFilter([
            obs({ latinName: 'Parus major' }),
            obs({ latinName: 'Aegithalos caudatus' }),
            obs({ latinName: 'Sitta europaea' }),
            obs({ latinName: 'Certhia brachydactyla' }),
            obs({ latinName: 'Certhia familiaris' }),
            obs({ latinName: 'Turdus merula' }),
            obs({ latinName: '' }),
            obs({ latinName: '  ' }),
        ], plan.aiFilter);
        expect(result.kept.map(item => item.latinName)).toEqual(['Parus major', 'Aegithalos caudatus', 'Sitta europaea', 'Certhia brachydactyla']);
        expect(result.excludedNoLatinName).toBe(2);
    });

    it('un champ nommé dans dropped n’est jamais appliqué, et c’est dit', () => {
        const parsed = parseSearchResult({
            period: { kind: 'this_year', days: 0, month: 0, season: 'none', yearScope: 'all' },
            years: [], groups: ['Oiseaux'], categories: [], genera: [], statuses: [], habitats: [],
            department: 'Gironde', commune: null, near: null, text: null,
            dropped: ['department', 'period'],
        });
        expect(parsed?.period).toBeNull();
        expect(parsed?.department).toBeNull();
        expect(parsed?.dropped).toEqual(['period', 'department']);
        const plan = buildFilterPlan(parsed as SearchCriteria, now);
        expect(plan.writes).toEqual({ taxonomicGroupFilter: TaxonomicGroup.BIRD });
        expect(plan.notes[0]).toBe("L'assistant a mal lu la période et le département : ces critères ne sont pas appliqués.");
    });

    it('années à venir : rien, et c’est dit', () => {
        const plan = buildFilterPlan(criteria({ years: [2031] }), now);
        expect(plan.aiFilter?.nothing).toBe(true);
        expect(plan.chips[0].label).toMatch(/à venir/);
        const months = buildFilterPlan(criteria({ years: [2026], period: period('month', { month: 12, yearScope: 'all' }) }), now);
        expect(months.aiFilter?.nothing).toBe(true);
    });

    it('retirer un critère n’en retire qu’un', () => {
        const base = criteria({ statuses: [Status.VU, Status.EN, Status.CR], text: 'pic' });
        const next = removeCriterion(base, { field: 'statuses', value: Status.EN });
        expect(next.statuses).toEqual([Status.VU, Status.CR]);
        expect(next.text).toBe('pic');
        expect(criteriaIsEmpty(removeCriterion(criteria({ text: 'pic' }), { field: 'text' }))).toBe(true);
    });
});

describe('relecture des critères (réponse de la fonction ou cache)', () => {
    it('re-borne chaque champ : une valeur hors liste est retirée et signalée', () => {
        const parsed = parseSearchResult({
            groups: ['Oiseaux', 'Dragons'], categories: ['inconnue'], statuses: ['XX'], habitats: ['Non renseigné'],
            genera: ['parus'], years: [1800], text: 'a'.repeat(201), commune: '<img src=x onerror=alert(1)>',
            near: { kind: 'place', placeName: '', radiusKm: 5 },
        });
        expect(parsed).not.toBeNull();
        expect(parsed?.dropped).toEqual(['years', 'groups', 'categories', 'genera', 'statuses', 'habitats', 'commune', 'near', 'text']);
        expect(criteriaIsEmpty(parsed as SearchCriteria)).toBe(true);
    });

    it('accepte la forme de la fonction (absences à null) et ignore ce qui n’est pas un objet', () => {
        expect(parseSearchResult(null)).toBeNull();
        expect(parseSearchResult([])).toBeNull();
        const parsed = parseSearchResult({
            period: { kind: 'season', days: null, month: null, season: 'winter', yearScope: 'most_recent' },
            years: [], groups: [], categories: ['rapaces_diurnes', 'rapaces_nocturnes'], genera: ['Sitta'], statuses: [], habitats: [],
            department: null, commune: 'Saint-Martin-d’Hères', near: { kind: 'current_position', placeName: null, radiusKm: 10 },
            text: null, dropped: [],
        });
        expect(parsed).toMatchObject({ categories: ['rapaces_diurnes', 'rapaces_nocturnes'], genera: ['Sitta'], commune: 'Saint-Martin-d’Hères', dropped: [] });
    });

    it('une année écrite l’emporte sur une période qui fixe l’année (aucune étiquette mensongère)', () => {
        const parsed = parseSearchResult({ years: [2024], period: { kind: 'this_year', days: 0, month: 0, season: 'none', yearScope: 'all' } });
        expect(parsed?.period).toBeNull();
        expect(parsed?.dropped).toEqual(['period']);
        // Même construit à la main, le plan n'écrase pas l'année écrite.
        const plan = buildFilterPlan(criteria({ years: [2024], period: period('this_year') }), at('2026-11-21'));
        expect(plan.writes.yearFilter).toBe('2024');
        expect(plan.chips.find(chip => chip.id === 'period')?.tone).toBe('error');
    });

    it('le texte cherché reste tel quel ; la recherche par nom ignore un pluriel simple des deux côtés', () => {
        expect(buildFilterPlan(criteria({ text: 'canards colverts' }), at('2026-11-21')).writes.searchTerm).toBe('canards colverts');
        for (const [query, name] of [
            ['canards colverts', 'Canard colvert'], ['courlis cendré', 'Courlis cendré'], ['courlis', 'Courlis cendré'],
            ['ours brun', 'Ours brun'], ['ours', 'Ours brun'], ['lynx boréal', 'Lynx boréal'], ['choucas des tours', 'Choucas des tours'],
            ['hiboux', 'Hibou moyen-duc'], ['mésanges bleues', 'Mésange bleue'], ['hirondelles rustiques', 'Hirondelle rustique'],
            ['gris', 'Héron gris'], ['pics', 'Pic épeiche'], ['canards colv', 'Canard colvert'],
            // La sous-chaîne d'avant reste telle quelle.
            ['lis', 'Courlis cendré'], ['merl', 'Merle noir'], ['our', 'Tourterelle des bois'],
        ]) {
            expect(searchTextMatches(name, query), `${query} → ${name}`).toBe(true);
        }
        // Une lettre de plus n'élargit jamais la liste (précision d'avant la PR).
        for (const [query, name] of [
            ['gris', 'Grive musicienne'], ['roux', 'Rougegorge familier'], ['ours', 'Tourterelle des bois'], ['ours', 'Bourdon terrestre'],
            ['pics', 'Épicéa commun'], ['pins', 'Lapin de garenne'], ['paris', 'Pariétaire de Judée'],
        ]) {
            expect(searchTextMatches(name, query), `${query} ↛ ${name}`).toBe(false);
        }
        expect(searchTextMatches('Buse variable', 'canard')).toBe(false);
    });

    it('une saison ou un mois illisible n’est jamais appliqué (clés héritées d’Object)', () => {
        const bogus = { kind: 'season', days: null, month: null, season: 'constructor', yearScope: 'all' } as unknown as SearchPeriod;
        expect(resolvePeriod(bogus, at('2026-11-21')).kind).toBe('unknown');
        const plan = buildFilterPlan(criteria({ period: bogus }), at('2026-11-21'));
        expect(plan.aiFilter).toBeNull();
        expect(plan.chips[0].tone).toBe('error');
        expect(parseSearchResult({ period: { kind: 'season', season: '__proto__', yearScope: 'all' } })?.dropped).toEqual(['period']);
    });

    it('la distance (haversine) est partagée avec les filtres de la liste', () => {
        expect(distanceKm(44.8378, -0.5792, 44.8378, -0.5792)).toBe(0);
        // Paris → Lyon : environ 392 km à vol d'oiseau.
        expect(distanceKm(48.8566, 2.3522, 45.764, 4.8357)).toBeGreaterThan(389);
        expect(distanceKm(48.8566, 2.3522, 45.764, 4.8357)).toBeLessThan(394);
    });
});
