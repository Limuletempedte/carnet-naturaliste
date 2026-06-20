import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
    HINT_EXPIRY_DAYS,
    INSTALL_HINT_KEY,
    MAX_HINT_SHOWS,
    getInstallHintState,
    markHintDismissed,
    markHintShown,
    markInstalled,
    setInstallHintState,
    shouldShowHint,
    type InstallHintState,
} from '../utils/installPromptState';

const DAY_MS = 24 * 60 * 60 * 1000;

const baseState = (overrides: Partial<InstallHintState> = {}): InstallHintState => ({
    firstSeenAt: null,
    shownCount: 0,
    dismissed: false,
    installed: false,
    ...overrides,
});

describe('shouldShowHint', () => {
    const now = 1_700_000_000_000;

    it('affiche dans le cas nominal (installable, jamais vu)', () => {
        expect(shouldShowHint(baseState(), now, { isStandalone: false, eligible: true })).toBe(true);
    });

    it("n'affiche pas si l'app est déjà installée (standalone)", () => {
        expect(shouldShowHint(baseState(), now, { isStandalone: true, eligible: true })).toBe(false);
    });

    it("n'affiche pas si le contexte est indéterminé (non éligible)", () => {
        expect(shouldShowHint(baseState(), now, { isStandalone: false, eligible: false })).toBe(false);
    });

    it("n'affiche pas si déjà installé", () => {
        expect(shouldShowHint(baseState({ installed: true }), now, { isStandalone: false, eligible: true })).toBe(false);
    });

    it("n'affiche pas si rejeté explicitement", () => {
        expect(shouldShowHint(baseState({ dismissed: true }), now, { isStandalone: false, eligible: true })).toBe(false);
    });

    it("n'affiche pas au-delà du quota d'affichages", () => {
        const state = baseState({ shownCount: MAX_HINT_SHOWS, firstSeenAt: now });
        expect(shouldShowHint(state, now, { isStandalone: false, eligible: true })).toBe(false);
    });

    it("n'affiche plus après le délai d'expiration (refus implicite)", () => {
        const state = baseState({ firstSeenAt: now - (HINT_EXPIRY_DAYS + 1) * DAY_MS, shownCount: 1 });
        expect(shouldShowHint(state, now, { isStandalone: false, eligible: true })).toBe(false);
    });

    it('affiche encore juste avant le délai d’expiration', () => {
        const state = baseState({ firstSeenAt: now - (HINT_EXPIRY_DAYS - 1) * DAY_MS, shownCount: 1 });
        expect(shouldShowHint(state, now, { isStandalone: false, eligible: true })).toBe(true);
    });
});

describe('persistance installPromptState', () => {
    beforeEach(() => localStorage.clear());
    afterEach(() => localStorage.clear());

    it('renvoie l’état par défaut quand rien n’est stocké', () => {
        expect(getInstallHintState()).toEqual({ firstSeenAt: null, shownCount: 0, dismissed: false, installed: false });
    });

    it('markHintShown fixe firstSeenAt une seule fois et incrémente le compteur', () => {
        markHintShown(1000);
        let state = getInstallHintState();
        expect(state.shownCount).toBe(1);
        expect(state.firstSeenAt).toBe(1000);

        markHintShown(5000);
        state = getInstallHintState();
        expect(state.shownCount).toBe(2);
        expect(state.firstSeenAt).toBe(1000); // inchangé
    });

    it('markHintDismissed et markInstalled persistent les drapeaux', () => {
        markHintDismissed();
        expect(getInstallHintState().dismissed).toBe(true);
        markInstalled();
        expect(getInstallHintState().installed).toBe(true);
    });

    it('relit un état corrompu sans planter (retour au défaut)', () => {
        setInstallHintState(baseState({ shownCount: 2 }));
        localStorage.setItem(INSTALL_HINT_KEY, '{ ceci n’est pas du json');
        expect(getInstallHintState()).toEqual({ firstSeenAt: null, shownCount: 0, dismissed: false, installed: false });
    });
});
