import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { setSessionIdentity } from '../services/sessionScope';
import { Age, Comportement, Observation, ObservationCondition, Protocol, Sexe, Status, TaxonomicGroup, WeatherCondition } from '../types';

const mocks = vi.hoisted(() => ({
    callAiText: vi.fn(),
    getAiOverview: vi.fn(),
    giveConsent: vi.fn(),
    suggestSpeciesAutocomplete: vi.fn(),
    fetchSpeciesInfo: vi.fn(),
}));

vi.mock('../services/aiAssistService', async (importOriginal) => {
    const actual = await importOriginal<typeof import('../services/aiAssistService')>();
    return { ...actual, callAiText: mocks.callAiText, getAiOverview: mocks.getAiOverview, giveConsent: mocks.giveConsent };
});
vi.mock('../services/speciesService', () => ({
    suggestSpeciesAutocomplete: mocks.suggestSpeciesAutocomplete,
    fetchSpeciesInfo: mocks.fetchSpeciesInfo,
    mapINatIconicToTaxonomicGroup: (iconic?: string) => (iconic === 'Aves' ? 'Oiseaux' : undefined),
}));
vi.mock('../hooks/usePrivateMedia', () => ({ usePrivateMedia: () => undefined }));

import ObservationForm from '../components/ObservationForm';
import { AiAssistError, type AiOverview } from '../services/aiAssistService';

class MockIntersectionObserver {
    observe() { }
    unobserve() { }
    disconnect() { }
}

const makeObservation = (overrides: Partial<Observation> = {}): Observation => ({
    id: '123e4567-e89b-42d3-a456-426614174000',
    speciesName: '',
    latinName: '',
    taxonomicGroup: TaxonomicGroup.BIRD,
    date: '2026-05-14',
    time: '12:00',
    count: 1,
    location: '',
    gps: { lat: null, lon: null },
    municipality: '',
    department: '',
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
    ...overrides,
});

const approved = (consents: AiOverview['consents'] = { note: '2026-11-v1' }): AiOverview => ({
    access: { kind: 'approved', remaining: 12, monthlyQuota: 20 },
    consents,
    usedByFeature: {},
});

/** Réponse de la fonction : tous les champs, absents à null. */
const serverResult = (overrides: Record<string, unknown> = {}) => ({
    speciesName: null, scientificName: null, count: null, maleCount: null, femaleCount: null,
    dateExpr: { kind: 'none', offsetDays: null, weekday: null, day: null, month: null, year: null },
    time: null, location: null, weather: null, habitat: null, comportement: null, observationCondition: null,
    age: null, sexe: null, phenology: null, otherSpecies: [], remainder: null, dropped: [],
    ...overrides,
});

const NOTE = '3 mésanges charbonnières hier vers 8h30 au bord de l’étang, ensoleillé';

const renderForm = (initialData: Observation | null = makeObservation(), props: Partial<React.ComponentProps<typeof ObservationForm>> = {}) => {
    const onToast = vi.fn();
    const utils = render(
        <ObservationForm onSave={vi.fn(async () => { })} onCancel={vi.fn()} initialData={initialData} onToast={onToast} {...props} />,
    );
    return { ...utils, onToast };
};

const field = (id: string) => document.getElementById(id) as HTMLInputElement;
const openButton = () => screen.getByRole('button', { name: /Remplir depuis une note|Replier la note/ }) as HTMLButtonElement;
const noteBox = () => screen.getByLabelText('Votre note') as HTMLTextAreaElement;
const analyzeButton = () => screen.getByRole('button', { name: /Analyser la note|Vérification…|Analyse en cours…/ }) as HTMLButtonElement;

const openAndType = (text = NOTE) => {
    fireEvent.click(openButton());
    fireEvent.change(noteBox(), { target: { value: text } });
};

const deferred = <T,>() => {
    let resolve!: (value: T) => void;
    const promise = new Promise<T>(r => { resolve = r; });
    return { promise, resolve };
};

beforeEach(() => {
    Object.values(mocks).forEach(mock => mock.mockReset());
    localStorage.clear();
    setSessionIdentity('user-1');
    Object.defineProperty(window, 'IntersectionObserver', { writable: true, value: MockIntersectionObserver });
    mocks.fetchSpeciesInfo.mockResolvedValue(null);
    mocks.suggestSpeciesAutocomplete.mockResolvedValue([]);
    mocks.getAiOverview.mockResolvedValue(approved());
    mocks.giveConsent.mockResolvedValue(undefined);
    mocks.callAiText.mockResolvedValue({
        result: serverResult({
            speciesName: 'mésange charbonnière', count: 3,
            dateExpr: { kind: 'relative_days', offsetDays: -1, weekday: null, day: null, month: null, year: null },
            time: '08:30', location: 'bord de l’étang', weather: 'Ensoleillé', habitat: 'Eau douce',
        }),
        remaining: 11,
    });
});

describe('ObservationForm — note → fiche : saisie', () => {
    it('place le bouton en haut de la section Identification, avec le coût', () => {
        renderForm();
        const zone = screen.getByTestId('ai-note');
        const species = field('speciesName');
        expect(zone.compareDocumentPosition(species) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
        expect(within(zone).getByText(/1 utilisation/)).toBeTruthy();
    });

    it('est désactivé hors ligne, avec la raison', () => {
        renderForm(makeObservation(), { isOffline: true });
        expect(openButton().disabled).toBe(true);
        expect(within(screen.getByTestId('ai-note')).getByText('Disponible en ligne uniquement.')).toBeTruthy();
        fireEvent.click(openButton());
        expect(screen.queryByLabelText('Votre note')).toBeNull();
    });

    it('limite la note à 1 000 caractères, compte, aide à dicter et prévient', () => {
        renderForm();
        openAndType('abc');
        expect(noteBox().maxLength).toBe(1000);
        expect(screen.getByText('3 / 1000')).toBeTruthy();
        expect(screen.getByText('Vous pouvez dicter avec le micro de votre clavier.')).toBeTruthy();
        expect(screen.getByText(/Évitez les noms de personnes et la localisation précise d'espèces sensibles : la note est envoyée telle quelle/)).toBeTruthy();
    });

    it('garde la note quand la zone se replie, sans l’écrire dans le navigateur', () => {
        renderForm();
        openAndType();
        fireEvent.click(openButton());
        expect(screen.queryByLabelText('Votre note')).toBeNull();
        fireEvent.click(openButton());
        expect(noteBox().value).toBe(NOTE);
        const stored = Object.keys(localStorage).map(key => localStorage.getItem(key) ?? '').join(' ');
        expect(stored).not.toContain('mésanges');
    });

    it('reprend le commentaire d’une fiche existante comme note', () => {
        renderForm(makeObservation({ comment: 'Un pic vert sur la pelouse.' }));
        fireEvent.click(openButton());
        fireEvent.click(screen.getByRole('button', { name: 'Reprendre le commentaire de la fiche comme note' }));
        expect(noteBox().value).toBe('Un pic vert sur la pelouse.');
    });

    it('hors ligne, la note ouverte peut être gardée dans le commentaire sans appel', () => {
        const { rerender } = renderForm(makeObservation({ comment: 'Avant.' }));
        openAndType('Note du jour');
        rerender(<ObservationForm onSave={vi.fn(async () => { })} onCancel={vi.fn()} initialData={makeObservation({ comment: 'Avant.' })} onToast={vi.fn()} isOffline />);
        expect(analyzeButton().disabled).toBe(true);
        fireEvent.click(screen.getByRole('button', { name: 'Mettre la note dans le commentaire' }));
        expect((field('comment') as unknown as HTMLTextAreaElement).value).toBe('Avant.\n\nNote du jour');
        expect(mocks.callAiText).not.toHaveBeenCalled();
    });
});

describe('ObservationForm — note → fiche : envoi', () => {
    it('n’envoie que le texte, une seule fois malgré un double clic, et n’applique rien sans clic', async () => {
        renderForm();
        openAndType();
        fireEvent.click(analyzeButton());
        fireEvent.click(analyzeButton());
        await screen.findByTestId('ai-note-panel');
        expect(mocks.callAiText).toHaveBeenCalledTimes(1);
        expect(mocks.callAiText.mock.calls[0][0]).toBe('note');
        expect(mocks.callAiText.mock.calls[0][1]).toEqual({ text: NOTE });
        // Rien n'est appliqué tant qu'on n'a pas cliqué.
        expect(field('speciesName').value).toBe('');
        expect(field('count').value).toBe('1');
        expect(field('time').value).toBe('12:00');
        expect(screen.getByTestId('ai-note-status').textContent).toMatch(/proposés?, à relire/);
    });

    it('demande l’accord de la note au premier usage, puis analyse', async () => {
        mocks.getAiOverview.mockResolvedValue(approved({ summary: '2026-11-v1' }));
        renderForm();
        openAndType();
        fireEvent.click(analyzeButton());
        const card = await screen.findByTestId('ai-consent-card-note');
        expect(mocks.callAiText).not.toHaveBeenCalled();
        fireEvent.click(within(card).getByRole('checkbox'));
        mocks.getAiOverview.mockResolvedValue(approved());
        fireEvent.click(within(card).getByRole('button', { name: 'Accepter et analyser' }));
        await screen.findByTestId('ai-note-panel');
        expect(mocks.giveConsent).toHaveBeenCalledWith('note', expect.objectContaining({ userId: 'user-1' }));
        expect(mocks.callAiText).toHaveBeenCalledTimes(1);
    });

    it('n’envoie rien si l’on annule pendant l’enregistrement de l’accord', async () => {
        mocks.getAiOverview.mockResolvedValue(approved({}));
        const consent = deferred<void>();
        mocks.giveConsent.mockReturnValue(consent.promise);
        renderForm();
        openAndType();
        fireEvent.click(analyzeButton());
        const card = await screen.findByTestId('ai-consent-card-note');
        fireEvent.click(within(card).getByRole('checkbox'));
        fireEvent.click(within(card).getByRole('button', { name: 'Accepter et analyser' }));
        fireEvent.click(within(card).getByRole('button', { name: 'Annuler' }));
        // Le bouton revient, mais reste bloqué tant que l'accord s'enregistre.
        fireEvent.click(analyzeButton());
        await act(async () => { consent.resolve(); });
        expect(mocks.callAiText).not.toHaveBeenCalled();
    });

    it('replier la zone masque seulement : l’analyse continue et son résultat attend', async () => {
        const pending = deferred<unknown>();
        mocks.callAiText.mockReturnValue(pending.promise);
        renderForm();
        openAndType();
        fireEvent.click(analyzeButton());
        await waitFor(() => expect(mocks.callAiText).toHaveBeenCalledTimes(1));
        fireEvent.click(openButton());
        expect(screen.queryByTestId('ai-note-zone')).toBeNull();
        await act(async () => {
            pending.resolve({ result: serverResult({ speciesName: 'pic vert' }), remaining: 11 });
        });
        expect(mocks.callAiText.mock.calls[0][2].signal.aborted).toBe(false);
        fireEvent.click(openButton());
        expect(await screen.findByTestId('ai-note-panel')).toBeTruthy();
        expect(field('speciesName').value).toBe('');
    });

    it('un double clic dans le même instant ne fait qu’un envoi (verrou synchrone)', async () => {
        renderForm();
        openAndType();
        const button = analyzeButton();
        act(() => { button.click(); button.click(); });
        await screen.findByTestId('ai-note-panel');
        expect(mocks.callAiText).toHaveBeenCalledTimes(1);
    });

    it('rend le focus au bouton « Analyser » quand la carte d’accord disparaît', async () => {
        mocks.getAiOverview.mockResolvedValue(approved({}));
        mocks.callAiText.mockReturnValue(new Promise(() => undefined));
        renderForm();
        openAndType();
        fireEvent.click(analyzeButton());
        const card = await screen.findByTestId('ai-consent-card-note');
        fireEvent.click(within(card).getByRole('checkbox'));
        mocks.getAiOverview.mockResolvedValue(approved());
        fireEvent.click(within(card).getByRole('button', { name: 'Accepter et analyser' }));
        await waitFor(() => expect(document.activeElement?.textContent).toMatch(/Analyse en cours/));
    });

    it('« Annuler » pendant l’attente arrête tout : rien n’est appliqué', async () => {
        const pending = deferred<unknown>();
        mocks.callAiText.mockReturnValue(pending.promise);
        renderForm();
        openAndType();
        fireEvent.click(analyzeButton());
        fireEvent.click(await within(screen.getByTestId('ai-note')).findByRole('button', { name: 'Annuler' }));
        await act(async () => {
            pending.resolve({ result: serverResult({ speciesName: 'mésange', count: 3 }), remaining: 11 });
        });
        expect(screen.queryByTestId('ai-note-panel')).toBeNull();
        expect(screen.getByText(/arrêtée : rien n’a été appliqué/).textContent).toMatch(/peut compter dans votre quota/);
        expect(field('speciesName').value).toBe('');
        expect(mocks.callAiText.mock.calls[0][2].signal.aborted).toBe(true);
    });

    it('note hors sujet : un message clair, sans panneau vide', async () => {
        mocks.callAiText.mockResolvedValue({ result: serverResult(), remaining: 11 });
        renderForm();
        openAndType('Penser à acheter du pain');
        fireEvent.click(analyzeButton());
        expect(await screen.findByTestId('ai-note-empty')).toBeTruthy();
        expect(screen.queryByTestId('ai-note-panel')).toBeNull();
    });

    it('fonctionnalité fermée : « momentanément indisponible », sans erreur technique', async () => {
        mocks.callAiText.mockRejectedValue(new AiAssistError('feature_disabled', { feature: 'note' }));
        renderForm();
        openAndType();
        fireEvent.click(analyzeButton());
        const alert = await screen.findByText(/momentanément indisponible/);
        expect(alert.textContent).not.toMatch(/503|feature_disabled/);
        expect(noteBox().value).toBe(NOTE);
    });

    it('réponse inexploitable : le message dit que l’utilisation compte', async () => {
        mocks.callAiText.mockResolvedValue({ result: 'pas un objet', remaining: 10 });
        renderForm();
        openAndType();
        fireEvent.click(analyzeButton());
        expect(await screen.findByText(/compte dans votre quota/)).toBeTruthy();
    });
});

describe('ObservationForm — note → fiche : relecture et application', () => {
    it('affiche une balise écrite dans la note telle quelle, jamais interprétée', async () => {
        const evil = '<img src=x onerror="window.__piege=1">';
        mocks.callAiText.mockResolvedValue({ result: serverResult({ location: evil, otherSpecies: [evil] }), remaining: 11 });
        renderForm();
        openAndType();
        fireEvent.click(analyzeButton());
        const panel = await screen.findByTestId('ai-note-panel');
        expect(within(panel).getAllByText(evil).length).toBe(2);
        expect(panel.querySelector('img')).toBeNull();
        expect((window as unknown as { __piege?: number }).__piege).toBeUndefined();
    });

    it('applique la sélection en une action, puis l’annule', async () => {
        mocks.suggestSpeciesAutocomplete.mockImplementation(async (query: string) => (query === 'mésange charbonnière'
            ? [{ displayName: 'Mésange charbonnière', latinName: 'Parus major', source: 'inat', iconicTaxonName: 'Aves' }]
            : []));
        renderForm(makeObservation({ comment: 'Avant.' }));
        openAndType();
        fireEvent.click(analyzeButton());
        const panel = await screen.findByTestId('ai-note-panel');
        // Fiche existante : date et heure déjà renseignées, donc pas pré-cochées.
        const time = within(panel).getByRole('checkbox', { name: /Heure/ }) as HTMLInputElement;
        expect(time.checked).toBe(false);
        expect(within(panel).getByText(/mercredi 13 mai 2026/)).toBeTruthy();
        fireEvent.click(time);
        fireEvent.click(within(panel).getByRole('button', { name: 'Appliquer la sélection' }));
        await screen.findByTestId('ai-note-applied');
        expect(field('speciesName').value).toBe('Mésange charbonnière');
        expect(field('latinName').value).toBe('Parus major');
        expect(field('count').value).toBe('3');
        expect(field('time').value).toBe('08:30');
        expect(field('date').value).toBe('2026-05-14');
        expect(field('location').value).toBe('bord de l’étang');
        expect((field('weather') as unknown as HTMLSelectElement).value).toBe('Ensoleillé');
        expect((field('comment') as unknown as HTMLTextAreaElement).value).toBe(`Avant.\n\n${NOTE}`);
        expect(mocks.suggestSpeciesAutocomplete).toHaveBeenCalledWith('mésange charbonnière', 5, expect.anything());

        fireEvent.click(screen.getByRole('button', { name: "Annuler l'application" }));
        expect(field('speciesName').value).toBe('');
        expect(field('count').value).toBe('1');
        expect(field('time').value).toBe('12:00');
        expect((field('comment') as unknown as HTMLTextAreaElement).value).toBe('Avant.');
        // Retour au panneau : on peut réappliquer sans repayer.
        expect(screen.getByTestId('ai-note-panel')).toBeTruthy();
        expect(mocks.callAiText).toHaveBeenCalledTimes(1);
    });

    it('nom introuvable : remplit tel que proposé avec un avertissement', async () => {
        renderForm();
        openAndType();
        fireEvent.click(analyzeButton());
        const panel = await screen.findByTestId('ai-note-panel');
        fireEvent.click(within(panel).getByRole('button', { name: 'Appliquer la sélection' }));
        const applied = await screen.findByTestId('ai-note-applied');
        expect(field('speciesName').value).toBe('mésange charbonnière');
        expect(applied.textContent).toMatch(/Nom introuvable/);
    });

    it('demande avant de remplacer un nom latin tapé à la main ; refuser n’applique rien', async () => {
        mocks.callAiText.mockResolvedValue({ result: serverResult({ speciesName: 'mésange charbonnière', scientificName: 'Parus major', count: 3 }), remaining: 11 });
        renderForm();
        fireEvent.change(field('latinName'), { target: { value: 'Cyanistes caeruleus' } });
        openAndType();
        fireEvent.click(analyzeButton());
        const panel = await screen.findByTestId('ai-note-panel');
        fireEvent.click(within(panel).getByRole('checkbox', { name: /Espèce/ }));
        fireEvent.click(within(panel).getByRole('button', { name: 'Appliquer la sélection' }));
        expect(await screen.findByText('Remplacer le nom latin ?')).toBeTruthy();
        fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Annuler' }));
        await waitFor(() => expect(screen.queryByText('Remplacer le nom latin ?')).toBeNull());
        expect(field('latinName').value).toBe('Cyanistes caeruleus');
        expect(field('count').value).toBe('1');
        expect(screen.queryByTestId('ai-note-applied')).toBeNull();
    });

    it('remplace le nom latin tapé à la main après confirmation', async () => {
        mocks.callAiText.mockResolvedValue({ result: serverResult({ speciesName: 'mésange charbonnière', scientificName: 'Parus major' }), remaining: 11 });
        mocks.suggestSpeciesAutocomplete.mockResolvedValue([{ displayName: 'Mésange charbonnière', latinName: 'Parus major', source: 'inat', iconicTaxonName: 'Aves' }]);
        renderForm();
        fireEvent.change(field('latinName'), { target: { value: 'Cyanistes caeruleus' } });
        openAndType();
        fireEvent.click(analyzeButton());
        const panel = await screen.findByTestId('ai-note-panel');
        fireEvent.click(within(panel).getByRole('checkbox', { name: /Espèce/ }));
        fireEvent.click(within(panel).getByRole('button', { name: 'Appliquer la sélection' }));
        fireEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Confirmer' }));
        await screen.findByTestId('ai-note-applied');
        expect(field('speciesName').value).toBe('Mésange charbonnière');
        expect(field('latinName').value).toBe('Parus major');
        expect(mocks.suggestSpeciesAutocomplete).toHaveBeenCalledWith('Parus major', 5, expect.anything());
    });

    it('nom commun seul sur une fiche qui a un nom latin : demande avant de le changer', async () => {
        mocks.callAiText.mockResolvedValue({ result: serverResult({ speciesName: 'pouillot véloce' }), remaining: 11 });
        mocks.suggestSpeciesAutocomplete.mockResolvedValue([{ displayName: 'Pouillot véloce', latinName: 'Phylloscopus collybita', source: 'inat', iconicTaxonName: 'Aves' }]);
        renderForm(makeObservation({ speciesName: 'Mésange charbonnière', latinName: 'Parus major' }));
        openAndType();
        fireEvent.click(analyzeButton());
        const panel = await screen.findByTestId('ai-note-panel');
        fireEvent.click(within(panel).getByRole('checkbox', { name: /Espèce/ }));
        fireEvent.click(within(panel).getByRole('button', { name: 'Appliquer la sélection' }));
        const dialog = await screen.findByRole('dialog');
        expect(dialog.textContent).toMatch(/Parus major/);
        expect(dialog.textContent).toMatch(/Phylloscopus collybita/);
        fireEvent.click(within(dialog).getByRole('button', { name: 'Confirmer' }));
        await screen.findByTestId('ai-note-applied');
        expect(field('speciesName').value).toBe('Pouillot véloce');
        expect(field('latinName').value).toBe('Phylloscopus collybita');
    });

    it('nom introuvable sur une fiche qui a un nom latin : propose de le vider, jamais de le garder en silence', async () => {
        mocks.callAiText.mockResolvedValue({ result: serverResult({ speciesName: 'pouillot véloce' }), remaining: 11 });
        renderForm(makeObservation({ speciesName: 'Mésange charbonnière', latinName: 'Parus major' }));
        openAndType();
        fireEvent.click(analyzeButton());
        const panel = await screen.findByTestId('ai-note-panel');
        fireEvent.click(within(panel).getByRole('checkbox', { name: /Espèce/ }));
        fireEvent.click(within(panel).getByRole('button', { name: 'Appliquer la sélection' }));
        const dialog = await screen.findByRole('dialog');
        expect(dialog.textContent).toMatch(/Le vider/);
        fireEvent.click(within(dialog).getByRole('button', { name: 'Confirmer' }));
        await screen.findByTestId('ai-note-applied');
        expect(field('speciesName').value).toBe('pouillot véloce');
        expect(field('latinName').value).toBe('');
    });

    it('hors ligne au moment d’appliquer : dit que le nom n’a pas pu être vérifié', async () => {
        const { rerender } = renderForm(null);
        openAndType();
        fireEvent.click(analyzeButton());
        const panel = await screen.findByTestId('ai-note-panel');
        rerender(<ObservationForm onSave={vi.fn(async () => { })} onCancel={vi.fn()} initialData={null} onToast={vi.fn()} isOffline />);
        fireEvent.click(within(panel).getByRole('button', { name: 'Appliquer la sélection' }));
        const applied = await screen.findByTestId('ai-note-applied');
        expect(applied.textContent).toMatch(/n'a pas pu être vérifié/);
        expect(applied.textContent).not.toMatch(/introuvable/);
        expect(mocks.suggestSpeciesAutocomplete).not.toHaveBeenCalledWith('mésange charbonnière', 5, expect.anything());
    });

    it('une case pré-cochée se décoche si l’on modifie ce champ dans la fiche', async () => {
        renderForm();
        openAndType();
        fireEvent.click(analyzeButton());
        const panel = await screen.findByTestId('ai-note-panel');
        const location = within(panel).getByRole('checkbox', { name: /Lieu-dit/ }) as HTMLInputElement;
        expect(location.checked).toBe(true);
        // Le premier « détails avancés » est celui de la Localisation (lieu-dit).
        fireEvent.click(screen.getAllByRole('button', { name: /Afficher les détails avancés/ })[0]);
        fireEvent.change(field('location'), { target: { value: 'Bois de Vincennes' } });
        expect((within(panel).getByRole('checkbox', { name: /Lieu-dit/ }) as HTMLInputElement).checked).toBe(false);
        fireEvent.click(within(panel).getByRole('button', { name: 'Appliquer la sélection' }));
        await screen.findByTestId('ai-note-applied');
        expect(field('location').value).toBe('Bois de Vincennes');
    });

    it('« Annuler l’application » garde ce que la personne a saisi après', async () => {
        renderForm();
        openAndType();
        fireEvent.click(analyzeButton());
        const panel = await screen.findByTestId('ai-note-panel');
        fireEvent.click(within(panel).getByRole('button', { name: 'Appliquer la sélection' }));
        await screen.findByTestId('ai-note-applied');
        expect(field('count').value).toBe('3');
        fireEvent.change(field('comment'), { target: { value: 'Écrit après.' } });
        fireEvent.change(field('time'), { target: { value: '09:45' } });
        fireEvent.click(screen.getByRole('button', { name: "Annuler l'application" }));
        expect(field('count').value).toBe('1');
        expect(field('speciesName').value).toBe('');
        expect((field('comment') as unknown as HTMLTextAreaElement).value).toBe('Écrit après.');
        expect(field('time').value).toBe('09:45');
    });

    it('« Annuler l’application » retire aussi ce que l’enrichissement de l’espèce a ajouté', async () => {
        mocks.fetchSpeciesInfo.mockResolvedValue({ latinName: 'Circus aeruginosus', redListStatus: 'NT', taxonomicGroup: 'Oiseaux', description: 'Rapace.' });
        mocks.callAiText.mockResolvedValue({ result: serverResult({ speciesName: 'busard des roseaux' }), remaining: 11 });
        renderForm(null);
        openAndType();
        fireEvent.click(analyzeButton());
        const panel = await screen.findByTestId('ai-note-panel');
        fireEvent.click(within(panel).getByRole('button', { name: 'Appliquer la sélection' }));
        await screen.findByTestId('ai-note-applied');
        await waitFor(() => expect((field('status') as unknown as HTMLSelectElement).value).toBe('NT'), { timeout: 3000 });
        fireEvent.click(screen.getByRole('button', { name: "Annuler l'application" }));
        expect(field('speciesName').value).toBe('');
        expect(field('latinName').value).toBe('');
        expect((field('status') as unknown as HTMLSelectElement).value).toBe('NE');
    });

    it('« Annuler » pendant la vérification du nom : rien n’est appliqué, même si la réponse arrive', async () => {
        const lookup = deferred<unknown[]>();
        mocks.suggestSpeciesAutocomplete.mockImplementation((query: string) => (query === 'mésange charbonnière' ? lookup.promise : Promise.resolve([])));
        renderForm();
        openAndType();
        fireEvent.click(analyzeButton());
        const panel = await screen.findByTestId('ai-note-panel');
        fireEvent.click(within(panel).getByRole('button', { name: 'Appliquer la sélection' }));
        fireEvent.click(await within(panel).findByRole('button', { name: 'Annuler' }));
        await act(async () => {
            lookup.resolve([{ displayName: 'Mésange charbonnière', latinName: 'Parus major', source: 'inat', iconicTaxonName: 'Aves' }]);
        });
        expect(screen.queryByTestId('ai-note-applied')).toBeNull();
        expect(field('speciesName').value).toBe('');
        expect(field('count').value).toBe('1');
    });

    it('ne propose jamais un champ retiré par la fonction', async () => {
        mocks.callAiText.mockResolvedValue({ result: serverResult({ speciesName: 'pic vert', location: null, dropped: ['location', 'count'] }), remaining: 11 });
        renderForm();
        openAndType();
        fireEvent.click(analyzeButton());
        const panel = await screen.findByTestId('ai-note-panel');
        expect(within(panel).queryByRole('checkbox', { name: /Lieu-dit/ })).toBeNull();
        expect(within(panel).getByTestId('ai-note-dropped').textContent).toMatch(/nombre d'individus, lieu-dit/);
    });

    it('liste les autres espèces citées pour information', async () => {
        mocks.callAiText.mockResolvedValue({ result: serverResult({ speciesName: 'pic vert', otherSpecies: ['héron cendré', 'grive musicienne'] }), remaining: 11 });
        renderForm();
        openAndType();
        fireEvent.click(analyzeButton());
        const others = await screen.findByTestId('ai-note-other-species');
        expect(others.textContent).toMatch(/héron cendré/);
        expect(others.textContent).toMatch(/rien n'est créé/);
    });

    it('nouvelle fiche : date et heure du jour comptent comme valeurs par défaut', async () => {
        renderForm(null);
        openAndType();
        fireEvent.click(analyzeButton());
        const panel = await screen.findByTestId('ai-note-panel');
        expect((within(panel).getByRole('checkbox', { name: /Date/ }) as HTMLInputElement).checked).toBe(true);
        expect((within(panel).getByRole('checkbox', { name: /Heure/ }) as HTMLInputElement).checked).toBe(true);
    });
});
