import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { WeatherCondition } from '../types';

const {
    suggestSpeciesAutocompleteMock,
    fetchSpeciesInfoMock,
    mapINatIconicToTaxonomicGroupMock,
    fetchAltitudeMock,
    fetchWeatherMock
} = vi.hoisted(() => ({
    suggestSpeciesAutocompleteMock: vi.fn(),
    fetchSpeciesInfoMock: vi.fn(),
    mapINatIconicToTaxonomicGroupMock: vi.fn(() => undefined),
    fetchAltitudeMock: vi.fn(),
    fetchWeatherMock: vi.fn()
}));

vi.mock('../services/speciesService', () => ({
    suggestSpeciesAutocomplete: suggestSpeciesAutocompleteMock,
    fetchSpeciesInfo: fetchSpeciesInfoMock,
    mapINatIconicToTaxonomicGroup: mapINatIconicToTaxonomicGroupMock
}));

vi.mock('../services/locationService', () => ({
    fetchAltitude: fetchAltitudeMock,
    fetchWeather: fetchWeatherMock
}));

// MapInput est lazy-loadé ; on le remplace par un bouton qui simule un point posé.
vi.mock('../components/MapInput', () => ({
    default: ({ onLocationChange }: { onLocationChange: (lat: number, lon: number, m: string, l: string, d: string, c: string) => void }) => (
        <button type="button" onClick={() => onLocationChange(48.85, 2.35, 'Paris', 'Rue de Rivoli', '75', 'France')}>
            mock-locate
        </button>
    )
}));

import ObservationForm from '../components/ObservationForm';

class MockIntersectionObserver {
    observe() { }
    unobserve() { }
    disconnect() { }
}

type User = ReturnType<typeof userEvent.setup>;

describe('ObservationForm — météo auto', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        Object.defineProperty(window, 'IntersectionObserver', { writable: true, value: MockIntersectionObserver });
        window.scrollTo = vi.fn();
        suggestSpeciesAutocompleteMock.mockResolvedValue([]);
        fetchSpeciesInfoMock.mockResolvedValue(null);
        fetchAltitudeMock.mockResolvedValue(null);
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    const locateOnMap = async (user: User) => {
        await user.click(screen.getByRole('button', { name: /Localiser sur la carte/i }));
        await user.click(await screen.findByRole('button', { name: 'mock-locate' }));
    };

    const openAdvancedDetails = async (user: User) => {
        const toggles = screen.getAllByRole('button', { name: /Afficher les détails avancés/i });
        await user.click(toggles[toggles.length - 1]);
    };

    const weatherSelect = () => screen.getByRole('combobox', { name: /Conditions météo/i }) as HTMLSelectElement;

    it('remplit automatiquement la météo selon la position', async () => {
        fetchWeatherMock.mockResolvedValue(WeatherCondition.RAIN);
        const user = userEvent.setup();
        render(<ObservationForm onSave={vi.fn(async () => { })} onCancel={vi.fn()} initialData={null} onToast={vi.fn()} />);

        await locateOnMap(user);
        await waitFor(() => expect(fetchWeatherMock).toHaveBeenCalled());

        await openAdvancedDetails(user);
        await waitFor(() => expect(weatherSelect().value).toBe(WeatherCondition.RAIN));
    });

    it('n’écrase pas un choix météo manuel (et ne ré-interroge pas l’API)', async () => {
        fetchWeatherMock.mockResolvedValue(WeatherCondition.SUNNY);
        const user = userEvent.setup();
        render(<ObservationForm onSave={vi.fn(async () => { })} onCancel={vi.fn()} initialData={null} onToast={vi.fn()} />);

        await openAdvancedDetails(user);
        await user.selectOptions(weatherSelect(), WeatherCondition.STORM);
        expect(weatherSelect().value).toBe(WeatherCondition.STORM);

        await locateOnMap(user);
        await waitFor(() => expect(fetchAltitudeMock).toHaveBeenCalled());

        expect(fetchWeatherMock).not.toHaveBeenCalled();
        expect(weatherSelect().value).toBe(WeatherCondition.STORM);
    });
});
