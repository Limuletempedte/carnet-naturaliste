import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { setSessionIdentity } from '../services/sessionScope';
import { Age, Comportement, Observation, ObservationCondition, Protocol, Sexe, Status, TaxonomicGroup, WeatherCondition } from '../types';

const mocks = vi.hoisted(() => ({
    identifySpecies: vi.fn(),
    suggestSpeciesAutocomplete: vi.fn(),
    fetchSpeciesInfo: vi.fn(),
}));

vi.mock('../services/aiAssistService', async (importOriginal) => {
    const actual = await importOriginal<typeof import('../services/aiAssistService')>();
    return { ...actual, identifySpecies: mocks.identifySpecies };
});
vi.mock('../services/speciesService', () => ({
    suggestSpeciesAutocomplete: mocks.suggestSpeciesAutocomplete,
    fetchSpeciesInfo: mocks.fetchSpeciesInfo,
    mapINatIconicToTaxonomicGroup: (iconic?: string) => (iconic === 'Aves' ? 'Oiseaux' : undefined),
}));
// La photo privée n'a pas besoin d'être réellement chargée ici.
vi.mock('../hooks/usePrivateMedia', () => ({ usePrivateMedia: () => undefined }));

import ObservationForm from '../components/ObservationForm';
import { AiAssistError } from '../services/aiAssistService';

class MockIntersectionObserver {
    observe() { }
    unobserve() { }
    disconnect() { }
}

const makeObservation = (overrides: Partial<Observation> = {}): Observation => ({
    id: '123e4567-e89b-42d3-a456-426614174000',
    speciesName: 'Oiseau à identifier',
    latinName: '',
    taxonomicGroup: TaxonomicGroup.BIRD,
    date: '2026-05-14',
    time: '12:00',
    count: 1,
    location: 'Bois',
    gps: { lat: 50.6, lon: 3.06 },
    municipality: 'Lille',
    department: 'Nord',
    country: 'France',
    altitude: 20,
    comment: 'Commentaire privé',
    status: Status.NE,
    atlasCode: '',
    protocol: Protocol.OPPORTUNIST,
    sexe: Sexe.UNKNOWN,
    age: Age.UNKNOWN,
    observationCondition: ObservationCondition.UNKNOWN,
    comportement: Comportement.UNKNOWN,
    weather: WeatherCondition.UNKNOWN,
    photo: 'photos/user-1/photo.jpg',
    sound: undefined,
    wikipediaImage: undefined,
    ...overrides,
});

const robin = {
    scientificName: 'Erithacus rubecula',
    commonName: 'Rougegorge familier',
    confidence: 'elevee' as const,
    visibleCriteria: ['Poitrine orange'],
    criteriaToCheck: ['Chant'],
};

const renderForm = (props: Partial<React.ComponentProps<typeof ObservationForm>> = {}) => {
    const onToast = vi.fn();
    const utils = render(
        <ObservationForm
            onSave={vi.fn(async () => { })}
            onCancel={vi.fn()}
            initialData={makeObservation()}
            onToast={onToast}
            {...props}
        />,
    );
    return { ...utils, onToast };
};

const speciesInput = () => screen.getByLabelText(/Nom de l'espèce/i) as HTMLInputElement;
const latinInput = () => document.getElementById('latinName') as HTMLInputElement;
const aiButton = () => screen.queryByRole('button', { name: /Aide à l'identification|Analyse en cours/ }) as HTMLButtonElement | null;

beforeEach(() => {
    Object.values(mocks).forEach(mock => mock.mockReset());
    localStorage.clear();
    setSessionIdentity('user-1');
    Object.defineProperty(window, 'IntersectionObserver', { writable: true, value: MockIntersectionObserver });
    mocks.fetchSpeciesInfo.mockResolvedValue(null);
    mocks.suggestSpeciesAutocomplete.mockResolvedValue([]);
    mocks.identifySpecies.mockResolvedValue({ candidates: [robin], photoNote: 'Photo nette.', remaining: 19 });
});

describe("ObservationForm — aide à l'identification", () => {
    it("n'affiche pas le bouton sans photo", () => {
        renderForm({ initialData: makeObservation({ photo: undefined }) });
        expect(aiButton()).toBeNull();
    });

    it('désactive le bouton hors ligne', () => {
        renderForm({ isOffline: true });
        expect(aiButton()?.disabled).toBe(true);
        expect(screen.getByText('Disponible en ligne uniquement.')).toBeTruthy();
        fireEvent.click(aiButton()!);
        expect(mocks.identifySpecies).not.toHaveBeenCalled();
    });

    it("n'envoie que le contexte autorisé, sans le groupe par défaut", async () => {
        renderForm();
        fireEvent.click(aiButton()!);
        await screen.findByText('Rougegorge familier');
        expect(mocks.identifySpecies).toHaveBeenCalledTimes(1);
        const [photo, context] = mocks.identifySpecies.mock.calls[0];
        expect(photo).toBe('photos/user-1/photo.jpg');
        expect(context).toEqual({
            date: '2026-05-14',
            country: 'France',
            department: 'Nord',
            taxonomicGroup: undefined,
            habitat: undefined,
        });
        // Rien n'est appliqué sans clic sur « Choisir »
        expect(speciesInput().value).toBe('Oiseau à identifier');
        expect(latinInput().value).toBe('');
    });

    it('envoie le groupe quand il a été choisi', async () => {
        renderForm({ initialData: makeObservation({ taxonomicGroup: TaxonomicGroup.BUTTERFLY }) });
        fireEvent.click(aiButton()!);
        await screen.findByText('Rougegorge familier');
        expect(mocks.identifySpecies.mock.calls[0][1].taxonomicGroup).toBe(TaxonomicGroup.BUTTERFLY);
    });

    it('reprend le nom vérifié au clic sur « Choisir »', async () => {
        mocks.suggestSpeciesAutocomplete.mockImplementation(async (query: string) => (query === 'Erithacus rubecula'
            ? [{ displayName: 'Rougegorge familier', latinName: 'Erithacus rubecula', source: 'inat', iconicTaxonName: 'Aves' }]
            : []));
        const { onToast } = renderForm();
        fireEvent.click(aiButton()!);
        fireEvent.click(await screen.findByRole('button', { name: 'Choisir Rougegorge familier' }));

        await waitFor(() => expect(speciesInput().value).toBe('Rougegorge familier'));
        expect(latinInput().value).toBe('Erithacus rubecula');
        expect(mocks.suggestSpeciesAutocomplete).toHaveBeenCalledWith('Erithacus rubecula', 5, expect.objectContaining({ signal: expect.any(AbortSignal) }));
        expect(onToast).toHaveBeenCalledWith('success', expect.stringContaining('Rougegorge familier'));
    });

    it("remplit quand même l'espèce et prévient si le nom est introuvable", async () => {
        const { onToast } = renderForm();
        fireEvent.click(aiButton()!);
        fireEvent.click(await screen.findByRole('button', { name: 'Choisir Rougegorge familier' }));

        await waitFor(() => expect(speciesInput().value).toBe('Rougegorge familier'));
        expect(latinInput().value).toBe('Erithacus rubecula');
        expect(onToast).toHaveBeenCalledWith('warning', expect.stringContaining('introuvable'), 7000);
    });

    it('demande confirmation avant de remplacer un nom latin saisi à la main', async () => {
        mocks.suggestSpeciesAutocomplete.mockImplementation(async (query: string) => (query === 'Erithacus rubecula'
            ? [{ displayName: 'Rougegorge familier', latinName: 'Erithacus rubecula', source: 'inat' }]
            : []));
        renderForm({ initialData: makeObservation({ latinName: 'Phoenicurus ochruros' }) });
        fireEvent.click(aiButton()!);
        fireEvent.click(await screen.findByRole('button', { name: 'Choisir Rougegorge familier' }));

        expect(await screen.findByText('Remplacer le nom latin ?')).toBeTruthy();
        expect(mocks.suggestSpeciesAutocomplete).not.toHaveBeenCalledWith('Erithacus rubecula', 5, expect.anything());

        // Annuler : rien ne change
        fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Annuler' }));
        expect(screen.queryByRole('dialog')).toBeNull();
        expect(latinInput().value).toBe('Phoenicurus ochruros');

        // Confirmer : le nom latin est remplacé
        fireEvent.click(screen.getByRole('button', { name: 'Choisir Rougegorge familier' }));
        fireEvent.click(await screen.findByRole('button', { name: 'Confirmer' }));
        await waitFor(() => expect(latinInput().value).toBe('Erithacus rubecula'));
        expect(speciesInput().value).toBe('Rougegorge familier');
    });

    it("propose d'ouvrir l'accès quand la personne n'est pas approuvée", async () => {
        mocks.identifySpecies.mockRejectedValue(new AiAssistError('not_approved'));
        const onOpenAiAccess = vi.fn();
        renderForm({ onOpenAiAccess });
        fireEvent.click(aiButton()!);
        expect((await screen.findByRole('alert')).textContent).toContain("pas encore accès");
        fireEvent.click(screen.getByRole('button', { name: "Ouvrir l'accès à l'assistant" }));
        expect(onOpenAiAccess).toHaveBeenCalledTimes(1);
    });

    it("n'empêche pas d'enregistrer pendant une analyse", async () => {
        mocks.identifySpecies.mockReturnValue(new Promise(() => { }));
        renderForm();
        fireEvent.click(aiButton()!);
        expect(await screen.findByText('Analyse en cours…')).toBeTruthy();
        const save = screen.getAllByRole('button', { name: 'Sauvegarder' })[0] as HTMLButtonElement;
        expect(save.disabled).toBe(false);
    });
});
