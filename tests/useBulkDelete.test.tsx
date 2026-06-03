import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import type { Observation } from '../types';

const deleteObservationMock = vi.fn();
vi.mock('../services/storageService', () => ({
    deleteObservation: (id: string) => deleteObservationMock(id),
}));

import { useBulkDelete } from '../hooks/useBulkDelete';

interface ConfirmationRequest {
    title: string;
    message: string;
    onConfirm: () => void;
}

const observations = [
    { id: 'id1', speciesName: 'Mésange' },
    { id: 'id2', speciesName: 'Renard' },
    { id: 'id3', speciesName: 'Hibou' },
] as unknown as Observation[];

const makeParams = () => {
    let captured: ConfirmationRequest | null = null;
    const setConfirmation = vi.fn((c: ConfirmationRequest) => { captured = c; });
    return {
        params: {
            observations,
            setObservations: vi.fn(),
            setConfirmation,
            setError: vi.fn(),
            onToast: vi.fn(() => 'toast-id'),
            removeToast: vi.fn(),
            refreshOfflineQueueSnapshot: vi.fn(),
        },
        getConfirmation: () => captured,
    };
};

describe('useBulkDelete', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('ouvre un dialogue de confirmation avec un aperçu des noms', () => {
        const { params, getConfirmation } = makeParams();
        const { result } = renderHook(() => useBulkDelete(params));

        act(() => { result.current.handleBulkDeleteRequest(['id1', 'id2']); });

        expect(params.setConfirmation).toHaveBeenCalledTimes(1);
        const conf = getConfirmation();
        expect(conf?.message).toContain('Mésange');
        expect(conf?.message).toContain('Renard');
    });

    it('suppression réussie : retire les observations, toast succès, isBulkDeleting repasse false', async () => {
        deleteObservationMock.mockResolvedValue(undefined);
        const { params, getConfirmation } = makeParams();
        const { result } = renderHook(() => useBulkDelete(params));

        act(() => { result.current.handleBulkDeleteRequest(['id1', 'id2']); });
        await act(async () => { await getConfirmation()!.onConfirm(); });

        expect(deleteObservationMock).toHaveBeenCalledTimes(2);
        // L'updater de setObservations retire bien id1 et id2
        const updater = params.setObservations.mock.calls[0][0] as (prev: Observation[]) => Observation[];
        expect(updater(observations).map(o => o.id)).toEqual(['id3']);
        expect(params.refreshOfflineQueueSnapshot).toHaveBeenCalled();
        expect(params.onToast).toHaveBeenCalledWith('success', expect.stringContaining('2 observation'));
        expect(result.current.isBulkDeleting).toBe(false);
    });

    it('échecs partiels : toast warning + ne retire que les réussites', async () => {
        deleteObservationMock.mockImplementation((id: string) =>
            id === 'id2' ? Promise.reject(new Error('boom')) : Promise.resolve(undefined)
        );
        const { params, getConfirmation } = makeParams();
        const { result } = renderHook(() => useBulkDelete(params));

        act(() => { result.current.handleBulkDeleteRequest(['id1', 'id2']); });
        await act(async () => { await getConfirmation()!.onConfirm(); });

        // id1 réussit, id2 échoue → seul id1 retiré
        const updater = params.setObservations.mock.calls[0][0] as (prev: Observation[]) => Observation[];
        expect(updater(observations).map(o => o.id)).toEqual(['id2', 'id3']);
        expect(params.onToast).toHaveBeenCalledWith('warning', expect.stringContaining('échouée'));
        expect(result.current.isBulkDeleting).toBe(false);
    });
});
