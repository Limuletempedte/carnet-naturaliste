import { setSessionIdentity } from '../services/sessionScope';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Observation, WeatherCondition } from '../types';

const {
    suggestSpeciesAutocompleteMock,
    fetchSpeciesInfoMock,
    mapINatIconicToTaxonomicGroupMock,
    fetchAltitudeMock,
    fetchWeatherMock,
    reverseGeocodeMock
} = vi.hoisted(() => ({
    suggestSpeciesAutocompleteMock: vi.fn(),
    fetchSpeciesInfoMock: vi.fn(),
    mapINatIconicToTaxonomicGroupMock: vi.fn(() => undefined),
    fetchAltitudeMock: vi.fn(),
    fetchWeatherMock: vi.fn(),
    reverseGeocodeMock: vi.fn()
}));

vi.mock('../services/speciesService', () => ({
    suggestSpeciesAutocomplete: suggestSpeciesAutocompleteMock,
    fetchSpeciesInfo: fetchSpeciesInfoMock,
    mapINatIconicToTaxonomicGroup: mapINatIconicToTaxonomicGroupMock
}));

vi.mock('../services/locationService', () => ({
    fetchAltitude: fetchAltitudeMock,
    fetchWeather: fetchWeatherMock,
    reverseGeocode: reverseGeocodeMock
}));

import ObservationForm from '../components/ObservationForm';

class MockIntersectionObserver {
    observe() { }
    unobserve() { }
    disconnect() { }
}

describe('ObservationForm — position initiale (clic sur la carte, EE-1)', () => {
    beforeEach(() => {
        setSessionIdentity('user-1');
        vi.clearAllMocks();
        Object.defineProperty(window, 'IntersectionObserver', { writable: true, value: MockIntersectionObserver });
        window.scrollTo = vi.fn();
        suggestSpeciesAutocompleteMock.mockResolvedValue([]);
        fetchSpeciesInfoMock.mockResolvedValue(null);
        fetchAltitudeMock.mockResolvedValue(123);
        fetchWeatherMock.mockResolvedValue(WeatherCondition.SUNNY);
        reverseGeocodeMock.mockResolvedValue({
            lat: 45.75, lon: 4.85, displayName: 'Lyon',
            address: { municipality: 'Lyon', location: 'Parc de la Tête d’or', department: '69', country: 'France' }
        });
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('pré-remplit position, adresse, altitude et météo depuis initialPosition', async () => {
        const onSave = vi.fn(async (_obs: Observation) => { });
        const user = userEvent.setup();
        render(
            <ObservationForm
                onSave={onSave}
                onCancel={vi.fn()}
                initialData={null}
                initialPosition={{ lat: 45.75, lon: 4.85 }}
                onToast={vi.fn()}
            />
        );

        await waitFor(() => expect(reverseGeocodeMock).toHaveBeenCalledWith(45.75, 4.85));
        await waitFor(() => expect(fetchWeatherMock).toHaveBeenCalled());

        await user.type(screen.getByLabelText(/Nom de l'espèce/i), 'Renard roux');
        await user.click(screen.getByRole('button', { name: /^Sauvegarder$/i }));

        await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
        const saved = onSave.mock.calls[0][0];
        expect(saved.gps).toEqual({ lat: 45.75, lon: 4.85 });
        expect(saved.municipality).toBe('Lyon');
        expect(saved.altitude).toBe(123);
        expect(saved.weather).toBe(WeatherCondition.SUNNY);
    });

    it('n’appelle pas le géocodage inverse sans position initiale', async () => {
        render(
            <ObservationForm onSave={vi.fn(async () => { })} onCancel={vi.fn()} initialData={null} onToast={vi.fn()} />
        );
        // Laisse le temps à d'éventuels effets de tourner.
        await Promise.resolve();
        expect(reverseGeocodeMock).not.toHaveBeenCalled();
    });

    it('ignore initialPosition en mode édition (initialData prioritaire)', async () => {
        const existing: Observation = {
            id: '123e4567-e89b-42d3-a456-426614174000',
            speciesName: 'Mésange', latinName: 'Parus major', taxonomicGroup: 'Oiseaux' as never,
            date: '2026-03-01', time: '10:00', count: 1, location: 'Bois',
            gps: { lat: 10, lon: 20 }, municipality: 'Ailleurs', department: '01', country: 'France',
            altitude: 5, comment: '', status: 'Non évalué' as never, atlasCode: '',
            protocol: 'Opportuniste' as never, sexe: 'Inconnu' as never, age: 'Inconnu' as never,
            observationCondition: 'Non renseigné' as never, comportement: 'Non renseigné' as never,
            weather: WeatherCondition.UNKNOWN
        };
        render(
            <ObservationForm
                onSave={vi.fn(async () => { })}
                onCancel={vi.fn()}
                initialData={existing}
                initialPosition={{ lat: 45.75, lon: 4.85 }}
                onToast={vi.fn()}
            />
        );
        await Promise.resolve();
        expect(reverseGeocodeMock).not.toHaveBeenCalled();
    });
});
