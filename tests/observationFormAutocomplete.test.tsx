import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Age, Comportement, Observation, ObservationCondition, Protocol, Sexe, Status, TaxonomicGroup } from '../types';

const {
    suggestSpeciesAutocompleteMock,
    fetchSpeciesInfoMock,
    mapINatIconicToTaxonomicGroupMock
} = vi.hoisted(() => ({
    suggestSpeciesAutocompleteMock: vi.fn(),
    fetchSpeciesInfoMock: vi.fn(),
    mapINatIconicToTaxonomicGroupMock: vi.fn((iconicName?: string) => {
        if (iconicName === 'Mammalia') return 'Mammifères';
        if (iconicName === 'Aves') return 'Oiseaux';
        return undefined;
    })
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
    photo: undefined,
    sound: undefined,
    wikipediaImage: undefined,
    ...overrides
});

describe('ObservationForm species autocomplete', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        Object.defineProperty(window, 'IntersectionObserver', {
            writable: true,
            value: MockIntersectionObserver
        });
        fetchSpeciesInfoMock.mockResolvedValue(null);
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('shows suggestions and applies selection with keyboard', async () => {
        suggestSpeciesAutocompleteMock.mockResolvedValue([
            {
                displayName: 'Mesange bleue',
                latinName: 'Cyanistes caeruleus',
                source: 'inat'
            }
        ]);

        const user = userEvent.setup();
        render(
            <ObservationForm
                onSave={vi.fn(async () => { })}
                onCancel={vi.fn()}
                initialData={null}
                onToast={vi.fn()}
            />
        );

        const speciesInput = screen.getByLabelText(/Nom de l'espèce/i) as HTMLInputElement;
        const latinInput = screen.getByLabelText(/Nom latin/i) as HTMLInputElement;

        await user.type(speciesInput, 'Mes');

        await waitFor(() => {
            expect(suggestSpeciesAutocompleteMock).toHaveBeenCalledWith('Mes', 5);
        }, { timeout: 3000 });

        expect(await screen.findByText('Mesange bleue')).toBeTruthy();

        await user.keyboard('{ArrowDown}{Enter}');

        expect(speciesInput.value).toBe('Mesange bleue');
        expect(latinInput.value).toBe('Cyanistes caeruleus');
    });

    it('closes suggestions on escape', async () => {
        suggestSpeciesAutocompleteMock.mockResolvedValue([
            {
                displayName: 'Mesange charbonniere',
                latinName: 'Parus major',
                source: 'inat'
            }
        ]);

        const user = userEvent.setup();
        render(
            <ObservationForm
                onSave={vi.fn(async () => { })}
                onCancel={vi.fn()}
                initialData={null}
                onToast={vi.fn()}
            />
        );

        const speciesInput = screen.getByLabelText(/Nom de l'espèce/i);
        await user.type(speciesInput, 'Mes');
        expect(await screen.findByText('Mesange charbonniere')).toBeTruthy();

        await user.keyboard('{Escape}');

        await waitFor(() => {
            expect(screen.queryByText('Mesange charbonniere')).toBeNull();
        });
    });

    it('replaces stale wikipedia image when switching to another species suggestion', async () => {
        suggestSpeciesAutocompleteMock.mockImplementation(async (query: string) => {
            if (query.toLowerCase().startsWith('mes')) {
                return [{
                    displayName: 'Mesange bleue',
                    latinName: 'Cyanistes caeruleus',
                    source: 'inat',
                    iconicTaxonName: 'Aves',
                    imageUrl: 'https://img.example/mesange.jpg'
                }];
            }
            if (query.toLowerCase().startsWith('ren')) {
                return [{
                    displayName: 'Renard roux',
                    latinName: 'Vulpes vulpes',
                    source: 'inat',
                    iconicTaxonName: 'Mammalia'
                }];
            }
            return [];
        });

        const onSave = vi.fn(async (_observation: Observation) => { });
        const user = userEvent.setup();

        render(
            <ObservationForm
                onSave={onSave}
                onCancel={vi.fn()}
                initialData={null}
                onToast={vi.fn()}
            />
        );

        const speciesInput = screen.getByLabelText(/Nom de l'espèce/i) as HTMLInputElement;

        await user.type(speciesInput, 'Mes');
        expect(await screen.findByText('Mesange bleue')).toBeTruthy();
        await user.keyboard('{ArrowDown}{Enter}');

        await user.clear(speciesInput);
        await user.type(speciesInput, 'Ren');
        expect(await screen.findByText('Renard roux')).toBeTruthy();
        await user.keyboard('{ArrowDown}{Enter}');

        await user.click(screen.getByRole('button', { name: /Sauvegarder/i }));

        await waitFor(() => {
            expect(onSave).toHaveBeenCalledTimes(1);
        });

        const savedObservation = onSave.mock.calls[0][0];
        expect(savedObservation.speciesName).toBe('Renard roux');
        expect(savedObservation.latinName).toBe('Vulpes vulpes');
        expect(savedObservation.taxonomicGroup).toBe(TaxonomicGroup.MAMMAL);
        expect(savedObservation.wikipediaImage).toBeUndefined();
    });

    it('keeps existing wikipedia image when same lookup returns info without image', async () => {
        fetchSpeciesInfoMock.mockResolvedValue({
            description: 'desc',
            imageUrl: null,
            sourceUrl: '',
            latinName: 'Vulpes vulpes',
            taxonomicGroup: TaxonomicGroup.BIRD,
            matchedBy: 'latin',
            confidence: 'high'
        });

        const onSave = vi.fn(async (_observation: Observation) => { });
        const user = userEvent.setup();

        render(
            <ObservationForm
                onSave={onSave}
                onCancel={vi.fn()}
                initialData={makeObservation({ wikipediaImage: 'https://img.example/existing.jpg' })}
                onToast={vi.fn()}
            />
        );

        await waitFor(() => {
            expect(fetchSpeciesInfoMock).toHaveBeenCalled();
        }, { timeout: 3000 });

        await user.click(screen.getByRole('button', { name: /Sauvegarder/i }));

        await waitFor(() => {
            expect(onSave).toHaveBeenCalledTimes(1);
        });

        const savedObservation = onSave.mock.calls[0][0];
        expect(savedObservation.wikipediaImage).toBe('https://img.example/existing.jpg');
        expect(savedObservation.taxonomicGroup).toBe(TaxonomicGroup.MAMMAL);
    });
});
