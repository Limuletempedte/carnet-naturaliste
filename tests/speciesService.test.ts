import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearSpeciesInfoCache, fetchSpeciesInfo, suggestSpeciesAutocomplete } from '../services/speciesService';

const fetchMock = vi.fn();

describe('suggestSpeciesAutocomplete', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.stubGlobal('fetch', fetchMock);
        vi.spyOn(console, 'error').mockImplementation(() => { });
        clearSpeciesInfoCache();
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

    it('deduplicates by composite key (latin+display) and enforces max size', async () => {
        fetchMock.mockResolvedValueOnce({
            ok: true,
            json: async () => ({
                results: [
                    { name: 'Species A', preferred_common_name: 'Nom A' },
                    { name: 'Species B', preferred_common_name: 'Nom B' },
                    { name: 'Species A', preferred_common_name: 'Nom A' },   // exact duplicate — should be deduped
                    { name: 'Species A', preferred_common_name: 'Nom A bis' }, // different display — should be kept
                    { name: 'Species C', preferred_common_name: 'Nom C' },
                    { name: 'Species D', preferred_common_name: 'Nom D' },
                    { name: 'Species E', preferred_common_name: 'Nom E' }
                ]
            })
        } as Response);

        const suggestions = await suggestSpeciesAutocomplete('Spec', 5);

        expect(suggestions).toHaveLength(5);
        expect(suggestions.map(s => s.latinName)).toEqual([
            'Species A',
            'Species B',
            'Species A',  // kept because different displayName (Nom A bis)
            'Species C',
            'Species D'
        ]);
    });
});

describe('fetchSpeciesInfo', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.stubGlobal('fetch', fetchMock);
        vi.spyOn(console, 'error').mockImplementation(() => { });
        clearSpeciesInfoCache();
        // Default implementation: return 404 for any URL not explicitly mocked.
        // Explicit mockResolvedValueOnce calls are consumed FIFO before falling through here.
        fetchMock.mockImplementation(async () => ({ ok: false, status: 404, json: async () => ({}) } as Response));
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

        // autocomplete + GBIF match + Wikipedia FR (common name, 404) + Wikipedia FR (latin retry) + GBIF v2 IUCN
        expect(fetchMock).toHaveBeenCalledTimes(5);
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
                            id: 12345,
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
                    results: [
                        {
                            conservation_statuses: [
                                { status: 'LC', place: { id: 6753, display_name: 'France' } }
                            ]
                        }
                    ]
                })
            } as Response);

        const info = await fetchSpeciesInfo('Renard roux');

        expect(info).toMatchObject({
            matchedBy: 'common',
            confidence: 'high',
            redListStatus: 'LC',
            redListSource: 'france'
        });
    });

    it('reports high confidence latin-name matches', async () => {
        fetchMock
            .mockResolvedValueOnce({
                ok: true,
                json: async () => ({
                    results: [
                        {
                            id: 12345,
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
                    results: [
                        {
                            conservation_statuses: [
                                { status: 'LC', place: { id: 6753, display_name: 'France' } }
                            ]
                        }
                    ]
                })
            } as Response);

        const info = await fetchSpeciesInfo('Vulpes vulpes');

        expect(info).toMatchObject({
            matchedBy: 'latin',
            confidence: 'high',
            redListStatus: 'LC',
            redListSource: 'france'
        });
    });

    it('returns France red list status from conservation_statuses when conservation_status is null', async () => {
        fetchMock
            .mockResolvedValueOnce({
                ok: true,
                json: async () => ({
                    results: [
                        {
                            id: 99999,
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
                    results: [
                        {
                            conservation_status: null,
                            conservation_statuses: [
                                { status: 'LC', place: { id: 6753, display_name: 'France' } }
                            ]
                        }
                    ]
                })
            } as Response);

        const info = await fetchSpeciesInfo('Vulpes vulpes');

        expect(info).toMatchObject({
            redListStatus: 'LC',
            redListSource: 'france'
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

    it('maps Gastropoda class to Gastéropodes group', async () => {
        fetchMock
            .mockResolvedValueOnce({
                ok: true,
                json: async () => ({
                    results: [
                        {
                            name: 'Helix pomatia',
                            rank: 'species',
                            preferred_common_name: 'Escargot de Bourgogne'
                        }
                    ]
                })
            } as Response)
            .mockResolvedValueOnce({
                ok: true,
                json: async () => ({
                    matchType: 'EXACT',
                    class: 'Gastropoda',
                    order: 'Stylommatophora',
                    family: 'Helicidae',
                    kingdom: 'Animalia'
                })
            } as Response)
            .mockResolvedValueOnce({
                ok: true,
                json: async () => ({ results: [{ conservation_statuses: [] }] })
            } as Response)
            .mockResolvedValueOnce({
                ok: true,
                json: async () => ({ additionalStatus: [] })
            } as Response);

        const info = await fetchSpeciesInfo('Helix pomatia');
        expect(info?.taxonomicGroup).toBe('Gastéropodes');
    });

    it('maps Bivalvia class to Bivalves group', async () => {
        fetchMock
            .mockResolvedValueOnce({
                ok: true,
                json: async () => ({
                    results: [
                        {
                            name: 'Mytilus edulis',
                            rank: 'species',
                            preferred_common_name: 'Moule commune'
                        }
                    ]
                })
            } as Response)
            .mockResolvedValueOnce({
                ok: true,
                json: async () => ({
                    matchType: 'EXACT',
                    class: 'Bivalvia',
                    order: 'Mytilida',
                    family: 'Mytilidae',
                    kingdom: 'Animalia'
                })
            } as Response)
            .mockResolvedValueOnce({
                ok: true,
                json: async () => ({ additionalStatus: [] })
            } as Response);

        const info = await fetchSpeciesInfo('Mytilus edulis');
        expect(info?.taxonomicGroup).toBe('Bivalves');
    });

    it('maps Branchiopoda class to Branchiopodes group', async () => {
        fetchMock
            .mockResolvedValueOnce({
                ok: true,
                json: async () => ({
                    results: [
                        {
                            name: 'Daphnia magna',
                            rank: 'species',
                            preferred_common_name: 'Daphnie'
                        }
                    ]
                })
            } as Response)
            .mockResolvedValueOnce({
                ok: true,
                json: async () => ({
                    matchType: 'EXACT',
                    class: 'Branchiopoda',
                    order: 'Diplostraca',
                    family: 'Daphniidae',
                    kingdom: 'Animalia'
                })
            } as Response)
            .mockResolvedValueOnce({
                ok: true,
                json: async () => ({ additionalStatus: [] })
            } as Response);

        const info = await fetchSpeciesInfo('Daphnia magna');
        expect(info?.taxonomicGroup).toBe('Branchiopodes');
    });

    it('maps Dermaptera order to Dermatères group', async () => {
        fetchMock
            .mockResolvedValueOnce({
                ok: true,
                json: async () => ({
                    results: [
                        {
                            name: 'Forficula auricularia',
                            rank: 'species',
                            preferred_common_name: 'Perce-oreille commun'
                        }
                    ]
                })
            } as Response)
            .mockResolvedValueOnce({
                ok: true,
                json: async () => ({
                    matchType: 'EXACT',
                    class: 'Insecta',
                    order: 'Dermaptera',
                    family: 'Forficulidae',
                    kingdom: 'Animalia'
                })
            } as Response)
            .mockResolvedValueOnce({
                ok: true,
                json: async () => ({ additionalStatus: [] })
            } as Response);

        const info = await fetchSpeciesInfo('Forficula auricularia');
        expect(info?.taxonomicGroup).toBe('Dermatères');
    });

    it('maps Scorpiones order to Scorpions group', async () => {
        fetchMock
            .mockResolvedValueOnce({
                ok: true,
                json: async () => ({
                    results: [
                        {
                            name: 'Buthus occitanus',
                            rank: 'species',
                            preferred_common_name: 'Scorpion languedocien'
                        }
                    ]
                })
            } as Response)
            .mockResolvedValueOnce({
                ok: true,
                json: async () => ({
                    matchType: 'EXACT',
                    class: 'Arachnida',
                    order: 'Scorpiones',
                    family: 'Buthidae',
                    kingdom: 'Animalia'
                })
            } as Response)
            .mockResolvedValueOnce({
                ok: true,
                json: async () => ({ additionalStatus: [] })
            } as Response);

        const info = await fetchSpeciesInfo('Buthus occitanus');
        expect(info?.taxonomicGroup).toBe('Scorpions');
    });

    it('uses cache for repeated normalized queries', async () => {
        fetchMock
            .mockResolvedValueOnce({
                ok: true,
                json: async () => ({
                    results: [
                        {
                            id: 321,
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
                json: async () => ({ additionalStatus: [] })
            } as Response);

        const first = await fetchSpeciesInfo('Vulpes vulpes');
        const second = await fetchSpeciesInfo('  VULPES   VULPES ');

        // autocomplete + GBIF match + iNat France status + Wikipedia FR + GBIF v2 IUCN
        expect(fetchMock).toHaveBeenCalledTimes(5);
        expect(second).toEqual(first);
    });

    it('deduplicates concurrent fetchSpeciesInfo requests for same key', async () => {
        fetchMock
            .mockResolvedValueOnce({
                ok: true,
                json: async () => ({
                    results: [
                        {
                            id: 987,
                            name: 'Lynx lynx',
                            rank: 'species',
                            preferred_common_name: 'Lynx boreal',
                            default_photo: { medium_url: 'https://example.com/lynx.jpg' }
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
                    family: 'Felidae',
                    kingdom: 'Animalia'
                })
            } as Response)
            .mockResolvedValueOnce({
                ok: true,
                json: async () => ({ results: [{ conservation_statuses: [] }] })
            } as Response)
            .mockResolvedValueOnce({
                ok: true,
                json: async () => ({ additionalStatus: [] })
            } as Response);

        const [left, right] = await Promise.all([
            fetchSpeciesInfo('Lynx lynx'),
            fetchSpeciesInfo('Lynx lynx')
        ]);

        // autocomplete + GBIF match + iNat France status + Wikipedia FR (common 404) + Wikipedia FR (latin retry) + GBIF v2 IUCN
        expect(fetchMock).toHaveBeenCalledTimes(6);
        expect(left).toEqual(right);
    });

    it('returns null without error log when request is aborted', async () => {
        fetchMock.mockRejectedValueOnce(new DOMException('Aborted', 'AbortError'));

        const abortController = new AbortController();
        abortController.abort();

        const info = await fetchSpeciesInfo('Canis lupus', { signal: abortController.signal });

        expect(info).toBeNull();
        expect(console.error).not.toHaveBeenCalled();
    });

    it('défaut à Status.NE quand aucune API ne retourne de statut liste rouge', async () => {
        // Espèce trouvée sur iNat + GBIF taxonomy, mais aucune des deux sources
        // de liste rouge ne retourne d'info (ni France via iNat, ni IUCN via GBIF).
        // Le défaut doit être NE (Non évaluée), pas LC ni undefined.
        fetchMock
            // 1. iNat autocomplete → espèce trouvée
            .mockResolvedValueOnce({
                ok: true,
                json: async () => ({
                    results: [
                        {
                            id: 99999,
                            name: 'Raruspecis obscura',
                            rank: 'species',
                            preferred_common_name: 'Espèce rare obscure'
                        }
                    ]
                })
            } as Response)
            // 2. GBIF matchSpecies → taxonomy OK mais pas de red list
            .mockResolvedValueOnce({
                ok: true,
                json: async () => ({
                    matchType: 'EXACT',
                    class: 'Insecta',
                    order: 'Coleoptera',
                    family: 'Curculionidae',
                    kingdom: 'Animalia'
                })
            } as Response)
            // 3. iNat France status → pas d'entrée pour place_id=6753
            .mockResolvedValueOnce({
                ok: true,
                json: async () => ({
                    results: [
                        { conservation_statuses: [] }
                    ]
                })
            } as Response)
            // 4. Wikipedia FR → 404 (pas d'article)
            .mockResolvedValueOnce({ ok: false } as Response)
            // 5. GBIF IUCN fallback → pas d'entrée IUCN
            .mockResolvedValueOnce({
                ok: true,
                json: async () => ({ additionalStatus: [] })
            } as Response);

        const info = await fetchSpeciesInfo('Raruspecis obscura');

        expect(info).not.toBeNull();
        expect(info?.redListStatus).toBe('NE');
        // redListSource reste undefined pour signaler que c'est un défaut, pas une donnée sourcée
        expect(info?.redListSource).toBeUndefined();
    });
});
