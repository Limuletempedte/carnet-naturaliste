import { safeGet, safeSet } from './safeStorage';
import { logger } from './logger';

/**
 * État persistant de l'invite « Installer l'application ».
 * Objectif : proposer l'installation sans harceler —
 *  - jamais si l'app est déjà installée (mode standalone) ;
 *  - au plus MAX_HINT_SHOWS fois (1 par session) ;
 *  - on arrête après HINT_EXPIRY_DAYS jours sans installation (= refus implicite) ;
 *  - on arrête définitivement dès l'installation ou un rejet explicite.
 * Clé globale (pas scopée par utilisateur) : l'installation est propre à l'appareil.
 */

export const INSTALL_HINT_KEY = 'install-hint-v1';
export const MAX_HINT_SHOWS = 3;
export const HINT_EXPIRY_DAYS = 14;
const DAY_MS = 24 * 60 * 60 * 1000;

export interface InstallHintState {
    /** epoch ms du premier affichage, null si jamais montré */
    firstSeenAt: number | null;
    /** nombre d'affichages de l'invite */
    shownCount: number;
    /** l'utilisateur a fermé l'invite explicitement */
    dismissed: boolean;
    /** l'app a été installée (appinstalled ou prompt accepté) */
    installed: boolean;
}

const DEFAULT_STATE: InstallHintState = {
    firstSeenAt: null,
    shownCount: 0,
    dismissed: false,
    installed: false,
};

export const getInstallHintState = (): InstallHintState => {
    const raw = safeGet(INSTALL_HINT_KEY);
    if (!raw) return { ...DEFAULT_STATE };
    try {
        const parsed: unknown = JSON.parse(raw);
        if (typeof parsed !== 'object' || parsed === null) return { ...DEFAULT_STATE };
        const p = parsed as Record<string, unknown>;
        return {
            firstSeenAt: typeof p.firstSeenAt === 'number' ? p.firstSeenAt : null,
            shownCount: typeof p.shownCount === 'number' ? p.shownCount : 0,
            dismissed: p.dismissed === true,
            installed: p.installed === true,
        };
    } catch (err) {
        logger.warn('[installPromptState] état corrompu, réinitialisation', err);
        return { ...DEFAULT_STATE };
    }
};

export const setInstallHintState = (state: InstallHintState): void => {
    try {
        safeSet(INSTALL_HINT_KEY, JSON.stringify(state));
    } catch {
        // safeSet a déjà logué / dispatché 'storage-quota-exceeded' — non bloquant.
    }
};

/**
 * Décide si l'invite doit être affichée. Fonction PURE (aucun accès navigateur),
 * pour être testable simplement.
 */
export const shouldShowHint = (
    state: InstallHintState,
    now: number,
    opts: { isStandalone: boolean; eligible: boolean },
): boolean => {
    if (opts.isStandalone) return false;          // déjà installée
    if (!opts.eligible) return false;             // rien à proposer (mode indéterminé)
    if (state.installed || state.dismissed) return false;
    if (state.shownCount >= MAX_HINT_SHOWS) return false;
    if (state.firstSeenAt !== null && now - state.firstSeenAt > HINT_EXPIRY_DAYS * DAY_MS) {
        return false;                              // ignorée trop longtemps = refus implicite
    }
    return true;
};

/** Marque un affichage (fixe firstSeenAt au 1er, incrémente le compteur). */
export const markHintShown = (now: number): InstallHintState => {
    const current = getInstallHintState();
    const next: InstallHintState = {
        ...current,
        firstSeenAt: current.firstSeenAt ?? now,
        shownCount: current.shownCount + 1,
    };
    setInstallHintState(next);
    return next;
};

/** L'utilisateur a fermé l'invite : on ne la remontre plus. */
export const markHintDismissed = (): void => {
    setInstallHintState({ ...getInstallHintState(), dismissed: true });
};

/** L'app est installée : plus jamais d'invite. */
export const markInstalled = (): void => {
    setInstallHintState({ ...getInstallHintState(), installed: true });
};
