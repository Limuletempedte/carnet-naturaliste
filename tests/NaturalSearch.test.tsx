import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { StrictMode, useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setSessionIdentity } from '../services/sessionScope';

const mocks = vi.hoisted(() => ({
    callAiText: vi.fn(),
    getAiOverview: vi.fn(),
    giveConsent: vi.fn(),
    resolveNear: vi.fn(),
}));

vi.mock('../services/aiAssistService', async (importOriginal) => {
    const actual = await importOriginal<typeof import('../services/aiAssistService')>();
    return { ...actual, callAiText: mocks.callAiText, getAiOverview: mocks.getAiOverview, giveConsent: mocks.giveConsent };
});
vi.mock('../services/naturalSearchPlace', () => ({ resolveNear: mocks.resolveNear }));

import NaturalSearch, { resetNaturalSearchAccessMemo } from '../components/NaturalSearch';
import { useFilterControls } from '../hooks/useFilterControls';
import { AiAssistError, type AiOverview } from '../services/aiAssistService';
import { NATURAL_SEARCH_CACHE_PREFIX } from '../services/naturalSearchCache';

const approved = (consents: AiOverview['consents'] = { search: '2026-11-v1' }): AiOverview => ({
    access: { kind: 'approved', remaining: 12, monthlyQuota: 20 },
    consents,
    usedByFeature: {},
});

/** Réponse de la fonction : tous les champs, absents à null. */
const serverResult = (overrides: Record<string, unknown> = {}) => ({
    period: null, years: [], groups: [], categories: [], genera: [], statuses: [], habitats: [],
    department: null, commune: null, near: null, text: null, dropped: [],
    ...overrides,
});

let controls: ReturnType<typeof useFilterControls>;
let setShown: (shown: boolean) => void = () => undefined;

/**
 * Le hook vit dans le parent (comme dans App) ; le champ peut être démonté et
 * remonté (onglet Carte, rotation de l'écran) sans perdre l'état du parent.
 */
const Harness: React.FC<{ isOffline?: boolean; variant?: 'mobile' | 'desktop' }> = ({ isOffline = false, variant = 'desktop' }) => {
    controls = useFilterControls({ onToast: vi.fn() });
    const [shown, setShownState] = useState(true);
    setShown = setShownState;
    if (!shown) return null;
    return (
        <NaturalSearch
            variant={variant}
            inputId="search-input"
            searchTerm={controls.searchTerm}
            onSearchChange={controls.setSearchTerm}
            draft={controls.naturalDraft}
            onDraftChange={controls.setNaturalDraft}
            aiProposal={controls.lastAiProposal}
            onAiProposalChange={controls.setLastAiProposal}
            naturalSearch={controls.naturalSearch}
            onApply={controls.applyNaturalSearch}
            onRemoveCriterion={controls.removeNaturalCriterion}
            onUpdateNear={controls.updateNaturalNear}
            onUndo={controls.undoNaturalSearch}
            onResetAll={controls.resetAllFilters}
            onClearNatural={controls.clearNaturalSearch}
            onReplaceWithNameSearch={controls.replaceWithNameSearch}
            hasActiveFilters={controls.hasActiveFilters}
            excludedNoLatinName={0}
            isOffline={isOffline}
            onOpenAiAccess={vi.fn()}
        />
    );
};

const input = () => (screen.queryByLabelText('Recherche') ?? screen.getByLabelText(/Rechercher une observation/)) as HTMLInputElement;
const type = (value: string) => fireEvent.change(input(), { target: { value } });
const pressEnter = () => fireEvent.keyDown(input(), { key: 'Enter' });
const aiButton = () => screen.queryByRole('button', { name: "Interpréter avec l'IA" });

const setup = () => {
    localStorage.clear();
    setSessionIdentity('user-1');
    resetNaturalSearchAccessMemo();
    mocks.callAiText.mockReset();
    mocks.getAiOverview.mockReset().mockResolvedValue(approved());
    mocks.giveConsent.mockReset().mockResolvedValue(undefined);
    mocks.resolveNear.mockReset().mockResolvedValue({ status: 'ok', lat: 44.8, lon: -0.6 });
    // Horloge figée : jamais l'heure réelle.
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 10, 21, 12, 0, 0));
};
const teardown = () => {
    vi.useRealTimers();
    vi.restoreAllMocks();
};

describe('NaturalSearch : la recherche par nom d’abord (non-régression)', () => {
    beforeEach(setup);
    afterEach(teardown);

    it.each([
        'buse', 'mésange charbonnière', 'buse variable', 'Fougères', 'Mars', 'Petit Mars changeant', 'Cèpe d’été',
        'commune de Fougères', 'Étang des Canards', 'Île aux Oiseaux', 'Saint-Mars-du-Désert', 'Hygrophore de mars',
    ])('« %s » : recherche par nom à chaque frappe, et Entrée ne change rien', (value) => {
        render(<Harness />);
        type(value);
        expect(controls.searchTerm).toBe(value);
        pressEnter();
        expect(controls.searchTerm).toBe(value);
        expect(controls.naturalSearch).toBeNull();
        expect(controls.filters.aiFilter).toBeNull();
        expect(controls.startDateFilter).toBe('');
        expect(controls.yearFilter).toBe('all');
    });

    it('les noms propres et noms d’espèces ne deviennent ni mois, ni saison, ni catégorie', () => {
        render(<Harness />);
        for (const value of ['Mars', 'Petit Mars changeant', 'Cèpe d’été', 'commune de Fougères', 'Étang des Canards', 'Île aux Oiseaux', 'Saint-Mars-du-Désert', 'Hygrophore de mars', 'buse variable']) {
            type(value);
            expect(screen.queryByTestId('natural-search-proposal'), value).toBeNull();
            // Un simple nom n'invite pas à payer : pas de bouton IA.
            expect(aiButton(), value).toBeNull();
        }
    });

    it('« Fougères » : la lecture « filtre » n’est proposée qu’en plus, sur un clic explicite', async () => {
        render(<Harness />);
        type('Fougères');
        const proposal = screen.getByTestId('natural-search-proposal');
        expect(within(proposal).getByText('Lire aussi comme un filtre :')).toBeTruthy();
        pressEnter();
        expect(controls.naturalSearch).toBeNull();
        fireEvent.click(within(proposal).getByRole('button', { name: 'Appliquer ce filtre' }));
        await waitFor(() => expect(controls.naturalSearch).not.toBeNull());
        expect(controls.filters.aiFilter?.categories).toEqual(['fougeres']);
        expect(controls.searchTerm).toBe('');
    });

    it('« hirondelles rustiques en avril » : le mois et le nom d’espèce entier, sans le couper', async () => {
        render(<Harness />);
        type('hirondelles rustiques en avril');
        expect(controls.searchTerm).toBe('hirondelles rustiques en avril');
        pressEnter();
        await waitFor(() => expect(controls.naturalSearch).not.toBeNull());
        expect(controls.searchTerm).toBe('hirondelles rustiques');
        expect(controls.filters.aiFilter?.months).toEqual([4]);
        expect(controls.filters.aiFilter?.categories ?? []).toEqual([]);
    });

    it('une phrase comprise : rien n’est appliqué avant Entrée, la liste filtre par nom comme avant', async () => {
        render(<Harness />);
        type('les rapaces le mois dernier');
        const proposal = screen.getByTestId('natural-search-proposal');
        expect(within(proposal).getByText('Rapaces diurnes')).toBeTruthy();
        expect(within(proposal).getByText('le mois dernier (octobre 2026)')).toBeTruthy();
        expect(controls.startDateFilter).toBe('');
        expect(controls.filters.aiFilter).toBeNull();
        pressEnter();
        await waitFor(() => expect(controls.naturalSearch).not.toBeNull());
        expect(controls.startDateFilter).toBe('2026-10-01');
        expect(controls.filters.aiFilter?.categories).toEqual(['rapaces_diurnes', 'rapaces_nocturnes']);
        expect(controls.searchTerm).toBe('');
    });

    it('modifier une phrase appliquée ne touche à rien avant « Appliquer » ; la croix efface tout', async () => {
        render(<Harness />);
        type('hérons cendrés en juin');
        pressEnter();
        await waitFor(() => expect(controls.naturalSearch).not.toBeNull());
        expect(controls.searchTerm).toBe('hérons cendrés');
        type('hérons cendrés en jui');
        expect(controls.searchTerm).toBe('hérons cendrés');
        expect(controls.filters.aiFilter?.months).toEqual([6]);
        type('buse');
        // Taper ne change rien ; un geste explicite (lien, ou Entrée) passe à une recherche par nom.
        expect(controls.naturalSearch?.phrase).toBe('hérons cendrés en juin');
        fireEvent.click(screen.getByRole('button', { name: 'Chercher « buse » par nom à la place' }));
        expect(controls.naturalSearch).toBeNull();
        expect(controls.searchTerm).toBe('buse');

        type('hérons cendrés en juin');
        pressEnter();
        await waitFor(() => expect(controls.naturalSearch).not.toBeNull());
        fireEvent.click(screen.getByRole('button', { name: 'Effacer la recherche' }));
        expect(controls.naturalSearch).toBeNull();
        expect(controls.filters.aiFilter).toBeNull();
        expect(controls.searchTerm).toBe('');
        expect(input().value).toBe('');
    });

    it('des passages non compris séparés ne sont jamais collés : rien d’appliqué, IA proposée', async () => {
        render(<Harness />);
        type('chouette effraie en mai à Pessac');
        expect(screen.queryByTestId('natural-search-proposal')).toBeNull();
        expect(screen.getByTestId('natural-search-fragments').textContent).toMatch(/« chouette effraie », « Pessac »/);
        pressEnter();
        expect(controls.naturalSearch).toBeNull();
        expect(controls.searchTerm).toBe('chouette effraie en mai à Pessac');
        expect(aiButton()).toBeTruthy();
        expect(mocks.callAiText).not.toHaveBeenCalled();
    });

    it('« champignons d’automne » : groupe et saison, appliqués sur Entrée', async () => {
        render(<Harness />);
        type('champignons d’automne');
        pressEnter();
        await waitFor(() => expect(controls.naturalSearch).not.toBeNull());
        expect(controls.taxonomicGroupFilter).toBe('Champignons');
        expect(controls.filters.aiFilter?.months).toEqual([9, 10, 11]);
    });

    it('« oiseaux de Pessac » : rien d’appliqué, mais le bouton IA est proposé ; « Pic épeiche » : aucun bouton', () => {
        render(<Harness />);
        type('oiseaux de Pessac');
        expect(screen.queryByTestId('natural-search-proposal')).toBeNull();
        expect(aiButton()).toBeTruthy();
        pressEnter();
        expect(controls.naturalSearch).toBeNull();
        expect(controls.searchTerm).toBe('oiseaux de Pessac');
        type('Pic épeiche');
        expect(aiButton()).toBeNull();
    });

    it('« oiseaux à Fougères » : Oiseaux et le lieu cherché par nom, jamais la catégorie Fougères', async () => {
        render(<Harness />);
        type('oiseaux à Fougères');
        pressEnter();
        await waitFor(() => expect(controls.naturalSearch).not.toBeNull());
        expect(controls.taxonomicGroupFilter).toBe('Oiseaux');
        expect(controls.searchTerm).toBe('Fougères');
        expect(controls.filters.aiFilter).toBeNull();
    });

    it('Entrée sur un nom tapé par-dessus une recherche appliquée : cherche ce nom à la place (jamais l’IA)', async () => {
        render(<Harness />);
        type('les canards en 2024');
        pressEnter();
        await waitFor(() => expect(controls.naturalSearch).not.toBeNull());
        type('buse');
        expect(screen.getByRole('button', { name: 'Chercher « buse » par nom à la place' })).toBeTruthy();
        pressEnter();
        expect(controls.naturalSearch).toBeNull();
        expect(controls.searchTerm).toBe('buse');
        expect(controls.yearFilter).toBe('all');
        expect(mocks.callAiText).not.toHaveBeenCalled();
    });

    it('un mot hérité d’Object (« constructor ») ne fait pas planter la liste', () => {
        render(<Harness />);
        for (const value of ['les oiseaux constructor', 'en constructor', 'toString __proto__ hiver', 'cet constructor']) {
            type(value);
            expect(input().value).toBe(value);
        }
    });
});

describe('NaturalSearch : étiquettes, lieu, réinitialisation', () => {
    beforeEach(setup);
    afterEach(teardown);

    it('les étiquettes se retirent une à une, avant comme après l’application ; « Annuler la recherche » rend les filtres d’avant', async () => {
        render(<Harness />);
        act(() => { controls.setYearFilter('2019'); });
        type('les canards en 2024 en montagne');
        fireEvent.click(screen.getByRole('button', { name: 'Ne pas garder : Montagne' }));
        expect(screen.queryByRole('button', { name: 'Ne pas garder : Montagne' })).toBeNull();
        fireEvent.click(screen.getByRole('button', { name: 'Appliquer' }));
        await waitFor(() => expect(controls.naturalSearch).not.toBeNull());
        expect(controls.filters.aiFilter?.habitats ?? null).toBeNull();
        expect(controls.yearFilter).toBe('2024');

        fireEvent.click(screen.getByRole('button', { name: 'Retirer le critère : 2024' }));
        expect(controls.yearFilter).toBe('all');
        expect(controls.filters.aiFilter?.categories).toEqual(['canards']);
        await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Retirer le critère : Canards' })));

        fireEvent.click(screen.getByRole('button', { name: 'Annuler la recherche' }));
        expect(controls.yearFilter).toBe('2019');
        expect(controls.naturalSearch).toBeNull();
        await waitFor(() => expect(document.activeElement).toBe(input()));
    });

    it('une recherche par nom active mais absente du champ est montrée et se retire', () => {
        render(<Harness />);
        type('les canards en 2024');
        pressEnter();
        act(() => { controls.setSearchTerm('buse'); });
        const hidden = screen.getByTestId('natural-search-hidden-term');
        expect(hidden.textContent).toMatch(/Recherche par nom active : « buse »/);
        fireEvent.click(within(hidden).getByRole('button', { name: 'Retirer' }));
        expect(controls.searchTerm).toBe('');
    });

    it('pendant la localisation, une étiquette ne peut plus être écartée ; « Annuler » rend le focus à « Appliquer »', async () => {
        let resolveNear: (value: unknown) => void = () => undefined;
        mocks.resolveNear.mockReturnValueOnce(new Promise(resolve => { resolveNear = resolve; }));
        render(<Harness />);
        type('les oiseaux près de chez moi');
        fireEvent.click(screen.getByRole('button', { name: 'Appliquer' }));
        expect((screen.getByRole('button', { name: 'Ne pas garder : Oiseaux' }) as HTMLButtonElement).disabled).toBe(true);
        fireEvent.click(screen.getByRole('button', { name: 'Annuler' }));
        await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Appliquer' })));
        await act(async () => { resolveNear({ status: 'ok', lat: 44.8, lon: -0.6 }); });
        expect(controls.naturalSearch).toBeNull();
    });

    it('la dernière étiquette retirée rend le focus au champ', async () => {
        render(<Harness />);
        type('les oiseaux près de chez moi');
        pressEnter();
        await waitFor(() => expect(controls.naturalSearch).not.toBeNull());
        fireEvent.click(screen.getByRole('button', { name: /Retirer le critère : autour de ma position/ }));
        fireEvent.click(screen.getByRole('button', { name: 'Retirer le critère : Oiseaux' }));
        await waitFor(() => expect(controls.naturalSearch).toBeNull());
        await waitFor(() => expect(document.activeElement).toBe(input()));
    });

    it('sur téléphone, après l’application, le clavier se ferme : le focus va aux étiquettes', async () => {
        render(<Harness variant="mobile" />);
        input().focus();
        type('les canards en 2024');
        pressEnter();
        await waitFor(() => expect(controls.naturalSearch).not.toBeNull());
        await waitFor(() => expect(document.activeElement?.textContent).toMatch(/J'ai compris/));
    });

    it('« Réinitialiser les filtres » efface les filtres existants et l’AiFilter', async () => {
        render(<Harness />);
        type('les canards en 2024');
        pressEnter();
        await waitFor(() => expect(controls.naturalSearch).not.toBeNull());
        fireEvent.click(screen.getByRole('button', { name: 'Réinitialiser les filtres' }));
        expect(controls.naturalSearch).toBeNull();
        expect(controls.filters.aiFilter).toBeNull();
        expect(controls.yearFilter).toBe('all');
        expect(input().value).toBe('');
    });

    it('« près de chez moi » : géolocalisation refusée → étiquette d’erreur, jamais abandonnée, « Réessayer » ; focus gardé', async () => {
        mocks.resolveNear.mockResolvedValueOnce({ status: 'denied' });
        render(<Harness />);
        type('les oiseaux près de chez moi');
        expect(screen.getByText('autour de ma position actuelle (10 km)')).toBeTruthy();
        pressEnter();
        await waitFor(() => expect(controls.naturalSearch).not.toBeNull());
        const chip = screen.getByTestId('search-chip-near');
        expect(chip.getAttribute('data-tone')).toBe('error');
        expect(chip.textContent).toMatch(/position refusée, critère non appliqué/);
        expect(controls.filters.aiFilter).toBeNull();
        expect(controls.taxonomicGroupFilter).toBe('Oiseaux');
        expect(mocks.callAiText).not.toHaveBeenCalled();
        expect(screen.getByTestId('natural-search-status').textContent).toMatch(/sauf : autour de ma position actuelle \(10 km\) : position refusée/);

        fireEvent.click(within(chip).getByRole('button', { name: 'Réessayer' }));
        await waitFor(() => expect(controls.filters.aiFilter?.near).toEqual({ lat: 44.8, lon: -0.6, radiusKm: 10 }));
        // Jamais dans les filtres avancés.
        expect(controls.advancedFilterState.geoMode).toBe('none');
        expect(screen.getByTestId('search-chip-near').getAttribute('data-tone')).toBe('ok');
        await waitFor(() => expect(document.activeElement?.textContent).toMatch(/J'ai compris/));
    });
});

describe('NaturalSearch : interprétation par l’assistant', () => {
    beforeEach(setup);
    afterEach(teardown);

    const PHRASE = 'hérons cendrés près de Castelbrume';

    it('Entrée n’appelle jamais l’assistant, même quand le bouton IA est proposé', async () => {
        render(<Harness />);
        type('les hérons en mai à Castelbrume');
        expect(aiButton()).toBeTruthy();
        pressEnter();
        await waitFor(() => expect(controls.naturalSearch?.source).toBe('local'));
        expect(mocks.callAiText).not.toHaveBeenCalled();
        type(PHRASE);
        expect(aiButton()).toBeTruthy();
        pressEnter();
        pressEnter();
        expect(mocks.callAiText).not.toHaveBeenCalled();
    });

    it('le verrou : deux clics avant tout rendu ne font qu’un envoi', async () => {
        let resolveCall: (value: unknown) => void = () => undefined;
        mocks.callAiText.mockReturnValue(new Promise(resolve => { resolveCall = resolve; }));
        render(<Harness />);
        type(PHRASE);
        const button = aiButton() as HTMLButtonElement;
        act(() => { button.click(); button.click(); button.click(); });
        await waitFor(() => expect(mocks.callAiText).toHaveBeenCalledTimes(1));
        expect(mocks.callAiText.mock.calls[0][0]).toBe('search');
        expect(mocks.callAiText.mock.calls[0][1]).toEqual({ text: PHRASE });

        await act(async () => {
            resolveCall({ result: serverResult({ text: 'hérons cendrés', near: { kind: 'place', placeName: 'Castelbrume', radiusKm: 10 } }), remaining: 11 });
        });
        const proposal = await screen.findByTestId('natural-search-proposal');
        expect(within(proposal).getByText('autour de Castelbrume (10 km)')).toBeTruthy();
        expect(controls.naturalSearch).toBeNull();
        expect(localStorage.getItem(`${NATURAL_SEARCH_CACHE_PREFIX}:user-1`)).toContain('Castelbrume');

        // Lieu nommé introuvable : dit, jamais abandonné en silence.
        mocks.resolveNear.mockResolvedValueOnce({ status: 'not_found' });
        fireEvent.click(within(proposal).getByRole('button', { name: 'Appliquer' }));
        await waitFor(() => expect(controls.naturalSearch?.source).toBe('ai'));
        expect(screen.getByTestId('search-chip-near').textContent).toMatch(/lieu introuvable/);
        // Le texte cherché reste tel quel.
        expect(controls.searchTerm).toBe('hérons cendrés');
    });

    it('une phrase déjà interprétée se rejoue sans appel, même hors ligne', async () => {
        mocks.callAiText.mockResolvedValue({ result: serverResult({ categories: ['ardeides'], commune: 'Castelbrume' }), remaining: 11 });
        const { unmount } = render(<Harness />);
        type('les hérons à Castelbrume');
        fireEvent.click(aiButton() as HTMLButtonElement);
        // La proposition locale est déjà là : on attend celle de l'assistant (gardée dans le cache).
        await screen.findByText(/interprété par l'assistant IA/);
        unmount();

        render(<Harness isOffline />);
        type('Les hérons à Castelbrume');
        const proposal = screen.getByTestId('natural-search-proposal');
        expect(within(proposal).getByText(/sans nouvelle utilisation/)).toBeTruthy();
        expect(aiButton()).toBeNull();
        pressEnter();
        await waitFor(() => expect(controls.naturalSearch?.source).toBe('cache'));
        expect(controls.filters.aiFilter?.commune).toBe('Castelbrume');
        expect(mocks.callAiText).toHaveBeenCalledTimes(1);
    });

    it('une phrase où l’assistant n’a rien trouvé n’est pas repayée', async () => {
        mocks.callAiText.mockResolvedValue({ result: serverResult(), remaining: 11 });
        const { unmount } = render(<Harness />);
        type('quel temps fera-t-il demain');
        fireEvent.click(aiButton() as HTMLButtonElement);
        expect((await screen.findByTestId('natural-search-empty')).textContent).toMatch(/aucun critère/);
        expect(aiButton()).toBeNull();
        unmount();
        render(<Harness />);
        type('Quel temps fera-t-il demain ?');
        expect(screen.getByTestId('natural-search-empty').textContent).toMatch(/déjà interprétée/);
        expect(aiButton()).toBeNull();
        expect(mocks.callAiText).toHaveBeenCalledTimes(1);
    });

    it('remontage du champ pendant l’attente (carte, rotation) : la phrase n’est jamais renvoyée, la réponse revient', async () => {
        let resolveCall: (value: unknown) => void = () => undefined;
        mocks.callAiText.mockReturnValue(new Promise(resolve => { resolveCall = resolve; }));
        render(<Harness />);
        type(PHRASE);
        fireEvent.click(aiButton() as HTMLButtonElement);
        await waitFor(() => expect(mocks.callAiText).toHaveBeenCalledTimes(1));
        const signal = mocks.callAiText.mock.calls[0][2].signal as AbortSignal;
        act(() => { setShown(false); });
        expect(signal.aborted).toBe(false);
        act(() => { setShown(true); });
        // La phrase est gardée par le parent ; l'attente est reprise, sans bouton payant.
        expect(input().value).toBe(PHRASE);
        expect(screen.getByRole('button', { name: /Interprétation en cours/ })).toBeTruthy();
        expect(screen.queryByRole('button', { name: 'Annuler' })).toBeNull();
        await act(async () => { resolveCall({ result: serverResult({ text: 'hérons cendrés' }), remaining: 11 }); });
        expect(await screen.findByTestId('natural-search-proposal')).toBeTruthy();
        expect(mocks.callAiText).toHaveBeenCalledTimes(1);
    });

    it('réponse tardive après « Annuler » : rien d’affiché, rien de gardé', async () => {
        let resolveCall: (value: unknown) => void = () => undefined;
        mocks.callAiText.mockReturnValue(new Promise(resolve => { resolveCall = resolve; }));
        render(<Harness />);
        type(PHRASE);
        fireEvent.click(aiButton() as HTMLButtonElement);
        await waitFor(() => expect(mocks.callAiText).toHaveBeenCalledTimes(1));
        fireEvent.click(screen.getByRole('button', { name: 'Annuler' }));
        expect((await screen.findByRole('alert')).textContent).toMatch(/Interprétation arrêtée : rien n'a été appliqué.*peut compter/);
        await act(async () => { resolveCall({ result: serverResult({ text: 'hérons cendrés' }), remaining: 11 }); });
        expect(screen.queryByTestId('natural-search-proposal')).toBeNull();
        expect(localStorage.getItem(`${NATURAL_SEARCH_CACHE_PREFIX}:user-1`)).toBeNull();
    });

    it('« Annuler » pendant l’interprétation : compteur relu', async () => {
        mocks.callAiText.mockImplementation((_feature: string, _payload: unknown, options: { signal: AbortSignal }) => new Promise((_resolve, reject) => {
            options.signal.addEventListener('abort', () => reject(new AiAssistError('cancelled', { feature: 'search' })));
        }));
        render(<Harness />);
        type(PHRASE);
        fireEvent.click(aiButton() as HTMLButtonElement);
        await waitFor(() => expect(mocks.callAiText).toHaveBeenCalledTimes(1));
        const overviewCalls = mocks.getAiOverview.mock.calls.length;
        fireEvent.click(screen.getByRole('button', { name: 'Annuler' }));
        await waitFor(() => expect(mocks.getAiOverview.mock.calls.length).toBeGreaterThan(overviewCalls));
        expect(controls.naturalSearch).toBeNull();
    });

    it('sans accès approuvé : pas de bouton payant, un lien discret vers « Assistant IA »', async () => {
        mocks.getAiOverview.mockResolvedValue({ access: { kind: 'pending', requestedAt: null }, consents: {}, usedByFeature: {} });
        render(<Harness />);
        type(PHRASE);
        expect(await screen.findByTestId('natural-search-ai-access')).toBeTruthy();
        expect(aiButton()).toBeNull();
        // Un seul appel pour savoir, pas un par frappe.
        type(`${PHRASE} ce matin`);
        expect(mocks.getAiOverview).toHaveBeenCalledTimes(1);
    });

    it('l’état de l’assistant n’est lu qu’au moment où le bouton doit s’afficher', () => {
        render(<Harness />);
        type('buse');
        type('les canards');
        expect(mocks.getAiOverview).not.toHaveBeenCalled();
    });

    it('hors ligne : bouton désactivé avec la raison, aucun appel', () => {
        render(<Harness isOffline />);
        type(PHRASE);
        const button = aiButton() as HTMLButtonElement;
        expect(button.disabled).toBe(true);
        expect(screen.getByText('Disponible en ligne uniquement.')).toBeTruthy();
        fireEvent.click(button);
        expect(mocks.callAiText).not.toHaveBeenCalled();
    });

    it('accord au premier usage, à l’endroit même ; après « Accepter », le bouton occupé garde le focus', async () => {
        mocks.getAiOverview.mockResolvedValue(approved({}));
        let resolveCall: (value: unknown) => void = () => undefined;
        mocks.callAiText.mockReturnValue(new Promise(resolve => { resolveCall = resolve; }));
        render(<Harness />);
        type(PHRASE);
        fireEvent.click(aiButton() as HTMLButtonElement);
        const card = await screen.findByTestId('ai-consent-card-search');
        expect(within(card).getByTestId('ai-search-consent-text').textContent).toMatch(/Anthropic Ireland Ltd/);
        expect(mocks.callAiText).not.toHaveBeenCalled();
        expect(input().readOnly).toBe(true);
        mocks.getAiOverview.mockResolvedValue(approved());
        fireEvent.click(within(card).getByRole('checkbox'));
        fireEvent.click(within(card).getByRole('button', { name: 'Accepter et interpréter' }));
        await waitFor(() => expect(mocks.callAiText).toHaveBeenCalledTimes(1));
        expect(mocks.giveConsent).toHaveBeenCalledWith('search', expect.anything());
        await waitFor(() => expect(document.activeElement?.getAttribute('aria-label')).toMatch(/Vérification|Interprétation en cours/));
        // « Annuler » reste atteignable au clavier pendant l'attente.
        expect(screen.getByRole('button', { name: 'Annuler' })).toBeTruthy();
        await act(async () => { resolveCall({ result: serverResult({ text: 'hérons cendrés' }), remaining: 11 }); });
    });

    it('accord enregistré mais relecture muette : « rien n’a été envoyé », jamais « peut compter »', async () => {
        mocks.getAiOverview.mockResolvedValue(approved({}));
        render(<Harness />);
        type(PHRASE);
        fireEvent.click(aiButton() as HTMLButtonElement);
        const card = await screen.findByTestId('ai-consent-card-search');
        mocks.getAiOverview.mockRejectedValueOnce(new AiAssistError('timeout', { feature: 'search' }));
        fireEvent.click(within(card).getByRole('checkbox'));
        fireEvent.click(within(card).getByRole('button', { name: 'Accepter et interpréter' }));
        const alert = await screen.findByRole('alert');
        expect(alert.textContent).toMatch(/Rien n'a été envoyé/);
        expect(alert.textContent).not.toMatch(/peut compter/);
        expect(mocks.callAiText).not.toHaveBeenCalled();
    });

    it('« Annuler » pendant l’enregistrement de l’accord : rien n’est envoyé', async () => {
        mocks.getAiOverview.mockResolvedValue(approved({}));
        let resolveConsent: () => void = () => undefined;
        mocks.giveConsent.mockReturnValue(new Promise<void>(resolve => { resolveConsent = resolve; }));
        render(<Harness />);
        type(PHRASE);
        fireEvent.click(aiButton() as HTMLButtonElement);
        const card = await screen.findByTestId('ai-consent-card-search');
        fireEvent.click(within(card).getByRole('checkbox'));
        fireEvent.click(within(card).getByRole('button', { name: 'Accepter et interpréter' }));
        fireEvent.click(within(card).getByRole('button', { name: 'Annuler' }));
        await act(async () => { resolveConsent(); });
        expect(mocks.callAiText).not.toHaveBeenCalled();
    });

    it('pendant l’accord, la recherche appliquée ne peut pas changer, et « Accepter » envoie la phrase de la carte', async () => {
        mocks.getAiOverview.mockResolvedValue(approved({}));
        mocks.callAiText.mockResolvedValue({ result: serverResult({ text: 'hérons cendrés' }), remaining: 11 });
        render(<Harness />);
        type('les oiseaux en mai');
        pressEnter();
        await waitFor(() => expect(controls.naturalSearch).not.toBeNull());
        type(PHRASE);
        fireEvent.click(aiButton() as HTMLButtonElement);
        const card = await screen.findByTestId('ai-consent-card-search');
        const undo = screen.getByRole('button', { name: 'Annuler la recherche' }) as HTMLButtonElement;
        const reset = screen.getByRole('button', { name: 'Réinitialiser les filtres' }) as HTMLButtonElement;
        expect(undo.disabled).toBe(true);
        expect(reset.disabled).toBe(true);
        expect((screen.getByRole('button', { name: 'Retirer le critère : Oiseaux' }) as HTMLButtonElement).disabled).toBe(true);
        fireEvent.click(undo);
        fireEvent.click(reset);
        expect(input().value).toBe(PHRASE);
        mocks.getAiOverview.mockResolvedValue(approved());
        fireEvent.click(within(card).getByRole('checkbox'));
        fireEvent.click(within(card).getByRole('button', { name: 'Accepter et interpréter' }));
        await waitFor(() => expect(mocks.callAiText).toHaveBeenCalledTimes(1));
        expect(mocks.callAiText.mock.calls[0][1]).toEqual({ text: PHRASE });
        expect(await screen.findByTestId('natural-search-proposal')).toBeTruthy();
    });

    it.each([
        ['feature_disabled', /momentanément indisponible/],
        ['quota_exceeded', /toutes vos utilisations IA de ce mois/],
        ['invalid_output', /inexploitable : rien n'a été appliqué/],
        ['model_refused', /n'a pas pu interpréter cette phrase/],
    ] as const)('message propre à la recherche pour %s', async (code, message) => {
        mocks.callAiText.mockRejectedValue(new AiAssistError(code, { feature: 'search' }));
        render(<Harness />);
        type(PHRASE);
        fireEvent.click(aiButton() as HTMLButtonElement);
        expect((await screen.findByRole('alert')).textContent).toMatch(message);
    });

    it('quota épuisé : le compteur affiché passe à 0', async () => {
        mocks.callAiText.mockRejectedValue(new AiAssistError('quota_exceeded', { feature: 'search' }));
        render(<Harness />);
        type(PHRASE);
        fireEvent.click(aiButton() as HTMLButtonElement);
        await screen.findByRole('alert');
        type(`${PHRASE} hier`);
        expect(await screen.findByText(/0 restante/)).toBeTruthy();
    });

    it('un champ retiré par la validation (dropped) n’est jamais appliqué, et c’est dit', async () => {
        mocks.callAiText.mockResolvedValue({ result: serverResult({ groups: ['Oiseaux'], department: null, dropped: ['department'] }), remaining: 11 });
        render(<Harness />);
        type('les oiseaux de la Gironde maritime');
        fireEvent.click(aiButton() as HTMLButtonElement);
        // La proposition locale (« Oiseaux ») est déjà là : on attend celle de l'assistant.
        expect(await screen.findByText(/mal lu le département/)).toBeTruthy();
        const proposal = screen.getByTestId('natural-search-proposal');
        expect(within(proposal).getByText(/interprété par l'assistant IA/)).toBeTruthy();
        fireEvent.click(within(proposal).getByRole('button', { name: 'Appliquer' }));
        await waitFor(() => expect(controls.naturalSearch).not.toBeNull());
        expect(controls.filters.aiFilter).toBeNull();
        expect(controls.taxonomicGroupFilter).toBe('Oiseaux');
    });

    it('changement de compte pendant l’attente : la suite s’arrête', async () => {
        let resolveCall: (value: unknown) => void = () => undefined;
        mocks.callAiText.mockReturnValue(new Promise(resolve => { resolveCall = resolve; }));
        render(<Harness />);
        type(PHRASE);
        fireEvent.click(aiButton() as HTMLButtonElement);
        await waitFor(() => expect(mocks.callAiText).toHaveBeenCalledTimes(1));
        act(() => { setSessionIdentity('user-2'); });
        await act(async () => { resolveCall({ result: serverResult({ text: 'hérons cendrés' }), remaining: 11 }); });
        expect(screen.queryByTestId('natural-search-proposal')).toBeNull();
        expect(input().value).toBe('');
    });
});

describe('NaturalSearch : quatrième passe de la relecture croisée', () => {
    beforeEach(setup);
    afterEach(teardown);

    const PHRASE = 'hérons cendrés près de Castelbrume';

    // B2 : un nom composé reste un nom.
    it.each(['Villeneuve-en-Montagne', 'Saint-Paul-en-Forêt', 'Saint-Médard-en-Jalles', 'Mai-sur-Orne', 'Châlons-en-Champagne'])(
        '« %s » : recherche par nom, ni proposition ni bouton IA', (value) => {
            render(<Harness />);
            type(value);
            expect(controls.searchTerm).toBe(value);
            expect(screen.queryByTestId('natural-search-proposal')).toBeNull();
            expect(aiButton()).toBeNull();
            pressEnter();
            expect(controls.naturalSearch).toBeNull();
        });

    it('« oiseaux à Saint-Paul-en-Forêt » : Oiseaux, et le nom composé cherché tel quel', async () => {
        render(<Harness />);
        type('oiseaux à Saint-Paul-en-Forêt');
        pressEnter();
        await waitFor(() => expect(controls.naturalSearch).not.toBeNull());
        expect(controls.taxonomicGroupFilter).toBe('Oiseaux');
        expect(controls.searchTerm).toBe('Saint-Paul-en-Forêt');
        expect(controls.filters.aiFilter).toBeNull();
    });

    // B3 : Entrée cherche le nom dès qu'elle n'appliquerait rien.
    it.each(['Fougères', 'Pics', 'Rapaces', 'Morille de printemps 2024'])(
        '« %s » tapé par-dessus « champignons d’automne » : lien et Entrée cherchent ce nom', async (value) => {
            render(<Harness />);
            type('champignons d’automne');
            pressEnter();
            await waitFor(() => expect(controls.naturalSearch).not.toBeNull());
            type(value);
            expect(screen.getByRole('button', { name: `Chercher « ${value} » par nom à la place` })).toBeTruthy();
            // « Appliquer ce filtre » reste proposé, sur un clic.
            expect(within(screen.getByTestId('natural-search-proposal')).getByRole('button', { name: 'Appliquer ce filtre' })).toBeTruthy();
            pressEnter();
            expect(controls.naturalSearch).toBeNull();
            expect(controls.searchTerm).toBe(value);
            expect(screen.getByTestId('natural-search-status').textContent).toBe(`Recherche par nom : « ${value} ».`);
            expect(controls.taxonomicGroupFilter).toBe('all');
            expect(controls.filters.aiFilter).toBeNull();
        });

    it('« Fougères » par-dessus une recherche appliquée : « Appliquer ce filtre » au clic applique le filtre', async () => {
        render(<Harness />);
        type('champignons d’automne');
        pressEnter();
        await waitFor(() => expect(controls.naturalSearch).not.toBeNull());
        type('Fougères');
        fireEvent.click(within(screen.getByTestId('natural-search-proposal')).getByRole('button', { name: 'Appliquer ce filtre' }));
        await waitFor(() => expect(controls.naturalSearch?.phrase).toBe('Fougères'));
        expect(controls.filters.aiFilter?.categories).toEqual(['fougeres']);
    });

    // B4 : un repère de temps non compris bloque l'application locale.
    it.each([
        ['oiseaux en avril et mai', '« mai »'],
        ['oiseaux vus hier', '« hier »'],
        ['oiseaux le 12 mai', '« 12 mai »'],
        ['rapaces cette semaine', '« semaine »'],
        ['oiseaux ce matin', '« matin »'],
        ['oiseaux avant 2020', '« avant 2020 »'],
    ])('« %s » : rien sur Entrée, pas d’« Appliquer », le passage cité, le bouton IA proposé', (value, cited) => {
        render(<Harness />);
        type(value);
        expect(screen.queryByTestId('natural-search-proposal')).toBeNull();
        expect(screen.queryByRole('button', { name: /^Appliquer/ })).toBeNull();
        expect(screen.getByTestId('natural-search-time').textContent).toContain(cited);
        expect(aiButton()).toBeTruthy();
        pressEnter();
        expect(controls.naturalSearch).toBeNull();
        expect(controls.filters.aiFilter).toBeNull();
        expect(controls.yearFilter).toBe('all');
        expect(mocks.callAiText).not.toHaveBeenCalled();
    });

    it.each(['buse variable en mai', 'oiseaux à Pessac', 'Mars 2024 à Pessac', 'Rapaces de mai à Pessac', 'Cèpe d’été en septembre'])(
        '« %s » : toujours appliqué sur Entrée', async (value) => {
            render(<Harness />);
            type(value);
            expect(screen.queryByTestId('natural-search-time')).toBeNull();
            pressEnter();
            await waitFor(() => expect(controls.naturalSearch?.phrase).toBe(value));
        });

    // B7, C1 : un nom d'espèce ou de lieu n'invite pas à payer.
    it.each(['Grand cormoran', 'Grand corbeau', 'Grand Mars changeant', 'Grand paon de nuit', 'Le Teich', 'La Rochelle', 'L’Aigle', 'Les Eyzies'])(
        '« %s » : recherche par nom, aucun bouton IA', (value) => {
            render(<Harness />);
            type(value);
            expect(controls.searchTerm).toBe(value);
            expect(screen.queryByTestId('natural-search-proposal')).toBeNull();
            expect(aiButton()).toBeNull();
        });

    it.each(['oiseaux de Pessac', 'Canards colverts', 'hirondelles rustiques', 'les buses variables', 'plantes rares', 'fleurs des champs', 'insectes du jardin', 'animaux nocturnes'])(
        '« %s » : rien d’appliqué, bouton IA proposé', (value) => {
            render(<Harness />);
            type(value);
            expect(screen.queryByTestId('natural-search-proposal')).toBeNull();
            expect(aiButton()).toBeTruthy();
            pressEnter();
            expect(controls.naturalSearch).toBeNull();
        });

    // B5 : la phrase change pendant l'accord ou la vérification : rien ne part.
    const savePreset = () => {
        type('buse');
        act(() => { controls.saveFilterPreset('Buses'); });
        return controls.filterPresets[controls.filterPresets.length - 1].id;
    };

    it('préréglage appliqué pendant la carte d’accord : la carte se ferme, rien n’est envoyé', async () => {
        mocks.getAiOverview.mockResolvedValue(approved({}));
        render(<Harness />);
        const presetId = savePreset();
        type(PHRASE);
        fireEvent.click(aiButton() as HTMLButtonElement);
        await screen.findByTestId('ai-consent-card-search');
        act(() => { controls.applyFilterPreset(presetId); });
        expect(input().value).toBe('buse');
        await waitFor(() => expect(screen.queryByTestId('ai-consent-card-search')).toBeNull());
        expect(input().readOnly).toBe(false);
        expect(mocks.giveConsent).not.toHaveBeenCalled();
        expect(mocks.callAiText).not.toHaveBeenCalled();
    });

    it('préréglage appliqué pendant « Vérification… » : le parcours s’arrête, rien n’est envoyé', async () => {
        let resolveOverview: (value: AiOverview) => void = () => undefined;
        mocks.getAiOverview.mockImplementation(() => new Promise(resolve => { resolveOverview = resolve; }));
        render(<Harness />);
        const presetId = savePreset();
        type(PHRASE);
        // L'accès est lu pour montrer le bouton : on répond, puis le clic relit (en attente).
        await act(async () => { resolveOverview(approved()); });
        fireEvent.click(aiButton() as HTMLButtonElement);
        expect(screen.getByRole('button', { name: /Vérification/ })).toBeTruthy();
        act(() => { controls.applyFilterPreset(presetId); });
        await act(async () => { resolveOverview(approved()); });
        expect(mocks.callAiText).not.toHaveBeenCalled();
        expect(screen.queryByTestId('ai-consent-card-search')).toBeNull();
        expect(input().value).toBe('buse');
    });

    it('préréglage appliqué entre l’accord enregistré et l’envoi : rien n’est envoyé', async () => {
        mocks.getAiOverview.mockResolvedValue(approved({}));
        render(<Harness />);
        const presetId = savePreset();
        type(PHRASE);
        fireEvent.click(aiButton() as HTMLButtonElement);
        const card = await screen.findByTestId('ai-consent-card-search');
        let resolveOverview: (value: AiOverview) => void = () => undefined;
        mocks.getAiOverview.mockImplementation(() => new Promise(resolve => { resolveOverview = resolve; }));
        fireEvent.click(within(card).getByRole('checkbox'));
        fireEvent.click(within(card).getByRole('button', { name: 'Accepter et interpréter' }));
        await waitFor(() => expect(mocks.giveConsent).toHaveBeenCalled());
        await waitFor(() => expect(screen.getByRole('button', { name: /Vérification/ })).toBeTruthy());
        act(() => { controls.applyFilterPreset(presetId); });
        await act(async () => { resolveOverview(approved()); });
        expect(mocks.callAiText).not.toHaveBeenCalled();
    });

    // B6 : l'erreur arrive après un remontage du champ.
    it('remontage pendant l’envoi, puis model_refused (11 restantes) : message d’erreur et compteur à jour', async () => {
        let rejectCall: (error: unknown) => void = () => undefined;
        mocks.callAiText.mockReturnValue(new Promise((_resolve, reject) => { rejectCall = reject; }));
        render(<Harness />);
        type(PHRASE);
        expect(await screen.findByText(/12 restantes/)).toBeTruthy();
        fireEvent.click(aiButton() as HTMLButtonElement);
        await waitFor(() => expect(mocks.callAiText).toHaveBeenCalledTimes(1));
        act(() => { setShown(false); });
        act(() => { setShown(true); });
        expect(screen.getByRole('button', { name: /Interprétation en cours/ })).toBeTruthy();
        await act(async () => { rejectCall(new AiAssistError('model_refused', { feature: 'search', remaining: 11 })); });
        expect((await screen.findByRole('alert')).textContent).toMatch(/n'a pas pu interpréter cette phrase/);
        expect(await screen.findByText(/11 restantes/)).toBeTruthy();
        expect(mocks.callAiText).toHaveBeenCalledTimes(1);
    });

    // C2 : en mode strict (double montage), l'attente reprise est nettoyée puis reprise une seule fois.
    it('mode strict : remontage pendant l’envoi, la réponse revient une fois, sans nouvel envoi', async () => {
        let resolveCall: (value: unknown) => void = () => undefined;
        mocks.callAiText.mockReturnValue(new Promise(resolve => { resolveCall = resolve; }));
        render(<StrictMode><Harness /></StrictMode>);
        type(PHRASE);
        fireEvent.click(aiButton() as HTMLButtonElement);
        await waitFor(() => expect(mocks.callAiText).toHaveBeenCalledTimes(1));
        act(() => { setShown(false); });
        act(() => { setShown(true); });
        expect(screen.getByRole('button', { name: /Interprétation en cours/ })).toBeTruthy();
        await act(async () => { resolveCall({ result: serverResult({ text: 'hérons cendrés' }), remaining: 11 }); });
        expect(await screen.findByTestId('natural-search-proposal')).toBeTruthy();
        // Le verrou est libéré : le champ redevient modifiable.
        expect(input().readOnly).toBe(false);
        expect(mocks.callAiText).toHaveBeenCalledTimes(1);
    });

    // C3 : « Annuler » pendant l'enregistrement de l'accord.
    it('« Annuler » pendant l’enregistrement de l’accord : champ modifiable, bouton IA occupé avec sa raison', async () => {
        mocks.getAiOverview.mockResolvedValue(approved({}));
        let resolveConsent: () => void = () => undefined;
        mocks.giveConsent.mockReturnValue(new Promise<void>(resolve => { resolveConsent = resolve; }));
        render(<Harness />);
        type(PHRASE);
        fireEvent.click(aiButton() as HTMLButtonElement);
        const card = await screen.findByTestId('ai-consent-card-search');
        fireEvent.click(within(card).getByRole('checkbox'));
        fireEvent.click(within(card).getByRole('button', { name: 'Accepter et interpréter' }));
        fireEvent.click(within(card).getByRole('button', { name: 'Annuler' }));
        expect(screen.queryByTestId('ai-consent-card-search')).toBeNull();
        expect(input().readOnly).toBe(false);
        const busy = screen.getByRole('button', { name: /Enregistrement de l’accord/ });
        expect(busy.getAttribute('aria-busy')).toBe('true');
        // Occupé : un clic ne lance rien.
        fireEvent.click(busy);
        type(`${PHRASE} vus`);
        expect(input().value).toBe(`${PHRASE} vus`);
        await act(async () => { resolveConsent(); });
        expect(mocks.callAiText).not.toHaveBeenCalled();
        expect(aiButton()).toBeTruthy();
        expect((aiButton() as HTMLButtonElement).disabled).toBe(false);
    });
});
