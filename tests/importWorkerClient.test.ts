import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setSessionIdentity } from '../services/sessionScope';
import { parseImportInWorker } from '../services/importWorkerClient';

class WorkerFixture {
    static last: WorkerFixture;
    terminate = vi.fn(); postMessage = vi.fn(); onmessage: ((event: MessageEvent) => void) | null = null; onerror: (() => void) | null = null;
    constructor() { WorkerFixture.last = this; }
}
beforeEach(() => { localStorage.clear(); setSessionIdentity('A'); vi.stubGlobal('Worker', WorkerFixture); vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });
describe('cycle du Worker import', () => {
    it('termine réellement le Worker après 30 secondes', async () => {
        const result = parseImportInWorker(new File(['[]'], 'x.json'));
        const failed = expect(result).rejects.toThrow(/30 secondes/);
        await vi.advanceTimersByTimeAsync(30000); await failed;
        expect(WorkerFixture.last.terminate).toHaveBeenCalledOnce();
    });
    it('termine le Worker à annulation et au changement de compte', async () => {
        const controller = new AbortController();
        const first = parseImportInWorker(new File(['[]'], 'x.json'), controller.signal);
        const failed = expect(first).rejects.toThrow(/annulée/); controller.abort(); await failed;
        expect(WorkerFixture.last.terminate).toHaveBeenCalledOnce();
        const second = parseImportInWorker(new File(['[]'], 'x.json'));
        const stale = expect(second).rejects.toThrow(/annulée/); setSessionIdentity('B'); await stale;
        expect(WorkerFixture.last.terminate).toHaveBeenCalledOnce();
    });
    it('publie un résultat légitime puis termine le Worker', async () => {
        const result = parseImportInWorker(new File(['[]'], 'x.json'));
        WorkerFixture.last.onmessage?.({ data: { ok: true, value: { result: { observations: [], report: { blockingErrors: [] } }, media: [] } } } as MessageEvent);
        expect((await result).result.observations).toEqual([]);
        expect(WorkerFixture.last.terminate).toHaveBeenCalledOnce();
    });
});
