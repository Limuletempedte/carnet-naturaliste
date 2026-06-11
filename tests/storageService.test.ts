import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Age, Comportement, ObservationCondition, Protocol, Sexe, Status, TaxonomicGroup, WeatherCondition } from '../types';

const authGetUserMock = vi.fn<() => Promise<{ data: { user: { id: string } | null } }>>(
    async () => ({ data: { user: { id: 'user-1' } } })
);

const rangeMock = vi.fn();
const orderMock = vi.fn(() => ({ range: rangeMock }));
const selectEqMock = vi.fn(() => ({ order: orderMock }));
const selectMock = vi.fn(() => ({ eq: selectEqMock, order: orderMock }));

const updateSelectMock = vi.fn();
const updateEqUserMock = vi.fn(() => ({ select: updateSelectMock }));
const updateEqIdMock = vi.fn(() => ({ eq: updateEqUserMock }));
const updateMock = vi.fn(() => ({ eq: updateEqIdMock }));

const deleteSelectMock = vi.fn();
const deleteEqUserMock = vi.fn(() => ({ select: deleteSelectMock }));
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
    comportement: Comportement.UNKNOWN,
    weather: WeatherCondition.UNKNOWN
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
    orderMock.mockReturnValue({ range: rangeMock });
    rangeMock.mockReset();
    rangeMock.mockResolvedValue({ data: [], error: null });

    updateMock.mockReset();
    updateMock.mockReturnValue({ eq: updateEqIdMock });
    updateEqIdMock.mockReset();
    updateEqIdMock.mockReturnValue({ eq: updateEqUserMock });
    updateSelectMock.mockReset();
    updateSelectMock.mockResolvedValue({ error: null, data: [{ id: '123e4567-e89b-42d3-a456-426614174000' }] });
    updateEqUserMock.mockReset();
    updateEqUserMock.mockReturnValue({ select: updateSelectMock });

    deleteMock.mockReset();
    deleteMock.mockReturnValue({ eq: deleteEqIdMock });
    deleteEqIdMock.mockReset();
    deleteEqIdMock.mockReturnValue({ eq: deleteEqUserMock });
    deleteSelectMock.mockReset();
    deleteSelectMock.mockResolvedValue({ error: null, data: [{ id: '123e4567-e89b-42d3-a456-426614174000' }] });
    deleteEqUserMock.mockReset();
    deleteEqUserMock.mockReturnValue({ select: deleteSelectMock });

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

describe('storageService.applyPendingQueueToObservations (H8)', () => {
    it('réinjecte les INSERT/UPDATE en attente et retire les DELETE en attente', async () => {
        const storageService = await import('../services/storageService');
        storageService.setStorageNamespace('user-1');

        const serverA = makeObservation('aaaaaaaa-e89b-42d3-a456-426614174000');
        const serverB = makeObservation('bbbbbbbb-e89b-42d3-a456-426614174000');
        const pendingInsert = { ...makeObservation('temp-123'), speciesName: 'Rougegorge' };
        const editedA = { ...serverA, comment: 'édité hors-ligne' };

        const now = Date.now();
        localStorage.setItem('offline_sync_queue:user-1', JSON.stringify([
            { id: 'q1', action: 'INSERT', payload: pendingInsert, timestamp: now + 1 },
            { id: 'q2', action: 'UPDATE', payload: editedA, timestamp: now + 2 },
            { id: 'q3', action: 'DELETE', payload: { id: serverB.id }, timestamp: now + 3 },
        ]));

        const result = storageService.applyPendingQueueToObservations([serverA, serverB]);
        const byId = new Map(result.map(o => [o.id, o]));

        // INSERT en attente visible, UPDATE appliqué, DELETE retiré
        expect(byId.get('temp-123')?.speciesName).toBe('Rougegorge');
        expect(byId.get(serverA.id)?.comment).toBe('édité hors-ligne');
        expect(byId.has(serverB.id)).toBe(false);
    });

    it('renvoie la liste inchangée quand la file est vide', async () => {
        const storageService = await import('../services/storageService');
        storageService.setStorageNamespace('user-1');
        const obs = [makeObservation('aaaaaaaa-e89b-42d3-a456-426614174000')];
        expect(storageService.applyPendingQueueToObservations(obs)).toEqual(obs);
    });
});

describe('storageService.getObservations', () => {
    it('returns remote observations and applies user_id filter', async () => {
        vi.stubGlobal('navigator', { onLine: true });
        rangeMock.mockResolvedValue({
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
        rangeMock.mockResolvedValue({
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

    // SI-29: paginate across Supabase's default 1000-row cap. Without this, users
    // with >1000 observations had an incomplete React state, so re-imports of older
    // rows looked like new inserts → duplicate-key failures on observations_pkey.
    it('paginates the remote fetch so >1000 observations are fully loaded', async () => {
        vi.stubGlobal('navigator', { onLine: true });

        const uuid = (n: number) => `11111111-1111-4111-8111-${String(n).padStart(12, '0')}`;
        const makeRow = (id: string) => ({
            id,
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
            comportement: 'Non renseigné'
        });

        const firstPage = Array.from({ length: 1000 }, (_, i) => makeRow(uuid(i)));
        const secondPage = Array.from({ length: 382 }, (_, i) => makeRow(uuid(1000 + i)));

        rangeMock.mockReset();
        rangeMock
            .mockResolvedValueOnce({ data: firstPage, error: null })
            .mockResolvedValueOnce({ data: secondPage, error: null });

        const storageService = await import('../services/storageService');
        storageService.setStorageNamespace('user-1');

        const result = await storageService.getObservations();

        expect(result.source).toBe('remote');
        expect(result.observations).toHaveLength(1382);
        // Two pages fetched: [0, 999] then [1000, 1999]
        expect(rangeMock).toHaveBeenCalledTimes(2);
        expect(rangeMock).toHaveBeenNthCalledWith(1, 0, 999);
        expect(rangeMock).toHaveBeenNthCalledWith(2, 1000, 1999);
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

    it('throws when online mutation is attempted without authenticated user', async () => {
        vi.stubGlobal('navigator', { onLine: true });
        authGetUserMock.mockResolvedValue({ data: { user: null } });

        const storageService = await import('../services/storageService');
        storageService.setStorageNamespace('user-1');

        await expect(storageService.updateObservation(makeObservation('123e4567-e89b-42d3-a456-426614174000')))
            .rejects
            .toThrow('User not authenticated');

        await expect(storageService.deleteObservation('123e4567-e89b-42d3-a456-426614174000'))
            .rejects
            .toThrow('User not authenticated');
    });

    it('throws when update affects no row', async () => {
        vi.stubGlobal('navigator', { onLine: true });
        updateSelectMock.mockResolvedValueOnce({ error: null, data: [] });

        const storageService = await import('../services/storageService');
        storageService.setStorageNamespace('user-1');

        await expect(storageService.updateObservation(makeObservation('123e4567-e89b-42d3-a456-426614174000')))
            .rejects
            .toThrow('observation introuvable');
    });

    it('throws when delete affects no row', async () => {
        vi.stubGlobal('navigator', { onLine: true });
        deleteSelectMock.mockResolvedValueOnce({ error: null, data: [] });

        const storageService = await import('../services/storageService');
        storageService.setStorageNamespace('user-1');

        await expect(storageService.deleteObservation('123e4567-e89b-42d3-a456-426614174000'))
            .rejects
            .toThrow('observation introuvable');
    });
});

describe('storageService legacy schema fallback', () => {
    it('retries saveObservation without count-breakdown columns when schema cache is outdated', async () => {
        vi.stubGlobal('navigator', { onLine: true });
        insertSingleMock
            .mockResolvedValueOnce({
                data: null,
                error: {
                    code: 'PGRST204',
                    message: "Could not find the 'male_count' column in the schema cache"
                }
            })
            .mockResolvedValueOnce({
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
                    photo_url: null,
                    wikipedia_image: null,
                    sound_url: null
                },
                error: null
            });

        const storageService = await import('../services/storageService');
        storageService.setStorageNamespace('user-1');
        await storageService.saveObservation(makeObservation('123e4567-e89b-42d3-a456-426614174000'));

        expect(insertMock).toHaveBeenCalledTimes(2);
        const firstCall = insertMock.mock.calls.at(0) as unknown[] | undefined;
        const fallbackCall = insertMock.mock.calls.at(1) as unknown[] | undefined;
        const firstRow = firstCall?.[0];
        const fallbackRow = fallbackCall?.[0];

        expect(firstRow).toHaveProperty('male_count');
        expect(fallbackRow).not.toHaveProperty('male_count');
        expect(fallbackRow).not.toHaveProperty('female_count');
        expect(fallbackRow).not.toHaveProperty('unidentified_count');
    });

    it('retries updateObservation without count-breakdown columns when schema cache is outdated', async () => {
        vi.stubGlobal('navigator', { onLine: true });
        updateSelectMock
            .mockResolvedValueOnce({
                error: {
                    code: 'PGRST204',
                    message: "Could not find the 'male_count' column in the schema cache"
                },
                data: null
            })
            .mockResolvedValueOnce({ error: null, data: [{ id: '123e4567-e89b-42d3-a456-426614174000' }] });

        const storageService = await import('../services/storageService');
        storageService.setStorageNamespace('user-1');
        await storageService.updateObservation(makeObservation('123e4567-e89b-42d3-a456-426614174000'));

        expect(updateMock).toHaveBeenCalledTimes(2);
        const firstCall = updateMock.mock.calls.at(0) as unknown[] | undefined;
        const fallbackCall = updateMock.mock.calls.at(1) as unknown[] | undefined;
        const firstRow = firstCall?.[0];
        const fallbackRow = fallbackCall?.[0];

        expect(firstRow).toHaveProperty('male_count');
        expect(fallbackRow).not.toHaveProperty('male_count');
        expect(fallbackRow).not.toHaveProperty('female_count');
        expect(fallbackRow).not.toHaveProperty('unidentified_count');
    });

    it('retries processOfflineQueue INSERT/UPDATE operations without count-breakdown columns when schema cache is outdated', async () => {
        vi.stubGlobal('navigator', { onLine: true });
        insertSingleMock
            .mockResolvedValueOnce({
                data: null,
                error: {
                    code: 'PGRST204',
                    message: "Could not find the 'male_count' column in the schema cache"
                }
            })
            .mockResolvedValueOnce({
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
                    photo_url: null,
                    wikipedia_image: null,
                    sound_url: null
                },
                error: null
            });
        updateSelectMock
            .mockResolvedValueOnce({
                error: {
                    code: 'PGRST204',
                    message: "Could not find the 'male_count' column in the schema cache"
                },
                data: null
            })
            .mockResolvedValueOnce({ error: null, data: [{ id: '123e4567-e89b-42d3-a456-426614174001' }] });

        const storageService = await import('../services/storageService');
        storageService.setStorageNamespace('user-1');

        const tempObservation = {
            ...makeObservation('temp-1'),
            maleCount: 1,
            femaleCount: 0,
            unidentifiedCount: 0
        };
        const persistedObservation = {
            ...makeObservation('123e4567-e89b-42d3-a456-426614174000'),
            maleCount: 1,
            femaleCount: 0,
            unidentifiedCount: 0
        };
        localStorage.setItem('offline_sync_queue:user-1', JSON.stringify([
            { id: 'q1', action: 'INSERT', payload: tempObservation, timestamp: Date.now() },
            { id: 'q2', action: 'UPDATE', payload: persistedObservation, timestamp: Date.now() + 1 }
        ]));

        const result = await storageService.processOfflineQueue();

        expect(result.processed).toBe(2);
        expect(result.failed).toBe(0);

        expect(insertMock).toHaveBeenCalledTimes(2);
        const firstInsertCall = insertMock.mock.calls.at(0) as unknown[] | undefined;
        const fallbackInsertCall = insertMock.mock.calls.at(1) as unknown[] | undefined;
        const firstInsertRow = firstInsertCall?.[0];
        const fallbackInsertRow = fallbackInsertCall?.[0];
        expect(firstInsertRow).toHaveProperty('male_count');
        expect(fallbackInsertRow).not.toHaveProperty('male_count');
        expect(fallbackInsertRow).not.toHaveProperty('female_count');
        expect(fallbackInsertRow).not.toHaveProperty('unidentified_count');

        expect(updateMock).toHaveBeenCalledTimes(2);
        const firstUpdateCall = updateMock.mock.calls.at(0) as unknown[] | undefined;
        const fallbackUpdateCall = updateMock.mock.calls.at(1) as unknown[] | undefined;
        const firstUpdateRow = firstUpdateCall?.[0];
        const fallbackUpdateRow = fallbackUpdateCall?.[0];
        expect(firstUpdateRow).toHaveProperty('male_count');
        expect(fallbackUpdateRow).not.toHaveProperty('male_count');
        expect(fallbackUpdateRow).not.toHaveProperty('female_count');
        expect(fallbackUpdateRow).not.toHaveProperty('unidentified_count');
    });

    it('supports targeted retry by queue item id and keeps non-selected items', async () => {
        vi.stubGlobal('navigator', { onLine: true });

        const storageService = await import('../services/storageService');
        storageService.setStorageNamespace('user-1');

        const queue = [
            { id: 'q1', action: 'UPDATE', payload: makeObservation('123e4567-e89b-42d3-a456-426614174000'), timestamp: Date.now() },
            { id: 'q2', action: 'UPDATE', payload: makeObservation('123e4567-e89b-42d3-a456-426614174001'), timestamp: Date.now() + 1 }
        ];
        localStorage.setItem('offline_sync_queue:user-1', JSON.stringify(queue));

        const result = await storageService.processOfflineQueue({ itemIds: ['q2'] });

        expect(result.processed).toBe(1);
        expect(result.failed).toBe(0);
        expect(updateEqIdMock).toHaveBeenCalledWith('id', '123e4567-e89b-42d3-a456-426614174001');

        const remainingQueue = JSON.parse(localStorage.getItem('offline_sync_queue:user-1') || '[]');
        expect(remainingQueue).toHaveLength(1);
        expect(remainingQueue[0].id).toBe('q1');
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
        const parsed = JSON.parse(rawCache || '[]') as Array<{ id: string; speciesName: string }>;

        expect(setItemSpy).toHaveBeenCalledTimes(2); // cache data + cache timestamp
        expect(parsed).toHaveLength(2);
        expect(parsed.find(o => o.id === 'obs1')?.speciesName).toBe('Updated A');
        expect(parsed.find(o => o.id === 'obs2')?.speciesName).toBe('Mésange');

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

    it('rejects non-audio MIME types (SE-02)', async () => {
        vi.stubGlobal('navigator', { onLine: true });
        const storageService = await import('../services/storageService');
        const file = new Blob(['not-audio'], { type: 'application/pdf' });

        await expect(storageService.uploadSound(file)).rejects.toThrow('Type audio non autorisé');
    });
});

describe('storageService cache TTL (VP-07)', () => {
    it('returns cached observations when cache is fresh', async () => {
        const storageService = await import('../services/storageService');
        storageService.setStorageNamespace('user-1');

        const cacheKey = 'local_observations_cache:user-1';
        localStorage.setItem(cacheKey, JSON.stringify([makeObservation('obs1')]));
        localStorage.setItem(cacheKey + '_ts', String(Date.now()));

        vi.stubGlobal('navigator', { onLine: false });
        rangeMock.mockRejectedValue(new Error('offline'));

        const result = await storageService.getObservations();
        expect(result.observations).toHaveLength(1);
        expect(result.source).toBe('cache');
    });

    it('returns empty cache when TTL has expired (VP-07)', async () => {
        const storageService = await import('../services/storageService');
        storageService.setStorageNamespace('user-1');

        const cacheKey = 'local_observations_cache:user-1';
        localStorage.setItem(cacheKey, JSON.stringify([makeObservation('obs1')]));
        // Set timestamp to 91 days ago (beyond the 90-day TTL)
        const ninetyOneDaysAgo = Date.now() - 91 * 24 * 60 * 60 * 1000;
        localStorage.setItem(cacheKey + '_ts', String(ninetyOneDaysAgo));

        vi.stubGlobal('navigator', { onLine: false });
        rangeMock.mockRejectedValue(new Error('offline'));

        const result = await storageService.getObservations();
        expect(result.observations).toHaveLength(0);
        expect(localStorage.getItem(cacheKey)).toBeNull();
        expect(localStorage.getItem(cacheKey + '_ts')).toBeNull();
    });
});

describe('storageService SR-08 : fallback queue offline sur erreur Supabase récupérable', () => {
    it('saveObservation : met en queue et dispatche supabase-recoverable-error sur erreur 503', async () => {
        vi.stubGlobal('navigator', { onLine: true });
        const storageService = await import('../services/storageService');
        storageService.setStorageNamespace('user-1');

        insertSingleMock.mockResolvedValueOnce({ data: null, error: { message: 'Service unavailable', status: 503 } });

        const dispatchSpy = vi.spyOn(window, 'dispatchEvent');
        const observation = { ...makeObservation('src-1'), id: '' };
        const result = await storageService.saveObservation(observation);

        expect(result.id.startsWith('temp-')).toBe(true);
        const snapshot = storageService.getOfflineQueueSnapshot();
        expect(snapshot.length).toBe(1);
        expect(snapshot[0].action).toBe('INSERT');

        const event = dispatchSpy.mock.calls.find(([e]) =>
            e instanceof CustomEvent && e.type === 'supabase-recoverable-error'
        );
        expect(event).toBeDefined();
        dispatchSpy.mockRestore();
    });

    it('saveObservation : throw sur erreur métier (non récupérable)', async () => {
        vi.stubGlobal('navigator', { onLine: true });
        const storageService = await import('../services/storageService');
        storageService.setStorageNamespace('user-1');

        insertSingleMock.mockResolvedValueOnce({ data: null, error: { message: 'permission denied', code: '42501' } });

        await expect(storageService.saveObservation(makeObservation('src-2'))).rejects.toThrow('permission denied');
    });

    it('updateObservation : met en queue sur TypeError réseau', async () => {
        vi.stubGlobal('navigator', { onLine: true });
        const storageService = await import('../services/storageService');
        storageService.setStorageNamespace('user-1');

        updateSelectMock.mockRejectedValueOnce(new TypeError('Failed to fetch'));

        const obs = { ...makeObservation('123e4567-e89b-42d3-a456-426614174000') };
        await storageService.updateObservation(obs);

        const snapshot = storageService.getOfflineQueueSnapshot();
        expect(snapshot.some(i => i.action === 'UPDATE')).toBe(true);
    });

    it('deleteObservation : met en queue sur erreur 503', async () => {
        vi.stubGlobal('navigator', { onLine: true });
        const storageService = await import('../services/storageService');
        storageService.setStorageNamespace('user-1');

        deleteSelectMock.mockResolvedValueOnce({ data: null, error: { message: 'gateway timeout', status: 504 } });

        await storageService.deleteObservation('123e4567-e89b-42d3-a456-426614174000');

        const snapshot = storageService.getOfflineQueueSnapshot();
        expect(snapshot.some(i => i.action === 'DELETE')).toBe(true);
    });
});

describe('storageService corruption detection (SR-09)', () => {
    it('dispatches storage-corruption-detected when the queue JSON is invalid', async () => {
        const storageService = await import('../services/storageService');
        storageService.setStorageNamespace('user-1');

        localStorage.setItem('offline_sync_queue:user-1', '{not-json}');

        const dispatchSpy = vi.spyOn(window, 'dispatchEvent');
        const snapshot = storageService.getOfflineQueueSnapshot();

        expect(snapshot).toEqual([]);
        const corruptionEvent = dispatchSpy.mock.calls.find(([event]) =>
            event instanceof CustomEvent && event.type === 'storage-corruption-detected'
        );
        expect(corruptionEvent).toBeDefined();
        const detail = corruptionEvent ? (corruptionEvent[0] as CustomEvent).detail : null;
        expect(detail).toEqual({ scope: 'queue' });
        dispatchSpy.mockRestore();
    });

    it('dispatches storage-corruption-detected when the cache JSON is invalid', async () => {
        vi.stubGlobal('navigator', { onLine: false });
        const storageService = await import('../services/storageService');
        storageService.setStorageNamespace('user-1');

        localStorage.setItem('local_observations_cache:user-1', '{{not-json');

        const dispatchSpy = vi.spyOn(window, 'dispatchEvent');
        const result = await storageService.getObservations();

        expect(result.observations).toEqual([]);
        const corruptionEvent = dispatchSpy.mock.calls.find(([event]) =>
            event instanceof CustomEvent && event.type === 'storage-corruption-detected'
        );
        expect(corruptionEvent).toBeDefined();
        const detail = corruptionEvent ? (corruptionEvent[0] as CustomEvent).detail : null;
        expect(detail).toEqual({ scope: 'cache' });
        dispatchSpy.mockRestore();
    });
});

describe('storageService SR-14 : timestamps serveur exposés', () => {
    it('mapToObservation expose createdAt et updatedAt quand présents dans la row', async () => {
        vi.stubGlobal('navigator', { onLine: true });
        rangeMock.mockResolvedValue({
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
                created_at: '2026-03-01T12:00:00Z',
                updated_at: '2026-03-02T08:30:00Z',
            }],
            error: null,
        });

        const storageService = await import('../services/storageService');
        storageService.setStorageNamespace('user-1');
        const result = await storageService.getObservations();

        expect(result.observations[0].createdAt).toBe('2026-03-01T12:00:00Z');
        expect(result.observations[0].updatedAt).toBe('2026-03-02T08:30:00Z');
    });

    it('mapToObservation laisse createdAt/updatedAt undefined quand absents', async () => {
        vi.stubGlobal('navigator', { onLine: true });
        rangeMock.mockResolvedValue({
            data: [{
                id: '123e4567-e89b-42d3-a456-426614174001',
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
            }],
            error: null,
        });

        const storageService = await import('../services/storageService');
        storageService.setStorageNamespace('user-1');
        const result = await storageService.getObservations();

        expect(result.observations[0].createdAt).toBeUndefined();
        expect(result.observations[0].updatedAt).toBeUndefined();
    });
});

describe('storageService thème 12 : habitat, phenology, observers (VP-04, VP-05, VP-08)', () => {
    it('mapToObservation expose habitat, phenology et observers quand présents dans la row', async () => {
        vi.stubGlobal('navigator', { onLine: true });
        rangeMock.mockResolvedValue({
            data: [{
                id: '123e4567-e89b-42d3-a456-426614174010',
                species_name: 'Mésange bleue',
                latin_name: 'Cyanistes caeruleus',
                taxonomic_group: 'Oiseaux',
                date: '2026-04-20',
                time: '09:15',
                count: 2,
                location: 'Forêt de Fontainebleau',
                gps_lat: 48.4,
                gps_lon: 2.7,
                municipality: 'Fontainebleau',
                department: '77',
                country: 'France',
                altitude: 80,
                comment: '',
                status: 'LC',
                atlas_code: '',
                protocol: 'Opportuniste',
                sexe: 'Non renseigné',
                age: 'Adulte',
                observation_condition: 'Vu posé',
                comportement: 'Non renseigné',
                habitat: 'Forêt de feuillus',
                phenology: 'En reproduction',
                observers: ['Alice Dupont', 'Bob Martin'],
            }],
            error: null,
        });

        const storageService = await import('../services/storageService');
        storageService.setStorageNamespace('user-1');
        const result = await storageService.getObservations();

        expect(result.observations[0].habitat).toBe('Forêt de feuillus');
        expect(result.observations[0].phenology).toBe('En reproduction');
        expect(result.observations[0].observers).toEqual(['Alice Dupont', 'Bob Martin']);
    });

    it('mapToObservation laisse habitat/phenology/observers undefined quand absents ou vides', async () => {
        vi.stubGlobal('navigator', { onLine: true });
        rangeMock.mockResolvedValue({
            data: [{
                id: '123e4567-e89b-42d3-a456-426614174011',
                species_name: 'Mésange',
                latin_name: '',
                taxonomic_group: 'Oiseaux',
                date: '2026-04-20',
                time: '09:15',
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
                habitat: null,
                phenology: null,
                observers: [],
            }],
            error: null,
        });

        const storageService = await import('../services/storageService');
        storageService.setStorageNamespace('user-1');
        const result = await storageService.getObservations();

        expect(result.observations[0].habitat).toBeUndefined();
        expect(result.observations[0].phenology).toBeUndefined();
        expect(result.observations[0].observers).toBeUndefined();
    });
});

describe('storageService.isDuplicateKeyError (SI-30)', () => {
    it('returns true for Postgres code 23505', async () => {
        const { isDuplicateKeyError } = await import('../services/storageService');
        expect(isDuplicateKeyError({ code: '23505', message: 'anything' })).toBe(true);
    });

    it('returns true for the observations_pkey message without code', async () => {
        const { isDuplicateKeyError } = await import('../services/storageService');
        expect(isDuplicateKeyError({
            message: 'duplicate key value violates unique constraint "observations_pkey"'
        })).toBe(true);
    });

    it('returns true when wrapped in an Error instance', async () => {
        const { isDuplicateKeyError } = await import('../services/storageService');
        expect(isDuplicateKeyError(new Error('duplicate key value violates unique constraint "observations_pkey"'))).toBe(true);
    });

    it('returns false for null/undefined/other codes/messages', async () => {
        const { isDuplicateKeyError } = await import('../services/storageService');
        expect(isDuplicateKeyError(null)).toBe(false);
        expect(isDuplicateKeyError(undefined)).toBe(false);
        expect(isDuplicateKeyError({ code: '42703', message: 'column missing' })).toBe(false);
        expect(isDuplicateKeyError({ message: 'connection refused' })).toBe(false);
        expect(isDuplicateKeyError({ message: 'duplicate key on profiles' })).toBe(false);
    });
});
