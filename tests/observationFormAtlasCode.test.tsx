import { render, screen, waitFor } from '@testing-library/react';
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
    speciesName: 'Mésange bleue',
    latinName: 'Cyanistes caeruleus',
    taxonomicGroup: TaxonomicGroup.BIRD,
    date: '2026-05-01',
    time: '09:00',
    count: 1,
    location: 'Jardin',
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

describe('ObservationForm — code atlas (liste déroulante)', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        Object.defineProperty(window, 'IntersectionObserver', {
            writable: true,
            value: MockIntersectionObserver
        });
        suggestSpeciesAutocompleteMock.mockResolvedValue([]);
        fetchSpeciesInfoMock.mockResolvedValue(null);
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    const openAdvancedDetails = async (user: ReturnType<typeof userEvent.setup>) => {
        // Deux sections partagent le libellé « Afficher les détails avancés »
        // (Localisation puis Détails) ; le code atlas est dans la section Détails (la dernière).
        const toggles = screen.getAllByRole('button', { name: /Afficher les détails avancés/i });
        await user.click(toggles[toggles.length - 1]);
    };

    it('propose les codes EBCC et enregistre le code choisi', async () => {
        const onSave = vi.fn(async (_observation: Observation) => { });
        const user = userEvent.setup();
        render(
            <ObservationForm onSave={onSave} onCancel={vi.fn()} initialData={makeObservation()} onToast={vi.fn()} />
        );

        await openAdvancedDetails(user);

        const atlasSelect = screen.getByRole('combobox', { name: /Code atlas/i }) as HTMLSelectElement;
        // Un libellé EBCC connu est présent dans la liste.
        expect(screen.getByRole('option', { name: /15 — Nid avec œufs/i })).toBeTruthy();

        await user.selectOptions(atlasSelect, '15');
        expect(atlasSelect.value).toBe('15');

        await user.click(screen.getByRole('button', { name: /Sauvegarder/i }));

        await waitFor(() => {
            expect(onSave).toHaveBeenCalledTimes(1);
        });
        expect(onSave.mock.calls[0][0].atlasCode).toBe('15');
    });

    it('préserve une valeur héritée hors liste (ancien code / texte libre)', async () => {
        const onSave = vi.fn(async (_observation: Observation) => { });
        const user = userEvent.setup();
        render(
            <ObservationForm onSave={onSave} onCancel={vi.fn()} initialData={makeObservation({ atlasCode: '19' })} onToast={vi.fn()} />
        );

        await openAdvancedDetails(user);

        const atlasSelect = screen.getByRole('combobox', { name: /Code atlas/i }) as HTMLSelectElement;
        // La valeur héritée reste sélectionnée (option « Valeur actuelle »).
        expect(atlasSelect.value).toBe('19');
        expect(screen.getByRole('option', { name: '19' })).toBeTruthy();

        // Sans y toucher, la sauvegarde conserve la valeur héritée.
        await user.click(screen.getByRole('button', { name: /Sauvegarder/i }));

        await waitFor(() => {
            expect(onSave).toHaveBeenCalledTimes(1);
        });
        expect(onSave.mock.calls[0][0].atlasCode).toBe('19');
    });

    it('permet de vider le code via « Non concerné »', async () => {
        const onSave = vi.fn(async (_observation: Observation) => { });
        const user = userEvent.setup();
        render(
            <ObservationForm onSave={onSave} onCancel={vi.fn()} initialData={makeObservation({ atlasCode: '15' })} onToast={vi.fn()} />
        );

        await openAdvancedDetails(user);

        const atlasSelect = screen.getByRole('combobox', { name: /Code atlas/i }) as HTMLSelectElement;
        expect(atlasSelect.value).toBe('15');

        await user.selectOptions(atlasSelect, '');
        expect(atlasSelect.value).toBe('');

        await user.click(screen.getByRole('button', { name: /Sauvegarder/i }));

        await waitFor(() => {
            expect(onSave).toHaveBeenCalledTimes(1);
        });
        expect(onSave.mock.calls[0][0].atlasCode).toBe('');
    });
});
