import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import JSZip from 'jszip';
import { Age, Comportement, ObservationCondition, Protocol, Sexe, Status, TaxonomicGroup, WeatherCondition } from '../types';

const saveAsMock = vi.fn();

vi.mock('file-saver', () => ({
    saveAs: saveAsMock
}));

const makeObservation = () => ({
    id: '123e4567-e89b-42d3-a456-426614174000',
    speciesName: 'Renard roux',
    latinName: 'Vulpes vulpes',
    taxonomicGroup: TaxonomicGroup.MAMMAL,
    date: '2026-03-10',
    time: '08:00',
    count: 1,
    maleCount: 1,
    femaleCount: 0,
    unidentifiedCount: 0,
    location: 'Bois',
    gps: { lat: null, lon: null },
    municipality: 'Lille',
    department: '59',
    country: 'France',
    altitude: null,
    comment: '',
    status: Status.NE,
    atlasCode: '',
    protocol: Protocol.OPPORTUNIST,
    sexe: Sexe.UNKNOWN,
    age: Age.UNKNOWN,
    observationCondition: ObservationCondition.UNKNOWN,
    comportement: Comportement.UNKNOWN,
    weather: WeatherCondition.UNKNOWN,
    photo: 'https://example.com/image.jpg',
    wikipediaImage: undefined,
    sound: undefined
});

describe('backupService.createBackup', () => {
    beforeEach(() => {
        saveAsMock.mockReset();
        vi.stubGlobal('fetch', vi.fn(async () => new Response(new Uint8Array([1, 2, 3]), { status: 200 })));
    });

    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it('generates a valid zip archive and saves it', async () => {
        const { createBackup } = await import('../services/backupService');
        const result = await createBackup([makeObservation()]);

        expect(saveAsMock).toHaveBeenCalledTimes(1);
        expect(result.totalObservations).toBe(1);
        expect(result.downloadedImages).toBe(1);
        expect(result.failedImages).toBe(0);

        const savedBlob = saveAsMock.mock.calls[0][0] as Blob;
        const zip = await JSZip.loadAsync(savedBlob);
        const fileNames = Object.keys(zip.files);

        expect(fileNames).toContain('data.json');
        expect(fileNames).toContain('data.csv');
        expect(fileNames).toContain('backup_manifest.json');
        expect(fileNames.some(name => name.startsWith('images/'))).toBe(true);
    });

    it('neutralizes CSV formula injection payloads in exported CSV', async () => {
        const { createBackup } = await import('../services/backupService');
        const maliciousObservation = {
            ...makeObservation(),
            speciesName: '=cmd|/C calc!A0',
            location: '+SUM(1,2)',
            municipality: '@evil'
        };

        await createBackup([maliciousObservation]);

        const savedBlob = saveAsMock.mock.calls[0][0] as Blob;
        const zip = await JSZip.loadAsync(savedBlob);
        const csv = await zip.file('data.csv')?.async('string');

        expect(csv).toContain(`"'=cmd|/C calc!A0"`);
        expect(csv).toContain(`"'+SUM(1,2)"`);
        expect(csv).toContain(`"'@evil"`);
    });

    it('SR-02 : embed une photo data: URL inline sans fetch réseau', async () => {
        const fetchSpy = vi.fn();
        vi.stubGlobal('fetch', fetchSpy);

        const dataUrl = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkAAIAAAoAAv/lxKUAAAAASUVORK5CYII=';
        const { createBackup } = await import('../services/backupService');
        const result = await createBackup([{ ...makeObservation(), photo: dataUrl, wikipediaImage: undefined }]);

        expect(fetchSpy).not.toHaveBeenCalled();
        expect(result.downloadedImages).toBe(1);
        expect(result.inlineMediaCount).toBe(1);
        expect(result.failedImages).toBe(0);

        const savedBlob = saveAsMock.mock.calls[0][0] as Blob;
        const zip = await JSZip.loadAsync(savedBlob);
        expect(Object.keys(zip.files).some(n => n.startsWith('images/inline_image_'))).toBe(true);
    });

    it('SR-03 : inclut un son data: URL dans le dossier sounds/', async () => {
        const soundUrl = 'data:audio/mp3;base64,AAAAAA==';
        const { createBackup } = await import('../services/backupService');
        const result = await createBackup([{ ...makeObservation(), photo: undefined, sound: soundUrl }]);

        expect(result.downloadedSounds).toBe(1);
        expect(result.failedSounds).toBe(0);

        const savedBlob = saveAsMock.mock.calls[0][0] as Blob;
        const zip = await JSZip.loadAsync(savedBlob);
        expect(Object.keys(zip.files).some(n => n.startsWith('sounds/'))).toBe(true);
    });

    it('SR-02 : blob: URL est comptée en échec et listée dans MEDIAS_MANQUANTS', async () => {
        const fetchSpy = vi.fn();
        vi.stubGlobal('fetch', fetchSpy);

        const { createBackup } = await import('../services/backupService');
        const result = await createBackup([{ ...makeObservation(), photo: 'blob:http://example.com/abc', wikipediaImage: undefined }]);

        expect(fetchSpy).not.toHaveBeenCalled();
        expect(result.downloadedImages).toBe(0);
        expect(result.failedImages).toBe(1);

        const savedBlob = saveAsMock.mock.calls[0][0] as Blob;
        const zip = await JSZip.loadAsync(savedBlob);
        expect(Object.keys(zip.files)).toContain('MEDIAS_MANQUANTS.txt');
    });

    it('SR-04 : includeImages=false skippe le téléchargement', async () => {
        const fetchSpy = vi.fn();
        vi.stubGlobal('fetch', fetchSpy);

        const { createBackup } = await import('../services/backupService');
        const result = await createBackup([makeObservation()], { includeImages: false });

        expect(fetchSpy).not.toHaveBeenCalled();
        expect(result.skippedImages).toBe(true);
        expect(result.downloadedImages).toBe(0);
    });

    it('SR-04 : estimateBackupSize agrège taille data: URL + placeholder http', async () => {
        const { estimateBackupSize } = await import('../services/backupService');
        const obs = {
            ...makeObservation(),
            photo: 'data:image/png;base64,' + 'A'.repeat(1000),
            wikipediaImage: 'https://example.com/wiki.jpg',
        };
        const size = estimateBackupSize([obs]);
        expect(size).toBeGreaterThan(500 * 1024);
    });

    it('SR-01 : readBackupZip rejette une archive sans data.json', async () => {
        const bogus = new JSZip();
        bogus.file('garbage.txt', 'nope');
        const blob = await bogus.generateAsync({ type: 'blob' });
        const file = new File([blob], 'bad.zip', { type: 'application/zip' });

        const { readBackupZip } = await import('../services/backupService');
        await expect(readBackupZip(file)).rejects.toThrow(/data\.json/);
    });

    it('SR-01 : round-trip create → readBackupZip restaure les observations', async () => {
        const dataUrl = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkAAIAAAoAAv/lxKUAAAAASUVORK5CYII=';
        const sourceObs = { ...makeObservation(), photo: dataUrl, wikipediaImage: undefined, sound: undefined };

        const { createBackup, readBackupZip } = await import('../services/backupService');
        await createBackup([sourceObs]);

        const savedBlob = saveAsMock.mock.calls[0][0] as Blob;
        const file = new File([savedBlob], 'carnet-backup.zip', { type: 'application/zip' });

        const restored = await readBackupZip(file);
        expect(restored.observations).toHaveLength(1);
        expect(restored.observations[0].speciesName).toBe(sourceObs.speciesName);
        // Photo data: URL est inlinée dans le ZIP puis ré-exposée en data: URL au restore
        expect(restored.observations[0].photo?.startsWith('data:')).toBe(true);
    });
});
