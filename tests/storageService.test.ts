import { beforeEach, describe, expect, it, vi } from 'vitest';

const orderMock = vi.fn();
const selectMock = vi.fn(() => ({ order: orderMock }));
const fromMock = vi.fn(() => ({ select: selectMock }));

vi.mock('../supabaseClient', () => ({
    supabase: {
        from: fromMock,
        auth: {
            getUser: vi.fn(async () => ({ data: { user: { id: 'user-1' } } }))
        },
        storage: {
            from: vi.fn(() => ({
                upload: vi.fn(),
                getPublicUrl: vi.fn(() => ({ data: { publicUrl: 'https://example.com/file' } }))
            }))
        }
    }
}));

describe('storageService.getObservations', () => {
    beforeEach(async () => {
        vi.resetModules();
        localStorage.clear();
        fromMock.mockReset();
        selectMock.mockReset();
        orderMock.mockReset();
        fromMock.mockReturnValue({ select: selectMock });
        selectMock.mockReturnValue({ order: orderMock });
    });

    it('returns remote observations when the API succeeds', async () => {
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
        expect(result.observations[0].speciesName).toBe('Mésange');
    });

    it('falls back to cache with a warning when the API fails', async () => {
        vi.stubGlobal('navigator', { onLine: true });
        localStorage.setItem('local_observations_cache:user-1', JSON.stringify([{
            id: '123e4567-e89b-42d3-a456-426614174000',
            speciesName: 'Cache',
            latinName: '',
            taxonomicGroup: 'Oiseaux',
            date: '2026-03-01',
            time: '12:00',
            count: 1,
            location: '',
            gps: { lat: null, lon: null },
            municipality: '',
            department: '',
            country: 'France',
            altitude: null,
            comment: '',
            status: 'NE',
            atlasCode: '',
            protocol: 'Opportuniste',
            sexe: 'Non renseigné',
            age: 'Non renseigné',
            observationCondition: 'Non renseigné',
            comportement: 'Non renseigné',
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
        expect(result.observations[0].speciesName).toBe('Cache');
    });
});
