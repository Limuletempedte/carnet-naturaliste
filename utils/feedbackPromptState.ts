import { safeGet, safeSet } from './safeStorage';
import { logger } from './logger';

/**
 * État persistant de l'invite d'avis (« Que pensez-vous de l'app ? »).
 * Objectif : solliciter l'utilisateur APRÈS quelques observations, de façon
 * récurrente mais espacée (sans agacer) :
 *  - jamais en dessous de FEEDBACK_MIN_OBSERVATIONS ;
 *  - au plus une fois par FEEDBACK_COOLDOWN_DAYS (récurrent ensuite) ;
 *  - « Ne plus demander » coupe définitivement.
 * Clé globale (l'avis concerne l'app, pas un compte précis).
 */

export const FEEDBACK_PROMPT_KEY = 'feedback-prompt-v1';
export const FEEDBACK_MIN_OBSERVATIONS = 5;
export const FEEDBACK_COOLDOWN_DAYS = 35;
const DAY_MS = 24 * 60 * 60 * 1000;

export interface FeedbackPromptState {
    /** epoch ms du dernier affichage, null si jamais montré */
    lastShownAt: number | null;
    /** nombre d'affichages de l'invite */
    shownCount: number;
    /** l'utilisateur a choisi « Ne plus demander » */
    disabled: boolean;
}

const DEFAULT_STATE: FeedbackPromptState = { lastShownAt: null, shownCount: 0, disabled: false };

export const getFeedbackPromptState = (): FeedbackPromptState => {
    const raw = safeGet(FEEDBACK_PROMPT_KEY);
    if (!raw) return { ...DEFAULT_STATE };
    try {
        const parsed: unknown = JSON.parse(raw);
        if (typeof parsed !== 'object' || parsed === null) return { ...DEFAULT_STATE };
        const p = parsed as Record<string, unknown>;
        return {
            lastShownAt: typeof p.lastShownAt === 'number' ? p.lastShownAt : null,
            shownCount: typeof p.shownCount === 'number' ? p.shownCount : 0,
            disabled: p.disabled === true,
        };
    } catch (err) {
        logger.warn('[feedbackPromptState] état corrompu, réinitialisation', err);
        return { ...DEFAULT_STATE };
    }
};

export const setFeedbackPromptState = (state: FeedbackPromptState): void => {
    try {
        safeSet(FEEDBACK_PROMPT_KEY, JSON.stringify(state));
    } catch {
        // safeSet a déjà logué / dispatché 'storage-quota-exceeded' — non bloquant.
    }
};

/**
 * Décide si l'invite d'avis doit être affichée. Fonction PURE (testable) :
 * récurrente mais espacée — réapparaît après le cooldown, sauf si désactivée.
 */
export const shouldShowFeedback = (
    state: FeedbackPromptState,
    now: number,
    opts: { observationCount: number },
): boolean => {
    if (state.disabled) return false;
    if (opts.observationCount < FEEDBACK_MIN_OBSERVATIONS) return false;
    if (state.lastShownAt !== null && now - state.lastShownAt < FEEDBACK_COOLDOWN_DAYS * DAY_MS) {
        return false;
    }
    return true;
};

/** Marque un affichage (pose le cooldown + incrémente le compteur). */
export const markFeedbackShown = (now: number): FeedbackPromptState => {
    const current = getFeedbackPromptState();
    const next: FeedbackPromptState = {
        ...current,
        lastShownAt: now,
        shownCount: current.shownCount + 1,
    };
    setFeedbackPromptState(next);
    return next;
};

/** « Ne plus demander » : on ne sollicite plus l'utilisateur. */
export const markFeedbackDisabled = (): void => {
    setFeedbackPromptState({ ...getFeedbackPromptState(), disabled: true });
};
