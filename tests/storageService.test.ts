import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Age, Comportement, ObservationCondition, Protocol, Sexe, Status, TaxonomicGroup } from '../types';

const authGetUserMock = vi.fn(async () => ({ data: { user: { id: 'user-1' } } }));

const orderMock = vi.fn();
const selectEqMock = vi.fn(() => ({ order: orderMock }));
const selectMock = vi.fn(() => ({ eq: selectEqMock, order: orderMock }));

const updateEqUserMock = vi.fn();
const updateEqIdMock = vi.fn(() => ({ eq: updateEqUserMock }));
const updateMock = vi.fn(() => ({ eq: updateEqIdMock }));

const deleteEqUserMock = vi.fn();
const deleteEqIdMock = vi.fn(() => ({ eq: deleteEqUserMock }));
const deleteMock = vi.fn(() => ({ eq: deleteEqIdMock }));

const insertSingleMock = vi.fn();
const insertSelectMock = vi.fn(() => ({ single: insertSingleMock }));
const insertMock = vi.fn(() => ({ select: insertSelectMock }));

const upsertMock = vi.fn();

const fromMock = vi.fn(() => ({
    select: selectMock,
    update: updateMock,
    delete: deleteMock,
    insert: insertMock,
    upsert: upsertMock
}));

const storageUploadMock = vi.fn();
const storageGetPublicUrlMock = vi.fn(() => ({ data: { publicUrl: 'https://example.com/file' } }));
const storageFromMock = vi.fn(() => ({
    upload: storageUploadMock,
    getPublicUrl: storageGetPublicUrlMock
}));

vi.mock('../supabaseClient', () => ({
    supabase: {
        from: fromMock,
        auth: {
            getUser: authGetUserMock
        },
        storage: {
            from: storageFromMock
        }
    }
}));

const makeObservation = (id: string) => ({
    id,
    speciesName: 'Mésange',
    latinName: 'Parus major',
    taxonomicGroup: TaxonomicGroup.BIRD,
    date: '2026-03-01',
    time: '12:00',
    count: 1,
    location: 'Parc',
    gps: { lat: null, lon: null },
    municipality: 'Paris',
    department: '75',
    country: 'France',
    altitude: null,
    comment: '',
    status: Status.NE,
    atlasCode: '',
    protocol: Protocol.OPPORTUNIST,
    sexe: Sexe.UNKNOWN,
    age: Age.UNKNOWN,
    observationCondition: ObservationCondition.UNKNOWN,
    comportement: Comportement.UNKNOWN
});

beforeEach(() => {
    vi.resetModules();
    localStorage.clear();

    authGetUserMock.mockReset();
    authGetUserMock.mockResolvedValue({ data: { user: { id: 'user-1' } } });

    fromMock.mockReset();
    fromMock.mockReturnValue({
        select: selectMock,
        update: updateMock,
        delete: deleteMock,
        insert: insertMock,
        upsert: upsertMock
    });

    selectMock.mockReset();
    selectMock.mockReturnValue({ eq: selectEqMock, order: orderMock });
    selectEqMock.mockReset();
    selectEqMock.mockReturnValue({ order: orderMock });
    orderMock.mockReset();
    orderMock.mockResolvedValue({ data: [], error: null });

    updateMock.mockReset();
    updateMock.mockReturnValue({ eq: updateEqIdMock });
    updateEqIdMock.mockReset();
    updateEqIdMock.mockReturnValue({ eq: updateEqUserMock });
    updateEqUserMock.mockReset();
    updateEqUserMock.mockResolvedValue({ error: null });

    deleteMock.mockReset();
    deleteMock.mockReturnValue({ eq: deleteEqIdMock });
    deleteEqIdMock.mockReset();
    deleteEqIdMock.mockReturnValue({ eq: deleteEqUserMock });
    deleteEqUserMock.mockReset();
    deleteEqUserMock.mockResolvedValue({ error: null });

    insertMock.mockReset();
    insertMock.mockReturnValue({ select: insertSelectMock });
    insertSelectMock.mockReset();
    insertSelectMock.mockReturnValue({ single: insertSingleMock });
    insertSingleMock.mockReset();
    insertSingleMock.mockResolvedValue({
        data: {
            id: '123e4567-e89b-42d3-a456-426614174000',
            species_name: 'Mésange',
            latin_name: '',
            taxonomic_group: 'Oiseaux',
            date: '2026-03-01',
            time: '12:00',
            count: 1,
            location: '',
            gps_lat: null,
            gps_lon: null,
            municipality: '',
            department: '',
            country: 'France',
            altitude: null,
            comment: '',
            status: 'NE',
            atlas_code: '',
            protocol: 'Opportuniste',
            sexe: 'Non renseigné',
            age: 'Non renseigné',
            observation_condition: 'Non renseigné',
            comportement: 'Non renseigné',
            photo_url: 'https://example.com/photo.jpg',
            wikipedia_image: 'https://example.com/wiki.jpg',
            sound_url: 'https://example.com/sound.mp3'
        },
        error: null
    });

    upsertMock.mockReset();
    upsertMock.mockResolvedValue({ error: null });

    storageUploadMock.mockReset();
    storageUploadMock.mockResolvedValue({ error: null });
    storageGetPublicUrlMock.mockReset();
    storageGetPublicUrlMock.mockReturnValue({ data: { publicUrl: 'https://example.com/file' } });
    storageFromMock.mockReset();
    storageFromMock.mockReturnValue({
        upload: storageUploadMock,
        getPublicUrl: storageGetPublicUrlMock
    });
});

describe('storageService.getObservations', () => {
    it('returns remote observations and applies user_id filter', async () => {
        vi.stubGlobal('navigator', { onLine: true });
        orderMock.mockResolvedValue({
            data: [{
                id: '123e4567-e89b-42d3-a456-426614174000',
                species_name: 'Mésange',
                latin_name: '',
                taxonomic_group: 'Oiseaux',
                date: '2026-03-01',
                time: '12:00',
                count: 1,
                location: '',
                gps_lat: null,
                gps_lon: null,
                municipality: '',
                department: '',
                country: 'France',
                altitude: null,
                comment: '',
                status: 'NE',
                atlas_code: '',
                protocol: 'Opportuniste',
                sexe: 'Non renseigné',
                age: 'Non renseigné',
                observation_condition: 'Non renseigné',
                comportement: 'Non renseigné',
                photo_url: 'https://example.com/photo.jpg',
                wikipedia_image: 'https://example.com/wiki.jpg',
                sound_url: 'https://example.com/sound.mp3'
            }],
            error: null
        });

        const storageService = await import('../services/storageService');
        storageService.setStorageNamespace('user-1');

        const result = await storageService.getObservations();

        expect(result.source).toBe('remote');
        expect(result.observations).toHaveLength(1);
        expect(selectEqMock).toHaveBeenCalledWith('user_id', 'user-1');
    });

    it('falls back to cache with a warning when the API fails', async () => {
        vi.stubGlobal('navigator', { onLine: true });
        localStorage.setItem('local_observations_cache:user-1', JSON.stringify([{
            ...makeObservation('123e4567-e89b-42d3-a456-426614174000'),
            wikipediaImage: 'https://example.com/wiki.jpg'
        }]));
        orderMock.mockResolvedValue({
            data: null,
            error: { message: 'boom' }
        });

        const storageService = await import('../services/storageService');
        storageService.setStorageNamespace('user-1');

        const result = await storageService.getObservations();

        expect(result.source).toBe('cache');
        expect(result.warning).toContain('boom');
        expect(result.observations[0].speciesName).toBe('Mésange');
    });
});

describe('storageService security filters', () => {
    it('applies user_id filter on updateObservation', async () => {
        vi.stubGlobal('navigator', { onLine: true });
        const storageService = await import('../services/storageService');
        storageService.setStorageNamespace('user-1');

        const observation = makeObservation('123e4567-e89b-42d3-a456-426614174000');
        await storageService.updateObservation(observation);

        expect(updateEqIdMock).toHaveBeenCalledWith('id', observation.id);
        expect(updateEqUserMock).toHaveBeenCalledWith('user_id', 'user-1');
    });

    it('applies user_id filter on deleteObservation', async () => {
        vi.stubGlobal('navigator', { onLine: true });
        const storageService = await import('../services/storageService');
        storageService.setStorageNamespace('user-1');

        await storageService.deleteObservation('123e4567-e89b-42d3-a456-426614174000');

        expect(deleteEqIdMock).toHaveBeenCalledWith('id', '123e4567-e89b-42d3-a456-426614174000');
        expect(deleteEqUserMock).toHaveBeenCalledWith('user_id', 'user-1');
    });
});

describe('storageService.bulkUpsertObservationsInCache', () => {
    it('writes local cache only once for a whole batch', async () => {
        vi.stubGlobal('navigator', { onLine: true });
        const storageService = await import('../services/storageService');
        storageService.setStorageNamespace('user-1');

        const cacheKey = 'local_observations_cache:user-1';
        localStorage.setItem(cacheKey, JSON.stringify([makeObservation('obs1')]));

        const setItemSpy = vi.spyOn(Storage.prototype, 'setItem');
        setItemSpy.mockClear();

        storageService.bulkUpsertObservationsInCache([
            { ...makeObservation('obs1'), speciesName: 'Updated A' },
            makeObservation('obs2')
        ]);

        const rawCache = localStorage.getItem(cacheKey);
        const parsed = JSON.parse(rawCache || '[]');

        expect(setItemSpy).toHaveBeenCalledTimes(1);
        expect(parsed).toHaveLength(2);
        expect(parsed.find((o: any) => o.id === 'obs1')?.speciesName).toBe('Updated A');
        expect(parsed.find((o: any) => o.id === 'obs2')?.speciesName).toBe('Mésange');

        setItemSpy.mockRestore();
    });
});

describe('storageService.uploadSound', () => {
    it('uploads sound file under user sounds path with derived extension', async () => {
        vi.stubGlobal('navigator', { onLine: true });
        const storageService = await import('../services/storageService');
        const file = new Blob(['audio-data'], { type: 'audio/wav' });

        const publicUrl = await storageService.uploadSound(file);

        expect(storageFromMock).toHaveBeenCalledWith('photos');
        expect(storageUploadMock).toHaveBeenCalledTimes(1);

        const [uploadedFileName, uploadedBlob, options] = storageUploadMock.mock.calls[0];
        expect(String(uploadedFileName)).toContain('/sounds/');
        expect(String(uploadedFileName)).toMatch(/\.wav$/);
        expect(uploadedBlob).toBe(file);
        expect(options).toMatchObject({ contentType: 'audio/wav', upsert: false });
        expect(publicUrl).toBe('https://example.com/file');
    });

    it('rejects uploads while offline', async () => {
        vi.stubGlobal('navigator', { onLine: false });
        const storageService = await import('../services/storageService');
        const file = new Blob(['audio-data'], { type: 'audio/mpeg' });

        await expect(storageService.uploadSound(file)).rejects.toThrow("Impossible d'envoyer un son en mode hors-ligne");
    });
});
