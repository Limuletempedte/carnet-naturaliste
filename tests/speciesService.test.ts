import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { suggestSpeciesAutocomplete } from '../services/speciesService';

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
        expect(suggestions).toEqual([
            {
                displayName: 'Mesange bleue',
                latinName: 'Cyanistes caeruleus',
                commonName: 'Mesange bleue',
                source: 'inat'
            }
        ]);
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
        expect(suggestions).toEqual([
            {
                displayName: 'Cyanistes caeruleus',
                latinName: 'Cyanistes caeruleus (Linnaeus, 1758)',
                source: 'gbif'
            }
        ]);
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
