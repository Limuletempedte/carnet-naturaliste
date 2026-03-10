import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchSpeciesInfo, suggestSpeciesAutocomplete } from '../services/speciesService';

const fetchMock = vi.fn();

describe('suggestSpeciesAutocomplete', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.stubGlobal('fetch', fetchMock);
        vi.spyOn(console, 'error').mockImplementation(() => { });
    });

    afterEach(() => {
        vi.unstubAllGlobals();
        vi.restoreAllMocks();
    });

    it('returns French suggestions from iNaturalist first', async () => {
        fetchMock.mockResolvedValueOnce({
            ok: true,
            json: async () => ({
                results: [
                    {
                        name: 'Cyanistes caeruleus',
                        preferred_common_name: 'Mesange bleue'
                    }
                ]
            })
        } as Response);

        const suggestions = await suggestSpeciesAutocomplete('Mesan', 5);

        expect(fetchMock).toHaveBeenCalledTimes(1);
        expect(String(fetchMock.mock.calls[0][0])).toContain('api.inaturalist.org/v1/taxa/autocomplete');
        expect(suggestions).toHaveLength(1);
        expect(suggestions[0]).toMatchObject({
            displayName: 'Mesange bleue',
            latinName: 'Cyanistes caeruleus',
            commonName: 'Mesange bleue',
            source: 'inat'
        });
    });

    it('falls back to GBIF when iNaturalist has no suggestions', async () => {
        fetchMock
            .mockResolvedValueOnce({
                ok: true,
                json: async () => ({ results: [] })
            } as Response)
            .mockResolvedValueOnce({
                ok: true,
                json: async () => ([
                    {
                        canonicalName: 'Cyanistes caeruleus',
                        scientificName: 'Cyanistes caeruleus (Linnaeus, 1758)'
                    }
                ])
            } as Response);

        const suggestions = await suggestSpeciesAutocomplete('Cyan', 5);

        expect(fetchMock).toHaveBeenCalledTimes(2);
        expect(String(fetchMock.mock.calls[1][0])).toContain('api.gbif.org/v1/species/suggest');
        expect(suggestions).toHaveLength(1);
        expect(suggestions[0]).toMatchObject({
            displayName: 'Cyanistes caeruleus',
            latinName: 'Cyanistes caeruleus (Linnaeus, 1758)',
            source: 'gbif'
        });
    });

    it('falls back to GBIF when iNaturalist request fails', async () => {
        fetchMock
            .mockRejectedValueOnce(new Error('iNat unreachable'))
            .mockResolvedValueOnce({
                ok: true,
                json: async () => ([
                    {
                        canonicalName: 'Parus major',
                        scientificName: 'Parus major Linnaeus, 1758'
                    }
                ])
            } as Response);

        const suggestions = await suggestSpeciesAutocomplete('Parus', 5);

        expect(fetchMock).toHaveBeenCalledTimes(2);
        expect(suggestions[0]).toMatchObject({
            displayName: 'Parus major',
            source: 'gbif'
        });
    });

    it('deduplicates by latin name and enforces max size', async () => {
        fetchMock.mockResolvedValueOnce({
            ok: true,
            json: async () => ({
                results: [
                    { name: 'Species A', preferred_common_name: 'Nom A' },
                    { name: 'Species B', preferred_common_name: 'Nom B' },
                    { name: 'Species A', preferred_common_name: 'Nom A bis' },
                    { name: 'Species C', preferred_common_name: 'Nom C' },
                    { name: 'Species D', preferred_common_name: 'Nom D' },
                    { name: 'Species E', preferred_common_name: 'Nom E' },
                    { name: 'Species F', preferred_common_name: 'Nom F' }
                ]
            })
        } as Response);

        const suggestions = await suggestSpeciesAutocomplete('Spec', 5);

        expect(suggestions).toHaveLength(5);
        expect(suggestions.map(s => s.latinName)).toEqual([
            'Species A',
            'Species B',
            'Species C',
            'Species D',
            'Species E'
        ]);
    });
});

describe('fetchSpeciesInfo', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.stubGlobal('fetch', fetchMock);
        vi.spyOn(console, 'error').mockImplementation(() => { });
    });

    afterEach(() => {
        vi.unstubAllGlobals();
        vi.restoreAllMocks();
    });

    it('prefers species rank over higher rank candidates when resolving iNaturalist match', async () => {
        fetchMock
            .mockResolvedValueOnce({
                ok: true,
                json: async () => ({
                    results: [
                        {
                            name: 'Lepus',
                            rank: 'genus',
                            preferred_common_name: 'Liepres',
                            default_photo: { medium_url: 'https://example.com/genus.jpg' }
                        },
                        {
                            name: 'Lepus europaeus',
                            rank: 'species',
                            preferred_common_name: 'Lievre d Europe',
                            default_photo: { medium_url: 'https://example.com/species.jpg' }
                        }
                    ]
                })
            } as Response)
            .mockResolvedValueOnce({
                ok: true,
                json: async () => ({
                    matchType: 'EXACT',
                    class: 'Mammalia',
                    order: 'Lagomorpha',
                    family: 'Leporidae',
                    kingdom: 'Animalia'
                })
            } as Response)
            .mockResolvedValueOnce({
                ok: true,
                json: async () => ({
                    additionalStatus: []
                })
            } as Response);

        const info = await fetchSpeciesInfo('Lepus');

        expect(fetchMock).toHaveBeenCalledTimes(3);
        expect(info).toMatchObject({
            latinName: 'Lepus europaeus',
            imageUrl: 'https://example.com/species.jpg',
            matchedBy: 'latin',
            confidence: 'medium'
        });
    });

    it('reports high confidence common-name matches', async () => {
        fetchMock
            .mockResolvedValueOnce({
                ok: true,
                json: async () => ({
                    results: [
                        {
                            name: 'Vulpes vulpes',
                            rank: 'species',
                            preferred_common_name: 'Renard roux',
                            default_photo: { medium_url: 'https://example.com/fox.jpg' }
                        }
                    ]
                })
            } as Response)
            .mockResolvedValueOnce({
                ok: true,
                json: async () => ({
                    matchType: 'EXACT',
                    class: 'Mammalia',
                    order: 'Carnivora',
                    family: 'Canidae',
                    kingdom: 'Animalia'
                })
            } as Response)
            .mockResolvedValueOnce({
                ok: true,
                json: async () => ({
                    additionalStatus: [
                        { datasetAlias: 'IUCN', statusCode: 'LC' }
                    ]
                })
            } as Response);

        const info = await fetchSpeciesInfo('Renard roux');

        expect(info).toMatchObject({
            matchedBy: 'common',
            confidence: 'high',
            redListStatus: 'LC'
        });
    });

    it('reports high confidence latin-name matches', async () => {
        fetchMock
            .mockResolvedValueOnce({
                ok: true,
                json: async () => ({
                    results: [
                        {
                            name: 'Vulpes vulpes',
                            rank: 'species',
                            preferred_common_name: 'Renard roux',
                            default_photo: { medium_url: 'https://example.com/fox.jpg' }
                        }
                    ]
                })
            } as Response)
            .mockResolvedValueOnce({
                ok: true,
                json: async () => ({
                    matchType: 'EXACT',
                    class: 'Mammalia',
                    order: 'Carnivora',
                    family: 'Canidae',
                    kingdom: 'Animalia'
                })
            } as Response)
            .mockResolvedValueOnce({
                ok: true,
                json: async () => ({
                    additionalStatus: [
                        { datasetAlias: 'IUCN', statusCode: 'LC' }
                    ]
                })
            } as Response);

        const info = await fetchSpeciesInfo('Vulpes vulpes');

        expect(info).toMatchObject({
            matchedBy: 'latin',
            confidence: 'high',
            redListStatus: 'LC'
        });
    });

    it('maps Lecanoromycetes class to Lichens group', async () => {
        fetchMock
            .mockResolvedValueOnce({
                ok: true,
                json: async () => ({
                    results: [
                        {
                            name: 'Parmelia sulcata',
                            rank: 'species',
                            preferred_common_name: 'Lichen des murailles'
                        }
                    ]
                })
            } as Response)
            .mockResolvedValueOnce({
                ok: true,
                json: async () => ({
                    matchType: 'EXACT',
                    class: 'Lecanoromycetes',
                    order: 'Lecanorales',
                    family: 'Parmeliaceae',
                    kingdom: 'Fungi'
                })
            } as Response)
            .mockResolvedValueOnce({
                ok: true,
                json: async () => ({
                    additionalStatus: []
                })
            } as Response);

        const info = await fetchSpeciesInfo('Parmelia sulcata');

        expect(info).toMatchObject({
            taxonomicGroup: 'Lichens'
        });
    });
});
