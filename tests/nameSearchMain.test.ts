import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useFilterControls } from '../hooks/useFilterControls';
import { useObservationFilters, type ObservationFilterState } from '../hooks/useObservationFilters';
import { setSessionIdentity } from '../services/sessionScope';
import { Status, TaxonomicGroup, type Observation } from '../types';
import { emptyCriteria } from '../utils/aiSearchFilters';
import { normalizeSearchText } from '../utils/textUtils';

/** La règle de `main` (avant la recherche en langage naturel), recopiée telle quelle. */
const mainRule = (obs: Observation, searchTerm: string): boolean => {
    if (!searchTerm) return true;
    const normalizedSearchTerm = normalizeSearchText(searchTerm);
    return Boolean(
        normalizeSearchText(obs.speciesName).includes(normalizedSearchTerm) ||
        (obs.latinName && normalizeSearchText(obs.latinName).includes(normalizedSearchTerm)) ||
        (obs.location && normalizeSearchText(obs.location).includes(normalizedSearchTerm)) ||
        (obs.municipality && normalizeSearchText(obs.municipality).includes(normalizedSearchTerm)),
    );
};

let id = 0;
const obs = (speciesName: string, municipality = '', latinName = ''): Observation => ({
    id: `o-${++id}`,
    speciesName,
    latinName,
    taxonomicGroup: TaxonomicGroup.BIRD,
    date: '2026-05-10',
    time: '08:00',
    count: 1,
    location: '',
    gps: { lat: null, lon: null },
    municipality,
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
});

// Corpus : noms d'espèces et communes (publics), dont les cas relevés à la relecture.
const CORPUS: Observation[] = [
    obs('Pic mar', 'Tours', 'Dendrocoptes medius'), obs('Pic épeiche', 'La Tour-du-Pin', 'Dendrocopos major'),
    obs('Renne', 'Bordeaux', 'Rangifer tarandus'), obs('Grive musicienne', 'Saintes', 'Turdus philomelos'),
    obs('Rougegorge familier', 'Sainte-Foy-la-Grande', 'Erithacus rubecula'), obs('Tourterelle des bois', 'Sablé-sur-Sarthe', 'Streptopelia turtur'),
    obs('Bourdon terrestre', 'Les Sables-d’Olonne', 'Bombus terrestris'), obs('Épicéa commun', 'Pessac', 'Picea abies'),
    obs('Lapin de garenne', 'Paris', 'Oryctolagus cuniculus'), obs('Pariétaire de Judée', 'Fougères', 'Parietaria judaica'),
    obs('Hibou moyen-duc', 'Mars', 'Asio otus'), obs('Canard colvert', 'Saint-Mars-du-Désert', 'Anas platyrhynchos'),
    obs('Mésange bleue', 'Villeneuve-en-Montagne', 'Cyanistes caeruleus'), obs('Courlis cendré', 'Le Teich', 'Numenius arquata'),
    obs('Héron gris', 'La Rochelle', 'Ardea cinerea'), obs('Ours brun', 'L’Aigle', 'Ursus arctos'),
    obs('Hirondelle rustique', 'Les Eyzies', 'Hirundo rustica'), obs('Grand cormoran', 'Mai-sur-Orne', 'Phalacrocorax carbo'),
];
const TERMS = [
    'mars', 'Tours', 'Saintes', 'Rennes', 'Sables', 'gris', 'roux', 'ours', 'pics', 'pins', 'paris', 'hiboux', 'canards colverts',
    'mésanges bleues', 'courlis', 'courlis cendré', 'hirondelles rustiques', 'pic', 'mar', 'tour', 'sainte', 'renne', 'sable',
    'bois', 'de', 'é', 'Fougères', 'Le Teich', 'montagne', 'grand', 'cormorans', 'a', 'ANAS', 'turdus', 'rustica', 'xyz', '',
];

const filtersFor = (searchTerm: string, searchTermFoldsPlural = false): ObservationFilterState => ({
    searchTerm,
    yearFilter: 'all',
    taxonomicGroupFilter: 'all',
    statusFilter: 'all',
    startDateFilter: '',
    endDateFilter: '',
    geoMode: 'none',
    searchTermFoldsPlural,
});

describe('recherche par nom tapée au clavier : exactement la règle de main', () => {
    it('pour chaque couple nom × terme du corpus, le même résultat que main', () => {
        for (const term of TERMS) {
            const { result } = renderHook(() => useObservationFilters(CORPUS, filtersFor(term)));
            const got = new Set(result.current.sortedAndFilteredObservations.map(item => item.id));
            for (const item of CORPUS) {
                expect(got.has(item.id), `« ${term} » × « ${item.speciesName} / ${item.municipality} »`).toBe(mainRule(item, term));
            }
        }
    });

    it.each([
        ['mars', 'Pic mar'], ['Tours', 'Pic épeiche'], ['Saintes', 'Rougegorge familier'], ['Rennes', 'Renne'], ['Sables', 'Tourterelle des bois'],
    ])('« %s » ne trouve pas « %s » (repli du pluriel absent de la recherche tapée)', (term, species) => {
        const { result } = renderHook(() => useObservationFilters(CORPUS, filtersFor(term)));
        expect(result.current.sortedAndFilteredObservations.map(item => item.speciesName)).not.toContain(species);
    });
});

describe('texte d’une recherche en langage naturel appliquée : pluriel ignoré', () => {
    beforeEach(() => {
        localStorage.clear();
        setSessionIdentity('user-1');
    });

    it('« hirondelles rustiques en mai » trouve « Hirondelle rustique »', () => {
        const { result } = renderHook(() => useFilterControls({ onToast: vi.fn() }));
        act(() => {
            result.current.applyNaturalSearch({
                phrase: 'hirondelles rustiques en mai', source: 'local',
                criteria: { ...emptyCriteria(), text: 'hirondelles rustiques', period: { kind: 'month', days: null, month: 5, season: null, yearScope: 'all' } },
            });
        });
        expect(result.current.filters.searchTermFoldsPlural).toBe(true);
        const { result: list } = renderHook(() => useObservationFilters(CORPUS, result.current.filters));
        expect(list.current.sortedAndFilteredObservations.map(item => item.speciesName)).toEqual(['Hirondelle rustique']);
        // Le même texte tapé à la main suit la règle d'avant : aucun résultat.
        act(() => { result.current.clearNaturalSearch(); });
        act(() => { result.current.setSearchTerm('hirondelles rustiques'); });
        expect(result.current.filters.searchTermFoldsPlural).toBe(false);
        const { result: typed } = renderHook(() => useObservationFilters(CORPUS, result.current.filters));
        expect(typed.current.sortedAndFilteredObservations).toEqual([]);
    });
});
