import { setSessionIdentity } from '../services/sessionScope';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Age, Comportement, Observation, ObservationCondition, Protocol, Sexe, Status, TaxonomicGroup, WeatherCondition } from '../types';

const {
    suggestSpeciesAutocompleteMock,
    fetchSpeciesInfoMock,
    mapINatIconicToTaxonomicGroupMock
} = vi.hoisted(() => ({
    suggestSpeciesAutocompleteMock: vi.fn(),
    fetchSpeciesInfoMock: vi.fn(),
    mapINatIconicToTaxonomicGroupMock: vi.fn((iconicName?: string) => {
        if (iconicName === 'Mammalia') return 'Mammifères';
        if (iconicName === 'Aves') return 'Oiseaux';
        return undefined;
    })
}));

vi.mock('../services/speciesService', () => ({
    suggestSpeciesAutocomplete: suggestSpeciesAutocompleteMock,
    fetchSpeciesInfo: fetchSpeciesInfoMock,
    mapINatIconicToTaxonomicGroup: mapINatIconicToTaxonomicGroupMock
}));

import ObservationForm from '../components/ObservationForm';

class MockIntersectionObserver {
    observe() { }
    unobserve() { }
    disconnect() { }
}

const makeObservation = (overrides: Partial<Observation> = {}): Observation => ({
    id: '123e4567-e89b-42d3-a456-426614174000',
    speciesName: 'Renard roux',
    latinName: 'Vulpes vulpes',
    taxonomicGroup: TaxonomicGroup.MAMMAL,
    date: '2026-03-01',
    time: '12:00',
    count: 1,
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
    photo: undefined,
    sound: undefined,
    wikipediaImage: undefined,
    ...overrides
});

describe('ObservationForm species autocomplete', () => {
    beforeEach(() => {
        setSessionIdentity('user-1');
        vi.clearAllMocks();
        Object.defineProperty(window, 'IntersectionObserver', {
            writable: true,
            value: MockIntersectionObserver
        });
        fetchSpeciesInfoMock.mockResolvedValue(null);
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('shows suggestions and applies selection with keyboard', async () => {
        suggestSpeciesAutocompleteMock.mockResolvedValue([
            {
                displayName: 'Mesange bleue',
                latinName: 'Cyanistes caeruleus',
                source: 'inat'
            }
        ]);

        const user = userEvent.setup();
        render(
            <ObservationForm
                onSave={vi.fn(async () => { })}
                onCancel={vi.fn()}
                initialData={null}
                onToast={vi.fn()}
            />
        );

        const speciesInput = screen.getByLabelText(/Nom de l'espèce/i) as HTMLInputElement;
        const latinInput = screen.getByLabelText(/Nom latin/i) as HTMLInputElement;

        await user.type(speciesInput, 'Mes');

        await waitFor(() => {
            expect(suggestSpeciesAutocompleteMock).toHaveBeenCalledWith('Mes', 5, expect.any(Object));
        }, { timeout: 3000 });

        expect(await screen.findByText('Mesange bleue')).toBeTruthy();

        await user.keyboard('{ArrowDown}{Enter}');

        expect(speciesInput.value).toBe('Mesange bleue');
        expect(latinInput.value).toBe('Cyanistes caeruleus');
    });

    it('closes suggestions on escape', async () => {
        suggestSpeciesAutocompleteMock.mockResolvedValue([
            {
                displayName: 'Mesange charbonniere',
                latinName: 'Parus major',
                source: 'inat'
            }
        ]);

        const user = userEvent.setup();
        render(
            <ObservationForm
                onSave={vi.fn(async () => { })}
                onCancel={vi.fn()}
                initialData={null}
                onToast={vi.fn()}
            />
        );

        const speciesInput = screen.getByLabelText(/Nom de l'espèce/i);
        await user.type(speciesInput, 'Mes');
        expect(await screen.findByText('Mesange charbonniere')).toBeTruthy();

        await user.keyboard('{Escape}');

        await waitFor(() => {
            expect(screen.queryByText('Mesange charbonniere')).toBeNull();
        });
    });

    it('replaces stale wikipedia image when switching to another species suggestion', async () => {
        suggestSpeciesAutocompleteMock.mockImplementation(async (query: string) => {
            if (query.toLowerCase().startsWith('mes')) {
                return [{
                    displayName: 'Mesange bleue',
                    latinName: 'Cyanistes caeruleus',
                    source: 'inat',
                    iconicTaxonName: 'Aves',
                    imageUrl: 'https://img.example/mesange.jpg'
                }];
            }
            if (query.toLowerCase().startsWith('ren')) {
                return [{
                    displayName: 'Renard roux',
                    latinName: 'Vulpes vulpes',
                    source: 'inat',
                    iconicTaxonName: 'Mammalia'
                }];
            }
            return [];
        });

        const onSave = vi.fn(async (_observation: Observation) => { });
        const user = userEvent.setup();

        render(
            <ObservationForm
                onSave={onSave}
                onCancel={vi.fn()}
                initialData={null}
                onToast={vi.fn()}
            />
        );

        const speciesInput = screen.getByLabelText(/Nom de l'espèce/i) as HTMLInputElement;

        await user.type(speciesInput, 'Mes');
        expect(await screen.findByText('Mesange bleue')).toBeTruthy();
        await user.keyboard('{ArrowDown}{Enter}');

        await user.clear(speciesInput);
        await user.type(speciesInput, 'Ren');
        expect(await screen.findByText('Renard roux')).toBeTruthy();
        await user.keyboard('{ArrowDown}{Enter}');

        await user.click(screen.getByRole('button', { name: /Sauvegarder/i }));

        await waitFor(() => {
            expect(onSave).toHaveBeenCalledTimes(1);
        });

        const savedObservation = onSave.mock.calls[0][0];
        expect(savedObservation.speciesName).toBe('Renard roux');
        expect(savedObservation.latinName).toBe('Vulpes vulpes');
        expect(savedObservation.taxonomicGroup).toBe(TaxonomicGroup.MAMMAL);
        expect(savedObservation.wikipediaImage).toBeUndefined();
    });

    it('keeps existing wikipedia image when same lookup returns info without image', async () => {
        fetchSpeciesInfoMock.mockResolvedValue({
            description: 'desc',
            imageUrl: null,
            sourceUrl: '',
            latinName: 'Vulpes vulpes',
            taxonomicGroup: TaxonomicGroup.BIRD,
            matchedBy: 'latin',
            confidence: 'high'
        });

        const onSave = vi.fn(async (_observation: Observation) => { });
        const user = userEvent.setup();

        render(
            <ObservationForm
                onSave={onSave}
                onCancel={vi.fn()}
                initialData={makeObservation({ wikipediaImage: 'https://img.example/existing.jpg' })}
                onToast={vi.fn()}
            />
        );

        await waitFor(() => {
            expect(fetchSpeciesInfoMock).toHaveBeenCalled();
        }, { timeout: 3000 });

        await user.click(screen.getByRole('button', { name: /Sauvegarder/i }));

        await waitFor(() => {
            expect(onSave).toHaveBeenCalledTimes(1);
        });

        const savedObservation = onSave.mock.calls[0][0];
        expect(savedObservation.wikipediaImage).toBe('https://img.example/existing.jpg');
        expect(savedObservation.taxonomicGroup).toBe(TaxonomicGroup.MAMMAL);
    });

    // Garde-fou: appliquer une suggestion ne doit PAS relancer une requête de
    // suggestions pour le nom appliqué (mécanisme skipNextSuggestionsFetchRef).
    it('does not refetch suggestions for the name applied from a suggestion', async () => {
        suggestSpeciesAutocompleteMock.mockResolvedValue([
            { displayName: 'Mesange bleue', latinName: 'Cyanistes caeruleus', source: 'inat' }
        ]);

        const user = userEvent.setup();
        render(
            <ObservationForm onSave={vi.fn(async () => { })} onCancel={vi.fn()} initialData={null} onToast={vi.fn()} />
        );

        const speciesInput = screen.getByLabelText(/Nom de l'espèce/i) as HTMLInputElement;
        await user.type(speciesInput, 'Mes');
        expect(await screen.findByText('Mesange bleue')).toBeTruthy();
        await user.keyboard('{ArrowDown}{Enter}');

        await waitFor(() => {
            expect(speciesInput.value).toBe('Mesange bleue');
        });

        const refetchedAppliedName = suggestSpeciesAutocompleteMock.mock.calls.some(
            ([query]) => typeof query === 'string' && query.toLowerCase().startsWith('mesange')
        );
        expect(refetchedAppliedName).toBe(false);
    });

    // Garde-fou: un clic en dehors de la zone de saisie ferme les suggestions
    // (jusqu'ici seul Escape était couvert).
    it('closes suggestions when clicking outside the species input', async () => {
        suggestSpeciesAutocompleteMock.mockResolvedValue([
            { displayName: 'Mesange noire', latinName: 'Periparus ater', source: 'inat' }
        ]);

        const user = userEvent.setup();
        render(
            <ObservationForm onSave={vi.fn(async () => { })} onCancel={vi.fn()} initialData={null} onToast={vi.fn()} />
        );

        const speciesInput = screen.getByLabelText(/Nom de l'espèce/i);
        await user.type(speciesInput, 'Mes');
        expect(await screen.findByText('Mesange noire')).toBeTruthy();

        await user.click(screen.getByLabelText(/Nom latin/i));

        await waitFor(() => {
            expect(screen.queryByText('Mesange noire')).toBeNull();
        });
    });
});

describe('ObservationForm species enrichment', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        Object.defineProperty(window, 'IntersectionObserver', {
            writable: true,
            value: MockIntersectionObserver
        });
        // Pas de dropdown de suggestions dans ces tests : on isole l'enrichissement.
        suggestSpeciesAutocompleteMock.mockResolvedValue([]);
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    // Garde-fou: l'enrichissement auto-applique nom latin / groupe / statut
    // tant que les champs n'ont pas été édités manuellement.
    it('auto-applies latin name, taxonomic group and status from species info', async () => {
        fetchSpeciesInfoMock.mockResolvedValue({
            description: 'Le renard roux est un mammifère.',
            imageUrl: null,
            sourceUrl: 'https://fr.wikipedia.org/wiki/Renard_roux',
            latinName: 'Vulpes vulpes',
            taxonomicGroup: TaxonomicGroup.MAMMAL,
            redListStatus: Status.LC,
            redListSource: 'france',
            matchedBy: 'common',
            confidence: 'high'
        });

        const onSave = vi.fn(async (_observation: Observation) => { });
        const user = userEvent.setup();
        render(
            <ObservationForm onSave={onSave} onCancel={vi.fn()} initialData={null} onToast={vi.fn()} />
        );

        const speciesInput = screen.getByLabelText(/Nom de l'espèce/i);
        const latinInput = screen.getByLabelText(/Nom latin/i) as HTMLInputElement;

        await user.type(speciesInput, 'Renard roux');

        await waitFor(() => {
            expect(latinInput.value).toBe('Vulpes vulpes');
        }, { timeout: 3000 });
        // L'auto-remplissage du nom latin change le lookupKey : groupe et statut
        // sont donc appliqués au cycle d'enrichissement suivant. On attend que le
        // groupe taxonomique soit bien passé à « Mammifères » avant de sauvegarder.
        await waitFor(() => {
            expect(
                screen.getByRole('radio', { name: 'Mammifères' }).getAttribute('aria-checked')
            ).toBe('true');
        }, { timeout: 4000 });

        await user.click(screen.getByRole('button', { name: /Sauvegarder/i }));

        await waitFor(() => {
            expect(onSave).toHaveBeenCalledTimes(1);
        });

        const saved = onSave.mock.calls[0][0];
        expect(saved.latinName).toBe('Vulpes vulpes');
        expect(saved.taxonomicGroup).toBe(TaxonomicGroup.MAMMAL);
        expect(saved.status).toBe(Status.LC);
    });

    // Garde-fou: un nom latin saisi à la main ne doit pas être écrasé par
    // l'enrichissement (respect du flag fieldTouched.latinName).
    it('does not overwrite a manually edited latin name during enrichment', async () => {
        fetchSpeciesInfoMock.mockResolvedValue({
            description: 'desc-enrichi',
            imageUrl: null,
            sourceUrl: '',
            latinName: 'Vulpes vulpes',
            taxonomicGroup: TaxonomicGroup.MAMMAL,
            matchedBy: 'latin',
            confidence: 'high'
        });

        const onSave = vi.fn(async (_observation: Observation) => { });
        const user = userEvent.setup();
        render(
            <ObservationForm onSave={onSave} onCancel={vi.fn()} initialData={null} onToast={vi.fn()} />
        );

        const speciesInput = screen.getByLabelText(/Nom de l'espèce/i);
        const latinInput = screen.getByLabelText(/Nom latin/i) as HTMLInputElement;

        await user.type(speciesInput, 'Renard');
        await user.type(latinInput, 'Mon latin perso'); // marque latinName comme "touché"

        // Attend que l'enrichissement ait résolu ET appliqué (le panneau affiche la description).
        // Timeout explicite : le debounce d'enrichissement est de 1 s, au-delà du défaut de findByText.
        expect(await screen.findByText('desc-enrichi', undefined, { timeout: 3000 })).toBeTruthy();

        await user.click(screen.getByRole('button', { name: /Sauvegarder/i }));

        await waitFor(() => {
            expect(onSave).toHaveBeenCalledTimes(1);
        });

        const saved = onSave.mock.calls[0][0];
        expect(saved.latinName).toBe('Mon latin perso'); // non écrasé
        expect(saved.taxonomicGroup).toBe(TaxonomicGroup.MAMMAL); // l'enrichissement a bien tourné
    });

    // Garde-fou: une réponse d'enrichissement obsolète (espèce changée entre temps)
    // ne doit pas être appliquée (mécanisme latestSpeciesRequestRef + abort).
    it('ignores a stale species info response when the species changed', async () => {
        // Pas de latinName ici : on garde le lookupKey stable (sinon l'auto-remplissage
        // du latin vide puis recharge speciesInfo, ce qui parasiterait l'assertion).
        const firstInfo = {
            description: 'INFO PREMIERE', imageUrl: null, sourceUrl: '',
            taxonomicGroup: TaxonomicGroup.BIRD,
            matchedBy: 'common', confidence: 'high'
        };
        const secondInfo = {
            description: 'INFO SECONDE', imageUrl: null, sourceUrl: '',
            taxonomicGroup: TaxonomicGroup.MAMMAL,
            matchedBy: 'common', confidence: 'high'
        };
        let resolveFirst: () => void = () => { };
        fetchSpeciesInfoMock.mockImplementation((name: string) => {
            if (name.toLowerCase().includes('premiere')) {
                return new Promise(resolve => { resolveFirst = () => resolve(firstInfo); });
            }
            return Promise.resolve(secondInfo);
        });

        const user = userEvent.setup();
        render(
            <ObservationForm onSave={vi.fn(async () => { })} onCancel={vi.fn()} initialData={null} onToast={vi.fn()} />
        );

        const speciesInput = screen.getByLabelText(/Nom de l'espèce/i);

        await user.type(speciesInput, 'Premiere');
        await waitFor(() => {
            expect(fetchSpeciesInfoMock).toHaveBeenCalled(); // 1re requête en vol (non résolue)
        }, { timeout: 3000 });

        await user.clear(speciesInput);
        await user.type(speciesInput, 'Seconde');
        // Timeout aligné sur le waitFor ci-dessus (3000 ms) : la recherche d'espèce est
        // debouncée, 1000 ms (défaut) peut déborder sous charge → test instable.
        expect(await screen.findByText('INFO SECONDE', undefined, { timeout: 3000 })).toBeTruthy(); // 2e requête résolue et appliquée

        // On résout maintenant la 1re requête (obsolète) : elle doit être ignorée.
        resolveFirst();
        await new Promise(resolve => setTimeout(resolve, 100));

        expect(screen.queryByText('INFO PREMIERE')).toBeNull();
        expect(screen.getByText('INFO SECONDE')).toBeTruthy();
    });

    // Garde-fou: le bouton "Rafraîchir" force un refetch sans cache et notifie
    // le résultat (handleRefreshSpeciesInfo, bypassCache).
    it('refreshes species info bypassing cache and toasts the result', async () => {
        fetchSpeciesInfoMock.mockResolvedValue({
            description: 'desc',
            imageUrl: null,
            sourceUrl: '',
            latinName: 'Vulpes vulpes',
            taxonomicGroup: TaxonomicGroup.MAMMAL,
            redListStatus: Status.VU,
            redListSource: 'france',
            matchedBy: 'common',
            confidence: 'high'
        });

        const onToast = vi.fn();
        const user = userEvent.setup();
        render(
            <ObservationForm onSave={vi.fn(async () => { })} onCancel={vi.fn()} initialData={makeObservation()} onToast={onToast} />
        );

        const refreshBtn = await screen.findByRole('button', { name: /Rafraîchir les informations/i });
        fetchSpeciesInfoMock.mockClear();
        await user.click(refreshBtn);

        await waitFor(() => {
            expect(fetchSpeciesInfoMock).toHaveBeenCalledWith(
                expect.any(String),
                expect.objectContaining({ bypassCache: true })
            );
        });
        await waitFor(() => {
            expect(onToast).toHaveBeenCalledWith('success', expect.stringContaining('rafraîchies'));
        });
    });
});
