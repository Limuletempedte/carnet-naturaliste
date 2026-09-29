import { setSessionIdentity } from '../services/sessionScope';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { View, type Observation } from '../types';
import type { ImportResult } from '../services/excelImportService';

const saveObservationMock = vi.fn();
const updateObservationMock = vi.fn();
const bulkUpsertObservationsInCacheMock = vi.fn();
const isDuplicateKeyErrorMock = vi.fn();
const buildImportPersistencePlanMock = vi.fn();

vi.mock('../services/storageService', () => ({
    saveObservation: (...a: unknown[]) => saveObservationMock(...a),
    updateObservation: (...a: unknown[]) => updateObservationMock(...a),
    bulkUpsertObservationsInCache: (...a: unknown[]) => bulkUpsertObservationsInCacheMock(...a),
    isDuplicateKeyError: (...a: unknown[]) => isDuplicateKeyErrorMock(...a),
}));
vi.mock('../services/importPolicy', () => ({
    buildImportPersistencePlan: (...a: unknown[]) => buildImportPersistencePlanMock(...a),
}));

import { useImportObservations } from '../hooks/useImportObservations';

const obs = (id: string, date = '2026-03-01'): Observation =>
    ({ id, speciesName: 'X', date } as unknown as Observation);

const makeResult = (over: Partial<ImportResult['report']> = {}): ImportResult =>
    ({
        observations: [],
        report: { blockingErrors: [], warnings: [], errors: [], ...over },
    } as unknown as ImportResult);

const makeParams = () => ({
    observations: [obs('existing', '2026-01-01')],
    setObservations: vi.fn(),
    setView: vi.fn(),
    setError: vi.fn(),
    onToast: vi.fn(() => 'toast-id'),
    removeToast: vi.fn(),
    refreshOfflineQueueSnapshot: vi.fn(),
});

describe('useImportObservations', () => {
    beforeEach(() => {
        setSessionIdentity('user-1');
        vi.clearAllMocks();
        isDuplicateKeyErrorMock.mockReturnValue(false);
    });

    it('import réussi (insert + update) : met à jour state trié, cache, vue LIST, toast succès', async () => {
        buildImportPersistencePlanMock.mockReturnValue([
            { observation: obs('a', '2026-05-01'), mode: 'insert', regeneratedId: false, originalId: 'a' },
            { observation: obs('b', '2026-04-01'), mode: 'update', regeneratedId: false, originalId: 'b' },
        ]);
        saveObservationMock.mockResolvedValue({ id: 'a' });
        updateObservationMock.mockResolvedValue(undefined);

        const params = makeParams();
        const { result } = renderHook(() => useImportObservations(params));

        await act(async () => {
            await result.current.handleImportRequest(makeResult());
        });

        expect(params.setObservations).toHaveBeenCalledTimes(1);
        const merged = params.setObservations.mock.calls[0][0] as Observation[];
        // tri par date décroissante : a (mai) > b (avril) > existing (janvier)
        expect(merged.map(o => o.id)).toEqual(['a', 'b', 'existing']);
        expect(bulkUpsertObservationsInCacheMock).toHaveBeenCalled();
        expect(params.setView).toHaveBeenCalledWith(View.LIST);
        expect(params.onToast).toHaveBeenCalledWith('success', expect.stringContaining('1 ajoutée(s), 1 mise(s) à jour, 0 échec(s)'), expect.any(Number));
        expect(result.current.isImporting).toBe(false);
    });

    it('collision PK : régénère un UUID et réessaie, puis toast info IDs régénérés', async () => {
        buildImportPersistencePlanMock.mockReturnValue([
            { observation: obs('dup'), mode: 'insert', regeneratedId: false, originalId: 'dup' },
        ]);
        saveObservationMock
            .mockRejectedValueOnce(new Error('duplicate key value violates unique constraint'))
            .mockResolvedValueOnce({ id: 'new-uuid' });
        isDuplicateKeyErrorMock.mockReturnValue(true);

        const params = makeParams();
        const { result } = renderHook(() => useImportObservations(params));

        await act(async () => {
            await result.current.handleImportRequest(makeResult());
        });

        expect(saveObservationMock).toHaveBeenCalledTimes(2); // 1er échec + retry
        expect(params.onToast).toHaveBeenCalledWith('success', expect.stringContaining('1 ajoutée(s)'), expect.any(Number));
        expect(params.onToast).toHaveBeenCalledWith('info', expect.stringContaining('nouvel ID'), expect.any(Number));
    });

    it('échecs partiels : toast warning + résumé des échecs, n\'ajoute que les réussites', async () => {
        buildImportPersistencePlanMock.mockReturnValue([
            { observation: obs('ok', '2026-05-01'), mode: 'insert', regeneratedId: false, originalId: 'ok' },
            { observation: obs('ko'), mode: 'insert', regeneratedId: false, originalId: 'ko' },
        ]);
        saveObservationMock.mockImplementation((o: Observation) =>
            o.id === 'ko' ? Promise.reject(new Error('réseau')) : Promise.resolve({ id: 'ok' })
        );

        const params = makeParams();
        const { result } = renderHook(() => useImportObservations(params));

        await act(async () => {
            await result.current.handleImportRequest(makeResult());
        });

        const merged = params.setObservations.mock.calls[0][0] as Observation[];
        expect(merged.map(o => o.id).sort()).toEqual(['existing', 'ok']);
        expect(params.onToast).toHaveBeenCalledWith('warning', expect.stringContaining('1 échec(s)'), expect.any(Number));
        expect(params.onToast).toHaveBeenCalledWith('error', expect.stringContaining('réseau'), expect.any(Number));
    });

    it('erreurs bloquantes : throw avant tout traitement, isImporting repasse false', async () => {
        const params = makeParams();
        const { result } = renderHook(() => useImportObservations(params));

        await act(async () => {
            await expect(
                result.current.handleImportRequest(makeResult({ blockingErrors: ['ligne 3 invalide'] as unknown as ImportResult['report']['blockingErrors'] }))
            ).rejects.toThrow(/bloquante/);
        });

        expect(buildImportPersistencePlanMock).not.toHaveBeenCalled();
        expect(params.setObservations).not.toHaveBeenCalled();
        expect(result.current.isImporting).toBe(false);
    });
});
