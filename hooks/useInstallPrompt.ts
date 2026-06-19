import { useCallback, useEffect, useRef, useState } from 'react';
import { markInstalled } from '../utils/installPromptState';

/**
 * Événement `beforeinstallprompt` (Chrome/Edge desktop + Android). Non typé par
 * lib.dom de façon stable selon les versions → on déclare le minimum utilisé.
 */
interface BeforeInstallPromptEvent extends Event {
    prompt: () => Promise<void>;
    userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

export type InstallOutcome = 'accepted' | 'dismissed' | 'unavailable';

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

export interface InstallPromptApi {
    /** Un prompt natif d'installation est disponible (et l'app n'est pas déjà installée). */
    canInstall: boolean;
    /** L'app tourne déjà en mode installé (standalone). */
    isStandalone: boolean;
    /** iOS : installation manuelle uniquement (pas de prompt natif). */
    isIOS: boolean;
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
    const isIOS = detectIOS();

    useEffect(() => {
        const onBeforeInstall = (e: Event) => {
            // Empêche la mini-infobar par défaut : on déclenche nous-mêmes au clic.
            e.preventDefault();
            deferredRef.current = e as BeforeInstallPromptEvent;
            setCanInstall(true);
        };
        const onInstalled = () => {
            deferredRef.current = null;
            setCanInstall(false);
            setIsStandalone(true);
            markInstalled();
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
        if (choice.outcome === 'accepted') markInstalled();
        return choice.outcome;
    }, []);

    return { canInstall: canInstall && !isStandalone, isStandalone, isIOS, promptInstall };
};
