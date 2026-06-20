import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Age, Comportement, Observation, ObservationCondition, Protocol, Sexe, Status, TaxonomicGroup, WeatherCondition } from '../types';

const {
    suggestSpeciesAutocompleteMock,
    fetchSpeciesInfoMock,
    mapINatIconicToTaxonomicGroupMock
} = vi.hoisted(() => ({
    suggestSpeciesAutocompleteMock: vi.fn(),
    fetchSpeciesInfoMock: vi.fn(),
    mapINatIconicToTaxonomicGroupMock: vi.fn(() => undefined)
}));

vi.mock('../services/speciesService', () => ({
    suggestSpeciesAutocomplete: suggestSpeciesAutocompleteMock,
    fetchSpeciesInfo: fetchSpeciesInfoMock,
    mapINatIconicToTaxonomicGroup: mapINatIconicToTaxonomicGroupMock
}));

import ObservationForm from '../components/ObservationForm';

class MockIntersectionObserver {
    observe() { }
    unobserve() { }
    disconnect() { }
}

const makeObservation = (overrides: Partial<Observation> = {}): Observation => ({
    id: '123e4567-e89b-42d3-a456-426614174000',
    speciesName: 'Renard roux',
    latinName: 'Vulpes vulpes',
    taxonomicGroup: TaxonomicGroup.MAMMAL,
    date: '2026-03-01',
    time: '12:00',
    count: 1,
    location: 'Bois',
    gps: { lat: null, lon: null },
    municipality: 'Lille',
    department: '59',
    country: 'France',
    altitude: null,
    comment: '',
    status: Status.NE,
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

describe('ObservationForm — « Enregistrer et ajouter une autre »', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        Object.defineProperty(window, 'IntersectionObserver', {
            writable: true,
            value: MockIntersectionObserver
        });
        window.scrollTo = vi.fn();
        suggestSpeciesAutocompleteMock.mockResolvedValue([]);
        fetchSpeciesInfoMock.mockResolvedValue(null);
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('enregistre en gardant le formulaire ouvert, conserve le contexte et vide l’espèce', async () => {
        const onSave = vi.fn(async (_obs: Observation, _options?: { keepFormOpen?: boolean }) => { });
        const user = userEvent.setup();
        render(
            <ObservationForm onSave={onSave} onCancel={vi.fn()} initialData={null} onToast={vi.fn()} />
        );

        const speciesInput = screen.getByLabelText(/Nom de l'espèce/i) as HTMLInputElement;
        const dateInput = screen.getByLabelText(/Date \*/i) as HTMLInputElement;
        const commentInput = screen.getByLabelText(/Commentaire/i) as HTMLTextAreaElement;

        await user.type(speciesInput, 'Mésange bleue');
        // Date = champ « contexte » conservé entre deux saisies (discriminant vs date du jour).
        fireEvent.change(dateInput, { target: { value: '2026-01-15' } });
        // Commentaire = champ propre à l’individu, doit être vidé.
        await user.type(commentInput, 'premier individu');

        await user.click(screen.getByRole('button', { name: /Enregistrer et ajouter une autre/i }));

        await waitFor(() => {
            expect(onSave).toHaveBeenCalledTimes(1);
        });
        // L’option keepFormOpen est bien transmise.
        expect(onSave.mock.calls[0][1]).toEqual({ keepFormOpen: true });
        const saved = onSave.mock.calls[0][0];
        expect(saved.speciesName).toBe('Mésange bleue');
        expect(saved.date).toBe('2026-01-15');
        expect(saved.comment).toBe('premier individu');

        // Le formulaire reste affiché et est réinitialisé pour la saisie suivante.
        expect(screen.getByRole('heading', { name: /Ajouter une observation/i })).toBeTruthy();
        await waitFor(() => {
            expect((screen.getByLabelText(/Nom de l'espèce/i) as HTMLInputElement).value).toBe('');
        });
        // Contexte conservé.
        expect((screen.getByLabelText(/Date \*/i) as HTMLInputElement).value).toBe('2026-01-15');
        // Champ propre à l’individu vidé.
        expect((screen.getByLabelText(/Commentaire/i) as HTMLTextAreaElement).value).toBe('');
    });

    it('le bouton « Sauvegarder » classique n’active pas keepFormOpen', async () => {
        const onSave = vi.fn(async (_obs: Observation, _options?: { keepFormOpen?: boolean }) => { });
        const user = userEvent.setup();
        render(
            <ObservationForm onSave={onSave} onCancel={vi.fn()} initialData={null} onToast={vi.fn()} />
        );

        await user.type(screen.getByLabelText(/Nom de l'espèce/i), 'Mésange bleue');
        await user.click(screen.getByRole('button', { name: /^Sauvegarder$/i }));

        await waitFor(() => {
            expect(onSave).toHaveBeenCalledTimes(1);
        });
        expect(onSave.mock.calls[0][1]?.keepFormOpen).toBeFalsy();
    });

    it('n’affiche pas le bouton « ajouter une autre » en mode édition', () => {
        render(
            <ObservationForm onSave={vi.fn(async () => { })} onCancel={vi.fn()} initialData={makeObservation()} onToast={vi.fn()} />
        );
        expect(screen.queryByRole('button', { name: /Enregistrer et ajouter une autre/i })).toBeNull();
    });
});
