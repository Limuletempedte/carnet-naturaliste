import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
    FEEDBACK_COOLDOWN_DAYS,
    FEEDBACK_MIN_OBSERVATIONS,
    FEEDBACK_PROMPT_KEY,
    getFeedbackPromptState,
    markFeedbackDisabled,
    markFeedbackShown,
    setFeedbackPromptState,
    shouldShowFeedback,
    type FeedbackPromptState,
} from '../utils/feedbackPromptState';

const DAY_MS = 24 * 60 * 60 * 1000;

const baseState = (overrides: Partial<FeedbackPromptState> = {}): FeedbackPromptState => ({
    lastShownAt: null,
    shownCount: 0,
    disabled: false,
    ...overrides,
});

describe('shouldShowFeedback', () => {
    const now = 1_700_000_000_000;

    it('affiche apres assez d\'observations, jamais vu', () => {
        expect(shouldShowFeedback(baseState(), now, { observationCount: FEEDBACK_MIN_OBSERVATIONS })).toBe(true);
    });

    it('n\'affiche pas en dessous du seuil d\'observations', () => {
        expect(shouldShowFeedback(baseState(), now, { observationCount: FEEDBACK_MIN_OBSERVATIONS - 1 })).toBe(false);
    });

    it('n\'affiche pas si desactive (« Ne plus demander »)', () => {
        expect(shouldShowFeedback(baseState({ disabled: true }), now, { observationCount: 50 })).toBe(false);
    });

    it('n\'affiche pas pendant le cooldown', () => {
        const state = baseState({ lastShownAt: now - (FEEDBACK_COOLDOWN_DAYS - 1) * DAY_MS, shownCount: 1 });
        expect(shouldShowFeedback(state, now, { observationCount: 50 })).toBe(false);
    });

    it('reaffiche apres le cooldown (recurrence)', () => {
        const state = baseState({ lastShownAt: now - (FEEDBACK_COOLDOWN_DAYS + 1) * DAY_MS, shownCount: 1 });
        expect(shouldShowFeedback(state, now, { observationCount: 50 })).toBe(true);
    });
});

describe('persistance feedbackPromptState', () => {
    beforeEach(() => localStorage.clear());
    afterEach(() => localStorage.clear());

    it('renvoie l\'etat par defaut quand rien n\'est stocke', () => {
        expect(getFeedbackPromptState()).toEqual({ lastShownAt: null, shownCount: 0, disabled: false });
    });

    it('markFeedbackShown enregistre lastShownAt et incremente', () => {
        markFeedbackShown(1000);
        const s = getFeedbackPromptState();
        expect(s.lastShownAt).toBe(1000);
        expect(s.shownCount).toBe(1);
    });

    it('markFeedbackDisabled coupe definitivement', () => {
        markFeedbackDisabled();
        expect(getFeedbackPromptState().disabled).toBe(true);
    });

    it('relit un etat corrompu sans planter (retour au defaut)', () => {
        setFeedbackPromptState(baseState({ shownCount: 3 }));
        localStorage.setItem(FEEDBACK_PROMPT_KEY, '{ pas du json');
        expect(getFeedbackPromptState()).toEqual({ lastShownAt: null, shownCount: 0, disabled: false });
    });
});
