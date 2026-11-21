import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
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

import NaturalSearch from '../components/NaturalSearch';
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

const Harness: React.FC<{ isOffline?: boolean }> = ({ isOffline = false }) => {
    controls = useFilterControls({ onToast: vi.fn() });
    return (
        <NaturalSearch
            variant="desktop"
            inputId="search-input"
            searchTerm={controls.searchTerm}
            onSearchChange={controls.setSearchTerm}
            naturalSearch={controls.naturalSearch}
            onApply={controls.applyNaturalSearch}
            onRemoveCriterion={controls.removeNaturalCriterion}
            onUpdateNear={controls.updateNaturalNear}
            onUndo={controls.undoNaturalSearch}
            onResetAll={controls.resetAllFilters}
            hasActiveFilters={controls.hasActiveFilters}
            excludedNoLatinName={0}
            isOffline={isOffline}
        />
    );
};

const input = () => screen.getByLabelText('Recherche') as HTMLInputElement;
const type = (value: string) => fireEvent.change(input(), { target: { value } });
const pressEnter = () => fireEvent.keyDown(input(), { key: 'Enter' });

describe('NaturalSearch : analyse gratuite', () => {
    beforeEach(() => {
        localStorage.clear();
        setSessionIdentity('user-1');
        mocks.callAiText.mockReset();
        mocks.getAiOverview.mockReset().mockResolvedValue(approved());
        mocks.giveConsent.mockReset().mockResolvedValue(undefined);
        mocks.resolveNear.mockReset().mockResolvedValue({ status: 'ok', lat: 44.8, lon: -0.6 });
        vi.useFakeTimers({ toFake: ['Date'] });
        vi.setSystemTime(new Date(2026, 10, 21, 12, 0, 0));
    });
    afterEach(() => {
        vi.useRealTimers();
        vi.restoreAllMocks();
    });

    it('un nom seul cherche comme avant, à chaque frappe', () => {
        render(<Harness />);
        type('buse');
        expect(controls.searchTerm).toBe('buse');
        expect(screen.queryByTestId('natural-search-proposal')).toBeNull();
    });

    it('une phrase comprise : étiquettes visibles, rien n’est appliqué avant Entrée, et Entrée n’appelle jamais l’assistant', async () => {
        render(<Harness />);
        type('les rapaces le mois dernier');
        const proposal = screen.getByTestId('natural-search-proposal');
        expect(within(proposal).getByText('Rapaces diurnes')).toBeTruthy();
        expect(within(proposal).getByText('le mois dernier (octobre 2026)')).toBeTruthy();
        // Rien n'est appliqué tant que la personne n'a pas validé.
        expect(controls.startDateFilter).toBe('');
        expect(controls.filters.aiFilter).toBeNull();
        expect(controls.searchTerm).toBe('');

        pressEnter();
        await waitFor(() => expect(controls.naturalSearch).not.toBeNull());
        expect(controls.startDateFilter).toBe('2026-10-01');
        expect(controls.filters.aiFilter?.categories).toEqual(['rapaces_diurnes', 'rapaces_nocturnes']);
        expect(mocks.callAiText).not.toHaveBeenCalled();
        expect(screen.getByTestId('natural-search-applied')).toBeTruthy();
    });

    it('Entrée sur une phrase mal comprise ne consomme rien', () => {
        render(<Harness />);
        type('hérons cendrés près de la Garonne');
        pressEnter();
        pressEnter();
        expect(mocks.callAiText).not.toHaveBeenCalled();
        expect(screen.getByRole('button', { name: "Interpréter avec l'IA" })).toBeTruthy();
    });

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

        const remove = screen.getByRole('button', { name: 'Retirer le critère : 2024' });
        fireEvent.click(remove);
        expect(controls.yearFilter).toBe('all');
        expect(controls.filters.aiFilter?.categories).toEqual(['canards']);
        // Le focus passe à l'étiquette suivante.
        await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Retirer le critère : Canards' })));

        fireEvent.click(screen.getByRole('button', { name: 'Annuler la recherche' }));
        expect(controls.yearFilter).toBe('2019');
        expect(controls.naturalSearch).toBeNull();
    });

    it('une recherche par nom active mais absente du champ (preset, carte) est montrée et se retire', () => {
        render(<Harness />);
        act(() => { controls.setSearchTerm('buse'); });
        const hidden = screen.getByTestId('natural-search-hidden-term');
        expect(hidden.textContent).toMatch(/Recherche par nom active : « buse »/);
        fireEvent.click(within(hidden).getByRole('button', { name: 'Retirer' }));
        expect(controls.searchTerm).toBe('');
        expect(screen.queryByTestId('natural-search-hidden-term')).toBeNull();
    });

    it('pendant la localisation, une étiquette ne peut plus être écartée ; la dernière retirée rend le focus au champ', async () => {
        let resolveNear: (value: unknown) => void = () => undefined;
        mocks.resolveNear.mockReturnValueOnce(new Promise(resolve => { resolveNear = resolve; }));
        render(<Harness />);
        type('les oiseaux près de chez moi');
        fireEvent.click(screen.getByRole('button', { name: 'Appliquer' }));
        expect((screen.getByRole('button', { name: 'Ne pas garder : Oiseaux' }) as HTMLButtonElement).disabled).toBe(true);
        await act(async () => { resolveNear({ status: 'ok', lat: 44.8, lon: -0.6 }); });
        await waitFor(() => expect(controls.naturalSearch).not.toBeNull());
        fireEvent.click(screen.getByRole('button', { name: /Retirer le critère : autour de ma position/ }));
        fireEvent.click(screen.getByRole('button', { name: 'Retirer le critère : Oiseaux' }));
        await waitFor(() => expect(controls.naturalSearch).toBeNull());
        await waitFor(() => expect(document.activeElement).toBe(input()));
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

    it('« près de chez moi » : géolocalisation refusée → étiquette d’erreur, critère jamais abandonné, « Réessayer »', async () => {
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
        // La position n'est jamais envoyée à l'assistant.
        expect(mocks.callAiText).not.toHaveBeenCalled();

        fireEvent.click(within(chip).getByRole('button', { name: 'Réessayer' }));
        await waitFor(() => expect(controls.advancedFilterState.geoMode).toBe('radius'));
        expect(screen.getByTestId('search-chip-near').getAttribute('data-tone')).toBe('ok');
    });
});

describe('NaturalSearch : interprétation par l’assistant', () => {
    beforeEach(() => {
        localStorage.clear();
        setSessionIdentity('user-1');
        mocks.callAiText.mockReset();
        mocks.getAiOverview.mockReset().mockResolvedValue(approved());
        mocks.giveConsent.mockReset().mockResolvedValue(undefined);
        mocks.resolveNear.mockReset().mockResolvedValue({ status: 'ok', lat: 44.8, lon: -0.6 });
        vi.useFakeTimers({ toFake: ['Date'] });
        vi.setSystemTime(new Date(2026, 10, 21, 12, 0, 0));
    });
    afterEach(() => {
        vi.useRealTimers();
        vi.restoreAllMocks();
    });

    const PHRASE = 'hérons cendrés près de Castelbrume';

    it('double clic = un seul envoi ; la phrase seule part ; étiquettes avant application ; mise en cache', async () => {
        let resolveCall: (value: unknown) => void = () => undefined;
        mocks.callAiText.mockReturnValue(new Promise(resolve => { resolveCall = resolve; }));
        render(<Harness />);
        type(PHRASE);
        const button = screen.getByRole('button', { name: "Interpréter avec l'IA" });
        fireEvent.click(button);
        fireEvent.click(button);
        await waitFor(() => expect(mocks.callAiText).toHaveBeenCalledTimes(1));
        fireEvent.click(screen.getByRole('button', { name: /Interprétation en cours/ }));
        expect(mocks.callAiText).toHaveBeenCalledTimes(1);
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
        expect(controls.searchTerm).toBe('héron cendré');
    });

    it('une phrase déjà comprise se rejoue sans appel, même hors ligne', async () => {
        mocks.callAiText.mockResolvedValue({ result: serverResult({ categories: ['ardeides'], commune: 'Castelbrume' }), remaining: 11 });
        const { unmount } = render(<Harness />);
        type('les hérons à Castelbrume');
        fireEvent.click(screen.getByRole('button', { name: "Interpréter avec l'IA" }));
        await screen.findByTestId('natural-search-proposal');
        unmount();

        render(<Harness isOffline />);
        type('Les hérons à Castelbrume');
        const proposal = screen.getByTestId('natural-search-proposal');
        expect(within(proposal).getByText(/sans nouvelle utilisation/)).toBeTruthy();
        expect(screen.queryByRole('button', { name: "Interpréter avec l'IA" })).toBeNull();
        pressEnter();
        await waitFor(() => expect(controls.naturalSearch?.source).toBe('cache'));
        expect(controls.filters.aiFilter?.commune).toBe('Castelbrume');
        expect(mocks.callAiText).toHaveBeenCalledTimes(1);
    });

    it('une phrase où l’assistant n’a rien trouvé n’est pas repayée', async () => {
        mocks.callAiText.mockResolvedValue({ result: serverResult(), remaining: 11 });
        const { unmount } = render(<Harness />);
        type('quel temps fera-t-il demain');
        fireEvent.click(screen.getByRole('button', { name: "Interpréter avec l'IA" }));
        expect((await screen.findByTestId('natural-search-empty')).textContent).toMatch(/aucun critère/);
        expect(screen.queryByRole('button', { name: "Interpréter avec l'IA" })).toBeNull();
        unmount();
        render(<Harness />);
        type('Quel temps fera-t-il demain ?');
        expect(screen.getByTestId('natural-search-empty').textContent).toMatch(/déjà interprétée/);
        expect(screen.queryByRole('button', { name: "Interpréter avec l'IA" })).toBeNull();
        expect(mocks.callAiText).toHaveBeenCalledTimes(1);
    });

    it('quitter la liste pendant l’attente ne perd pas un résultat payé : il est gardé, rejoué sans appel', async () => {
        let resolveCall: (value: unknown) => void = () => undefined;
        mocks.callAiText.mockReturnValue(new Promise(resolve => { resolveCall = resolve; }));
        const { unmount } = render(<Harness />);
        type(PHRASE);
        fireEvent.click(screen.getByRole('button', { name: "Interpréter avec l'IA" }));
        await waitFor(() => expect(mocks.callAiText).toHaveBeenCalledTimes(1));
        const signal = mocks.callAiText.mock.calls[0][2].signal as AbortSignal;
        unmount();
        expect(signal.aborted).toBe(false);
        await act(async () => { resolveCall({ result: serverResult({ text: 'hérons cendrés' }), remaining: 11 }); });
        render(<Harness />);
        type(PHRASE);
        expect(within(screen.getByTestId('natural-search-proposal')).getByText(/sans nouvelle utilisation/)).toBeTruthy();
        expect(mocks.callAiText).toHaveBeenCalledTimes(1);
    });

    it('hors ligne : bouton désactivé avec la raison, aucun appel', () => {
        render(<Harness isOffline />);
        type(PHRASE);
        const button = screen.getByRole('button', { name: "Interpréter avec l'IA" }) as HTMLButtonElement;
        expect(button.disabled).toBe(true);
        expect(screen.getByText('Disponible en ligne uniquement.')).toBeTruthy();
        fireEvent.click(button);
        expect(mocks.callAiText).not.toHaveBeenCalled();
    });

    it('accord au premier usage, à l’endroit même ; rien n’est envoyé avant', async () => {
        mocks.getAiOverview.mockResolvedValue(approved({}));
        mocks.callAiText.mockResolvedValue({ result: serverResult({ text: 'hérons cendrés' }), remaining: 11 });
        render(<Harness />);
        type(PHRASE);
        fireEvent.click(screen.getByRole('button', { name: "Interpréter avec l'IA" }));
        const card = await screen.findByTestId('ai-consent-card-search');
        expect(within(card).getByTestId('ai-search-consent-text').textContent).toMatch(/Anthropic Ireland Ltd/);
        expect(mocks.callAiText).not.toHaveBeenCalled();
        // La phrase ne change pas pendant l'accord.
        expect(input().readOnly).toBe(true);
        mocks.getAiOverview.mockResolvedValue(approved());
        fireEvent.click(within(card).getByRole('checkbox'));
        fireEvent.click(within(card).getByRole('button', { name: 'Accepter et interpréter' }));
        await waitFor(() => expect(mocks.callAiText).toHaveBeenCalledTimes(1));
        expect(mocks.giveConsent).toHaveBeenCalledWith('search', expect.anything());
    });

    it('« Annuler » pendant l’enregistrement de l’accord : rien n’est envoyé', async () => {
        mocks.getAiOverview.mockResolvedValue(approved({}));
        let resolveConsent: () => void = () => undefined;
        mocks.giveConsent.mockReturnValue(new Promise<void>(resolve => { resolveConsent = resolve; }));
        render(<Harness />);
        type(PHRASE);
        fireEvent.click(screen.getByRole('button', { name: "Interpréter avec l'IA" }));
        const card = await screen.findByTestId('ai-consent-card-search');
        fireEvent.click(within(card).getByRole('checkbox'));
        fireEvent.click(within(card).getByRole('button', { name: 'Accepter et interpréter' }));
        fireEvent.click(within(card).getByRole('button', { name: 'Annuler' }));
        await act(async () => { resolveConsent(); });
        expect(mocks.callAiText).not.toHaveBeenCalled();
    });

    it('pendant l’accord, la recherche appliquée ne peut pas changer, et « Accepter » envoie la phrase de la carte, jamais une autre', async () => {
        mocks.getAiOverview.mockResolvedValue(approved({}));
        mocks.callAiText.mockResolvedValue({ result: serverResult({ text: 'hérons cendrés' }), remaining: 11 });
        render(<Harness />);
        type('les oiseaux en mai');
        pressEnter();
        await waitFor(() => expect(controls.naturalSearch).not.toBeNull());
        type(PHRASE);
        fireEvent.click(screen.getByRole('button', { name: "Interpréter avec l'IA" }));
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

    it('« Annuler » pendant l’interprétation : rien d’appliqué, message, compteur relu', async () => {
        mocks.callAiText.mockImplementation((_feature: string, _payload: unknown, options: { signal: AbortSignal }) => new Promise((_resolve, reject) => {
            options.signal.addEventListener('abort', () => reject(new AiAssistError('cancelled', { feature: 'search' })));
        }));
        render(<Harness />);
        type(PHRASE);
        fireEvent.click(screen.getByRole('button', { name: "Interpréter avec l'IA" }));
        await waitFor(() => expect(mocks.callAiText).toHaveBeenCalledTimes(1));
        const overviewCalls = mocks.getAiOverview.mock.calls.length;
        fireEvent.click(screen.getByRole('button', { name: 'Annuler' }));
        expect((await screen.findByRole('alert')).textContent).toMatch(/Interprétation arrêtée : rien n'a été appliqué.*peut compter/);
        await waitFor(() => expect(mocks.getAiOverview.mock.calls.length).toBeGreaterThan(overviewCalls));
        expect(controls.naturalSearch).toBeNull();
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
        fireEvent.click(screen.getByRole('button', { name: "Interpréter avec l'IA" }));
        expect((await screen.findByRole('alert')).textContent).toMatch(message);
    });

    it('un champ retiré par la validation (dropped) n’est jamais appliqué, et c’est dit', async () => {
        mocks.callAiText.mockResolvedValue({ result: serverResult({ groups: ['Oiseaux'], department: null, dropped: ['department'] }), remaining: 11 });
        render(<Harness />);
        type('les oiseaux de la Gironde maritime');
        fireEvent.click(screen.getByRole('button', { name: "Interpréter avec l'IA" }));
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
        fireEvent.click(screen.getByRole('button', { name: "Interpréter avec l'IA" }));
        await waitFor(() => expect(mocks.callAiText).toHaveBeenCalledTimes(1));
        act(() => { setSessionIdentity('user-2'); });
        await act(async () => { resolveCall({ result: serverResult({ text: 'hérons cendrés' }), remaining: 11 }); });
        expect(screen.queryByTestId('natural-search-proposal')).toBeNull();
        expect(input().value).toBe('');
    });
});
