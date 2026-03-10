import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import JSZip from 'jszip';
import { Age, Comportement, ObservationCondition, Protocol, Sexe, Status, TaxonomicGroup } from '../types';

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
});
