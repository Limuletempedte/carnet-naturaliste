import { setSessionIdentity } from '../services/sessionScope';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

const processOfflineQueueMock = vi.fn();
const getObservationsMock = vi.fn();
const getOfflineQueueSnapshotMock = vi.fn();

vi.mock('../services/storageService', () => ({
    processOfflineQueue: (...args: unknown[]) => processOfflineQueueMock(...args),
    getObservations: () => getObservationsMock(),
    getOfflineQueueSnapshot: () => getOfflineQueueSnapshotMock(),
}));

import { useSyncQueue } from '../hooks/useSyncQueue';

const makeParams = () => ({
    refreshOfflineQueueSnapshot: vi.fn(),
    setObservations: vi.fn(),
    setConnectionStatus: vi.fn(),
    onToast: vi.fn(),
});

describe('useSyncQueue', () => {
    beforeEach(() => {
        setSessionIdentity('user-1');
        vi.clearAllMocks();
        getObservationsMock.mockResolvedValue({ observations: [] });
        getOfflineQueueSnapshotMock.mockReturnValue([]);
        Object.defineProperty(navigator, 'onLine', { value: true, configurable: true, writable: true });
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('synchro réussie : recharge les observations, statut online, toast succès', async () => {
        processOfflineQueueMock.mockResolvedValue({ processed: 2, failed: 0, failureReasons: [], skippedItems: [] });
        const params = makeParams();
        const { result } = renderHook(() => useSyncQueue(params));

        await act(async () => { await result.current.resyncAll(); });

        expect(getObservationsMock).toHaveBeenCalled();
        expect(params.setObservations).toHaveBeenCalledWith([]);
        expect(params.setConnectionStatus).toHaveBeenCalledWith('online');
        expect(params.onToast).toHaveBeenCalledWith('success', expect.stringContaining('2 action'), 5000);
        expect(result.current.isSyncingQueue).toBe(false);
        expect(result.current.lastSyncResult).toMatchObject({ processed: 2, failed: 0 });
    });

    it('synchro partielle : statut degraded + toast warning', async () => {
        processOfflineQueueMock.mockResolvedValue({ processed: 3, failed: 1, failureReasons: ['boom'], skippedItems: [] });
        getOfflineQueueSnapshotMock.mockReturnValue([{ id: 'q1' }]);
        const params = makeParams();
        const { result } = renderHook(() => useSyncQueue(params));

        await act(async () => { await result.current.resyncAll(); });

        expect(params.setConnectionStatus).toHaveBeenCalledWith('degraded');
        expect(params.onToast).toHaveBeenCalledWith('warning', expect.stringContaining('Sync partielle'), 7000);
    });

    it('erreur de synchro : toast erreur, pas de crash', async () => {
        processOfflineQueueMock.mockRejectedValue(new Error('réseau coupé'));
        const params = makeParams();
        const { result } = renderHook(() => useSyncQueue(params));

        await act(async () => { await result.current.resyncAll(); });

        expect(params.onToast).toHaveBeenCalledWith('error', expect.stringContaining('réseau coupé'), 7000);
        expect(result.current.isSyncingQueue).toBe(false);
    });

    it('BUG-11 hors-ligne : toast warning explicite, processOfflineQueue non appelé', async () => {
        Object.defineProperty(navigator, 'onLine', { value: false, configurable: true, writable: true });
        const params = makeParams();
        const { result } = renderHook(() => useSyncQueue(params));

        await act(async () => { await result.current.resyncAll(); });

        expect(processOfflineQueueMock).not.toHaveBeenCalled();
        expect(params.onToast).toHaveBeenCalledWith('warning', expect.stringContaining('Hors-ligne'), 5000);
    });

    it('BUG-11 file vide : toast info « Rien à synchroniser » plutôt qu\'un faux succès', async () => {
        processOfflineQueueMock.mockResolvedValue({ processed: 0, failed: 0, failureReasons: [], skippedItems: [] });
        const params = makeParams();
        const { result } = renderHook(() => useSyncQueue(params));

        await act(async () => { await result.current.resyncAll(); });

        expect(params.onToast).toHaveBeenCalledWith('info', 'Rien à synchroniser.', 4000);
        expect(params.onToast).not.toHaveBeenCalledWith('success', expect.anything(), expect.anything());
    });

    it('retryQueueItem passe l\'id ciblé à processOfflineQueue', async () => {
        processOfflineQueueMock.mockResolvedValue({ processed: 1, failed: 0, failureReasons: [], skippedItems: [] });
        const params = makeParams();
        const { result } = renderHook(() => useSyncQueue(params));

        await act(async () => { await result.current.retryQueueItem('item-42'); });

        expect(processOfflineQueueMock).toHaveBeenCalledWith(
            expect.objectContaining({ itemIds: ['item-42'] })
        );
    });
});
