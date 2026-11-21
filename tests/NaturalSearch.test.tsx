import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { useState } from 'react';
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
        pressEnter();
        expect(controls.naturalSearch?.phrase).toBe('hérons cendrés en juin');
        // Geste explicite pour passer à une recherche par nom.
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
        expect(controls.advancedFilterState.geoMode).toBe('none');
        expect(controls.taxonomicGroupFilter).toBe('Oiseaux');
        expect(mocks.callAiText).not.toHaveBeenCalled();
        expect(screen.getByTestId('natural-search-status').textContent).toMatch(/sauf : autour de ma position actuelle \(10 km\) : position refusée/);

        fireEvent.click(within(chip).getByRole('button', { name: 'Réessayer' }));
        await waitFor(() => expect(controls.advancedFilterState.geoMode).toBe('radius'));
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
        await screen.findByTestId('natural-search-proposal');
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
        const proposal = await screen.findByTestId('natural-search-proposal');
        expect(within(proposal).getByText(/mal lu le département/)).toBeTruthy();
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
