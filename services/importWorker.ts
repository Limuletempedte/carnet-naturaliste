import { parseImportFile } from './importFileParser';
self.onmessage = async (event: MessageEvent<File>) => {
    try { self.postMessage({ ok: true, value: await parseImportFile(event.data) }); }
    catch (error) { self.postMessage({ ok: false, error: error instanceof Error ? error.message : 'Fichier refusé.' }); }
};
