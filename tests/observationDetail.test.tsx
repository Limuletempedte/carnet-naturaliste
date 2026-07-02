import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ObservationDetail from '../components/ObservationDetail';
import { Age, Comportement, Observation, ObservationCondition, Protocol, Sexe, Status, TaxonomicGroup, WeatherCondition } from '../types';

const { fetchSpeciesInfoMock } = vi.hoisted(() => ({
    fetchSpeciesInfoMock: vi.fn()
}));

vi.mock('../services/speciesService', () => ({
    fetchSpeciesInfo: fetchSpeciesInfoMock
}));

// Leaflet ne fonctionne pas en jsdom → la mini-carte est remplacée par un stub.
vi.mock('../components/DetailMiniMap', () => ({
    default: () => <div data-testid="mini-map" />
}));

const makeObservation = (overrides: Partial<Observation> = {}): Observation => ({
    id: '123e4567-e89b-42d3-a456-426614174000',
    speciesName: 'Mésange bleue',
    latinName: 'Cyanistes caeruleus',
    taxonomicGroup: TaxonomicGroup.BIRD,
    date: '2026-03-01',
    time: '09:30',
    count: 3,
    location: 'Bois de la Citadelle',
    gps: { lat: null, lon: null },
    municipality: 'Lille',
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
    weather: WeatherCondition.UNKNOWN,
    photo: undefined,
    sound: undefined,
    wikipediaImage: undefined,
    ...overrides
});

const renderDetail = (observation: Observation, handlers: Partial<{
    onBack: () => void;
    onEdit: (id: string) => void;
    onDelete: (id: string) => void;
}> = {}) => render(
    <ObservationDetail
        observation={observation}
        onBack={handlers.onBack ?? vi.fn()}
        onEdit={handlers.onEdit ?? vi.fn()}
        onDelete={handlers.onDelete ?? vi.fn()}
    />
);

describe('ObservationDetail — vue lecture seule (EE-2)', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        fetchSpeciesInfoMock.mockResolvedValue(null);
    });

    it('affiche les informations principales de l\'observation', () => {
        renderDetail(makeObservation());

        expect(screen.getByRole('heading', { name: 'Mésange bleue' })).toBeTruthy();
        expect(screen.getByText('Cyanistes caeruleus')).toBeTruthy();
        expect(screen.getByText('Bois de la Citadelle')).toBeTruthy();
        expect(screen.getByText('Lille')).toBeTruthy();
        // Date française avec heure (hero + section Conditions).
        expect(screen.getAllByText('1 mars 2026 à 09:30').length).toBeGreaterThan(0);
        expect(screen.getByText('3 individus')).toBeTruthy();
    });

    it('masque les champs « Non renseigné » et la section Commentaire vide', () => {
        renderDetail(makeObservation());

        expect(screen.queryByText('Non renseigné')).toBeNull();
        expect(screen.queryByText('Sexe')).toBeNull();
        expect(screen.queryByText('Météo')).toBeNull();
        expect(screen.queryByText('Commentaire')).toBeNull();
    });

    it('affiche les champs renseignés (sexe, météo, commentaire)', () => {
        renderDetail(makeObservation({
            sexe: Sexe.MALE,
            weather: WeatherCondition.SUNNY,
            comment: 'Chante depuis la haie.'
        }));

        expect(screen.getByText('Sexe')).toBeTruthy();
        expect(screen.getByText('Mâle')).toBeTruthy();
        expect(screen.getByText('Météo')).toBeTruthy();
        expect(screen.getByText('Ensoleillé')).toBeTruthy();
        expect(screen.getByText('Commentaire')).toBeTruthy();
        expect(screen.getByText('Chante depuis la haie.')).toBeTruthy();
    });

    it('affiche le code atlas formaté, et rien si le code est vide', () => {
        const { unmount } = renderDetail(makeObservation({ atlasCode: '15' }));
        expect(screen.getByText('Code atlas')).toBeTruthy();
        expect(screen.getByText('15 — Nid avec œufs')).toBeTruthy();
        unmount();

        renderDetail(makeObservation({ atlasCode: '' }));
        expect(screen.queryByText('Code atlas')).toBeNull();
    });

    it('appelle onBack, onEdit et onDelete via les boutons', () => {
        const onBack = vi.fn();
        const onEdit = vi.fn();
        const onDelete = vi.fn();
        const obs = makeObservation();
        renderDetail(obs, { onBack, onEdit, onDelete });

        fireEvent.click(screen.getByRole('button', { name: /Retour/ }));
        expect(onBack).toHaveBeenCalledTimes(1);

        fireEvent.click(screen.getByRole('button', { name: 'Modifier' }));
        expect(onEdit).toHaveBeenCalledWith(obs.id);

        fireEvent.click(screen.getByRole('button', { name: 'Supprimer' }));
        expect(onDelete).toHaveBeenCalledWith(obs.id);
    });

    it('affiche la description de l\'espèce quand le service répond', async () => {
        fetchSpeciesInfoMock.mockResolvedValue({
            description: 'Petit passereau au plumage bleu et jaune.',
            imageUrl: null,
            sourceUrl: 'https://fr.wikipedia.org/wiki/M%C3%A9sange_bleue'
        });
        renderDetail(makeObservation());

        expect(await screen.findByText('Petit passereau au plumage bleu et jaune.')).toBeTruthy();
        expect(screen.getByRole('link', { name: /Voir la source/ })).toBeTruthy();
    });

    it('reste stable si la récupération des infos espèce échoue (échec silencieux)', async () => {
        fetchSpeciesInfoMock.mockRejectedValue(new Error('network down'));
        renderDetail(makeObservation());

        await waitFor(() => expect(screen.queryByText('Chargement…')).toBeNull());
        expect(screen.getByRole('heading', { name: 'Mésange bleue' })).toBeTruthy();
        expect(screen.queryByText(/erreur/i)).toBeNull();
    });

    it('affiche la mini-carte et les coordonnées GPS quand elles existent', async () => {
        renderDetail(makeObservation({ gps: { lat: 48.8534, lon: 2.3486 }, altitude: 35 }));

        expect(await screen.findByTestId('mini-map')).toBeTruthy();
        expect(screen.getByText('48.85340, 2.34860')).toBeTruthy();
        expect(screen.getByText('35 m')).toBeTruthy();
    });

    it('n\'affiche pas de carte quand le GPS est absent', () => {
        renderDetail(makeObservation({ gps: { lat: null, lon: null } }));

        expect(screen.queryByTestId('mini-map')).toBeNull();
        expect(screen.queryByText('Coordonnées GPS')).toBeNull();
    });

    it('affiche le lecteur audio uniquement si un son est présent', () => {
        const { container, unmount } = renderDetail(makeObservation({ sound: 'https://example.com/chant.mp3' }));
        expect(screen.getByText('Son')).toBeTruthy();
        expect(container.querySelector('audio')).toBeTruthy();
        unmount();

        const { container: containerWithout } = renderDetail(makeObservation());
        expect(screen.queryByText('Son')).toBeNull();
        expect(containerWithout.querySelector('audio')).toBeNull();
    });
});
