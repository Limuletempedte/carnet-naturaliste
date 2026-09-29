export const IMPORT_LIMITS = {
    file: 15 * 1024 * 1024, observations: 10_000, columns: 120, excelExpanded: 50 * 1024 * 1024,
    zip: 500 * 1024 * 1024, expanded: 512 * 1024 * 1024, media: 20 * 1024 * 1024, entries: 20_005, timeout: 30_000,
} as const;
export const readBlobBuffer = (blob: Blob): Promise<ArrayBuffer> => blob.arrayBuffer ? blob.arrayBuffer() : new Promise((resolve, reject) => {
    const reader = new FileReader(); reader.onload = () => resolve(reader.result as ArrayBuffer); reader.onerror = () => reject(reader.error); reader.readAsArrayBuffer(blob);
});
