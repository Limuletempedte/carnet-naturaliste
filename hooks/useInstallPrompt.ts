import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Événement `beforeinstallprompt` (Chrome/Edge desktop + Android). Non typé par
 * lib.dom de façon stable selon les versions → on déclare le minimum utilisé.
 */
interface BeforeInstallPromptEvent extends Event {
    prompt: () => Promise<void>;
    userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

export type InstallOutcome = 'accepted' | 'dismissed' | 'unavailable';

/**
 * Comment l'utilisateur peut installer l'app selon son navigateur :
 *  - 'prompt'      : prompt natif disponible (Chrome/Edge desktop, Android Chromium).
 *  - 'ios'         : iPhone/iPad → ajout manuel via Safari (Partager → écran d'accueil).
 *  - 'unsupported' : navigateur intégré (app Google, réseaux sociaux…) ou navigateur
 *                    sans installation PWA (Firefox, Safari de bureau) → conseiller un
 *                    navigateur compatible.
 *  - 'pending'     : indéterminé (probablement Chromium, prompt pas encore émis) — on
 *                    n'affirme RIEN, pour ne pas conseiller à tort de changer de navigateur.
 */
export type InstallMode = 'pending' | 'prompt' | 'ios' | 'unsupported';

const detectStandalone = (): boolean => {
    if (typeof window === 'undefined') return false;
    const mqStandalone = window.matchMedia?.('(display-mode: standalone)').matches ?? false;
    // iOS Safari : propriété historique non standard.
    const iosStandalone = (window.navigator as { standalone?: boolean }).standalone === true;
    return mqStandalone || iosStandalone;
};

const detectIOS = (): boolean => {
    if (typeof navigator === 'undefined') return false;
    const ua = navigator.userAgent || '';
    // iPadOS 13+ se présente comme un Mac tactile (UA « Macintosh » + écran tactile).
    const iPadOS = /Macintosh/.test(ua) && navigator.maxTouchPoints > 1;
    return /iPad|iPhone|iPod/.test(ua) || iPadOS;
};

/**
 * Classe le contexte AVANT tout événement `beforeinstallprompt`.
 * Renvoie 'pending' dès qu'on ne peut rien affirmer (probable Chromium) : on
 * attend alors l'éventuel prompt plutôt que de dire à tort « changez de navigateur ».
 */
const classifyInstallContext = (): InstallMode => {
    if (typeof navigator === 'undefined') return 'pending';
    if (detectIOS()) return 'ios';
    const ua = navigator.userAgent || '';
    // Navigateurs intégrés dans une app (pas d'installation possible).
    const inApp = /; wv\)|FBAN|FBAV|FB_IAB|Instagram|Line\/|Twitter|Snapchat|Pinterest|GSA\/|MicroMessenger|musical_ly|TikTok/i.test(ua);
    if (inApp) return 'unsupported';
    // Navigateurs sans installation PWA standard.
    const isFirefox = /Firefox\/|FxiOS\//.test(ua);
    const isDesktopSafari = /Safari\//.test(ua) && !/Chrome\/|Chromium\/|CriOS\/|Edg\/|OPR\/|Android/.test(ua);
    if (isFirefox || isDesktopSafari) return 'unsupported';
    // Probablement Chromium : on attend l'éventuel prompt (sinon on reste silencieux).
    return 'pending';
};

export interface InstallPromptApi {
    /** Un prompt natif d'installation est disponible (et l'app n'est pas déjà installée). */
    canInstall: boolean;
    /** L'app tourne déjà en mode installé (standalone). */
    isStandalone: boolean;
    /** iOS : installation manuelle uniquement (pas de prompt natif). */
    isIOS: boolean;
    /** Comment l'utilisateur peut installer selon son navigateur (cf. InstallMode). */
    installMode: InstallMode;
    /** Déclenche le prompt natif. Renvoie le choix de l'utilisateur, ou 'unavailable'. */
    promptInstall: () => Promise<InstallOutcome>;
}

/**
 * Capte l'événement d'installation PWA et expose un petit état + déclencheur.
 * Modèle calqué sur les hooks d'effet existants (useStorageQuotaToasts).
 */
export const useInstallPrompt = (): InstallPromptApi => {
    const deferredRef = useRef<BeforeInstallPromptEvent | null>(null);
    const [canInstall, setCanInstall] = useState(false);
    const [isStandalone, setIsStandalone] = useState<boolean>(detectStandalone);
    const [installMode, setInstallMode] = useState<InstallMode>(classifyInstallContext);
    const isIOS = detectIOS();

    useEffect(() => {
        const onBeforeInstall = (e: Event) => {
            // Empêche la mini-infobar par défaut : on déclenche nous-mêmes au clic.
            e.preventDefault();
            deferredRef.current = e as BeforeInstallPromptEvent;
            setCanInstall(true);
            setInstallMode('prompt');
        };
        const onInstalled = () => {
            deferredRef.current = null;
            setCanInstall(false);
            setIsStandalone(true);
        };

        window.addEventListener('beforeinstallprompt', onBeforeInstall);
        window.addEventListener('appinstalled', onInstalled);

        const mq = window.matchMedia?.('(display-mode: standalone)');
        const onDisplayChange = () => setIsStandalone(detectStandalone());
        mq?.addEventListener?.('change', onDisplayChange);

        return () => {
            window.removeEventListener('beforeinstallprompt', onBeforeInstall);
            window.removeEventListener('appinstalled', onInstalled);
            mq?.removeEventListener?.('change', onDisplayChange);
        };
    }, []);

    const promptInstall = useCallback(async (): Promise<InstallOutcome> => {
        const evt = deferredRef.current;
        if (!evt) return 'unavailable';
        await evt.prompt();
        const choice = await evt.userChoice;
        // L'événement n'est utilisable qu'une fois.
        deferredRef.current = null;
        setCanInstall(false);
        return choice.outcome;
    }, []);

    return { canInstall: canInstall && !isStandalone, isStandalone, isIOS, installMode, promptInstall };
};
