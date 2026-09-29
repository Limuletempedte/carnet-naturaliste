import { IMPORT_LIMITS } from './importLimits';
import { assertSessionContext, captureSessionContext } from './sessionScope';
import { registerPendingMedia } from './privateMediaService';
import type { ParsedImport } from './importFileParser';
import type { ImportResult } from './excelImportService';

export interface ImportPreview { result: ImportResult; release: () => void }
export const parseImportInWorker = (file: File, signal?: AbortSignal): Promise<ImportPreview> => {
    const context = captureSessionContext();
    const zip = file.name.toLowerCase().endsWith('.zip');
    if (file.size > (zip ? IMPORT_LIMITS.zip : IMPORT_LIMITS.file)) return Promise.reject(new Error('Fichier trop volumineux.'));
    return new Promise((resolve, reject) => {
        const worker = new Worker(new URL('./importWorker.ts', import.meta.url), { type: 'module' });
        let settled = false;
        const stop = () => { worker.terminate(); clearTimeout(timer); signal?.removeEventListener('abort', cancel); context.signal.removeEventListener('abort', cancel); };
        const fail = (error: Error) => { if (settled) return; settled = true; stop(); reject(error); };
        const cancel = () => fail(new Error('Analyse annulée.'));
        const timer = setTimeout(() => fail(new Error('Analyse interrompue après 30 secondes. Réduisez la taille du fichier.')), IMPORT_LIMITS.timeout);
        signal?.addEventListener('abort', cancel, { once: true }); context.signal.addEventListener('abort', cancel, { once: true });
        worker.onerror = () => fail(new Error('Impossible d’analyser ce fichier.'));
        worker.onmessage = (event: MessageEvent<{ ok: boolean; value?: ParsedImport; error?: string }>) => {
            if (settled) return;
            const leases: Array<{ release: () => void }> = [];
            try {
                assertSessionContext(context);
                if (!event.data.ok || !event.data.value) throw new Error(event.data.error || 'Fichier refusé.');
                const { result, media } = event.data.value;
                const urls = new Map<string, string>();
                for (const entry of media) { const lease = registerPendingMedia(entry.blob, context); leases.push(lease); urls.set(entry.reference, lease.url); }
                for (const observation of result.observations) for (const field of ['photo', 'sound'] as const) {
                    if (observation[field]?.startsWith('import-media:')) observation[field] = urls.get(observation[field]!);
                }
                settled = true; stop(); resolve({ result, release: () => leases.forEach(lease => lease.release()) });
            } catch (error) { leases.forEach(lease => lease.release()); fail(error instanceof Error ? error : new Error('Fichier refusé.')); }
        };
        if (signal?.aborted || context.signal.aborted) cancel();
        else worker.postMessage(file);
    });
};
