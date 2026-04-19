import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import type { User } from '@supabase/supabase-js';

const getOfflineQueueSnapshotMock = vi.fn();
vi.mock('../services/storageService', () => ({
    getOfflineQueueSnapshot: () => getOfflineQueueSnapshotMock(),
}));

// Import after mock
import { useOfflineQueue } from '../hooks/useOfflineQueue';

const fakeUser = { id: 'user-1' } as unknown as User;

describe('useOfflineQueue', () => {
    beforeEach(() => {
        getOfflineQueueSnapshotMock.mockReset();
    });

    it('retourne [] quand aucun utilisateur', () => {
        const { result } = renderHook(() => useOfflineQueue(null));
        expect(result.current.offlineQueueItems).toEqual([]);
        expect(getOfflineQueueSnapshotMock).not.toHaveBeenCalled();
    });

    it('recupere la snapshot au mount quand un utilisateur est present', () => {
        getOfflineQueueSnapshotMock.mockReturnValue([{ id: '1', action: 'INSERT' }]);
        const { result } = renderHook(() => useOfflineQueue(fakeUser));
        expect(result.current.offlineQueueItems).toHaveLength(1);
        expect(getOfflineQueueSnapshotMock).toHaveBeenCalled();
    });

    it('retourne [] si getOfflineQueueSnapshot jette', () => {
        getOfflineQueueSnapshotMock.mockImplementation(() => { throw new Error('cache corrompu'); });
        const { result } = renderHook(() => useOfflineQueue(fakeUser));
        expect(result.current.offlineQueueItems).toEqual([]);
    });
});
