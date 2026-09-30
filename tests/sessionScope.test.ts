import { beforeEach, describe, expect, it, vi } from 'vitest';
import { setSessionIdentity, captureSessionContext, assertSessionContext, inSession, isSessionCurrent, bindSessionCoordination, SESSION_IDENTITY_KEY, readAccountValue, writeAccountValue, removeUnownedLegacyState } from '../services/sessionScope';
import { pushEvent, getEventLog, __resetEventLogForTests } from '../utils/eventLog';

beforeEach(() => { localStorage.clear(); setSessionIdentity('A'); __resetEventLogForTests(); });
describe('frontière de session', () => {
    it('préserve une ancienne file de saisies sans la rendre accessible au compte suivant', () => {
        const queue = '[{"action":"INSERT","payload":{"speciesName":"saisie unique"}}]';
        localStorage.setItem('offline_sync_queue', queue);
        removeUnownedLegacyState();
        expect(localStorage.getItem('offline_sync_queue')).toBeNull();
        expect(localStorage.getItem('cn-unowned-offline-queue-v1')).toBe(queue);
        setSessionIdentity('B');
        expect(readAccountValue('offline_sync_queue')).toBeNull();
        removeUnownedLegacyState();
        expect(localStorage.getItem('cn-unowned-offline-queue-v1')).toBe(queue);
    });
    it('invalide A même après un retour A → B → A', () => {
        const old = captureSessionContext();
        setSessionIdentity('B'); setSessionIdentity('A');
        expect(old.signal.aborted).toBe(true);
        expect(() => assertSessionContext(old)).toThrow(/compte actif/);
        expect(isSessionCurrent(captureSessionContext())).toBe(true);
    });
    it('conserve la génération lors du renouvellement du même compte', () => {
        const ctx = captureSessionContext(); setSessionIdentity('A');
        expect(isSessionCurrent(ctx)).toBe(true);
    });
    it('arrête une attente et ne lance pas une opération déjà périmée', async () => {
        const ctx = captureSessionContext();
        let finish!: (value: string) => void;
        const pending = inSession(ctx, () => new Promise<string>(resolve => { finish = resolve; }));
        const rejected = expect(pending).rejects.toThrow(/compte actif/);
        setSessionIdentity('B'); await rejected; finish('secret A');
        const operation = vi.fn(async () => 'B');
        await expect(inSession(ctx, operation)).rejects.toThrow(/compte actif/);
        expect(operation).not.toHaveBeenCalled();
    });
    it('détecte l’autre onglet avant même la livraison de son événement', () => {
        const ctx = captureSessionContext();
        localStorage.setItem(SESSION_IDENTITY_KEY, JSON.stringify({ userId: 'B', sessionGeneration: 'remote' }));
        expect(() => writeAccountValue('history', 'secret A', ctx)).toThrow();
        const invalidated = vi.fn(); const stop = bindSessionCoordination(invalidated);
        window.dispatchEvent(new StorageEvent('storage', { key: SESSION_IDENTITY_KEY }));
        expect(invalidated).toHaveBeenCalledOnce();
        stop();
    });
    it('sépare les valeurs par propriétaire, sans attribuer les anciennes données', () => {
        writeAccountValue('prefs', 'private A', captureSessionContext());
        localStorage.setItem('map_search_history', '["private legacy"]');
        removeUnownedLegacyState();
        setSessionIdentity('B');
        expect(readAccountValue('prefs')).toBeNull();
        expect(localStorage.getItem('map_search_history')).toBeNull();
        writeAccountValue('prefs', 'private B', captureSessionContext());
        setSessionIdentity('A'); expect(readAccountValue('prefs')).toBe('private A');
    });
    it('ne conserve aucun détail privé dans les logs et isole leurs buffers', () => {
        pushEvent('error', ['[backupService] https://private.invalid/a?token=secret', { email: 'a@example.test', gps: [48, 2] }]);
        expect(getEventLog()[0].msg).toBe('backupService_ERROR');
        expect(JSON.stringify(localStorage)).not.toContain('private.invalid');
        setSessionIdentity('B'); expect(getEventLog()).toEqual([]);
        pushEvent('warn', ['private B']); expect(getEventLog()[0].msg).toBe('APP_WARN');
        setSessionIdentity('A'); expect(getEventLog()[0].msg).toBe('backupService_ERROR');
    });
});
