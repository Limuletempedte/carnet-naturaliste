import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const {
    suggestSpeciesAutocompleteMock,
    fetchSpeciesInfoMock
} = vi.hoisted(() => ({
    suggestSpeciesAutocompleteMock: vi.fn(),
    fetchSpeciesInfoMock: vi.fn()
}));

vi.mock('../services/speciesService', () => ({
    suggestSpeciesAutocomplete: suggestSpeciesAutocompleteMock,
    fetchSpeciesInfo: fetchSpeciesInfoMock
}));

import ObservationForm from '../components/ObservationForm';

class MockIntersectionObserver {
    observe() { }
    unobserve() { }
    disconnect() { }
}

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
});
