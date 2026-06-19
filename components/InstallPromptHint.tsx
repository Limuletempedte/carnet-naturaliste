import React, { useEffect, useRef, useState } from 'react';
import {
    getInstallHintState,
    markHintDismissed,
    markHintShown,
    shouldShowHint,
} from '../utils/installPromptState';
import type { InstallMode } from '../hooks/useInstallPrompt';

interface InstallPromptHintProps {
    /** Comment l'utilisateur peut installer selon son navigateur. */
    installMode: InstallMode;
    /** L'app est déjà installée (standalone). */
    isStandalone: boolean;
    /** Déclenche l'installation (prompt natif) — utilisé uniquement en mode 'prompt'. */
    onInstall: () => void;
}

const BODY_BY_MODE: Record<Exclude<InstallMode, 'pending'>, string> = {
    prompt: "Accès plus rapide et utilisation hors-ligne, directement depuis votre écran d'accueil.",
    ios: "Sur iPhone/iPad, depuis Safari : touchez « Partager » puis « Sur l'écran d'accueil ».",
    unsupported: "Votre navigateur ne permet pas l'installation. Ouvrez ce site dans Chrome, Edge, Brave, Opera ou Samsung Internet pour pouvoir l'installer.",
};

/**
 * Invite discrète « Installer l'application ».
 * Affichée près de l'affordance d'installation, en respectant les règles
 * anti-harcèlement (cf. utils/installPromptState : 3 fois max, 14 jours, etc.).
 * Le message s'adapte au navigateur (prompt natif, iOS, navigateur non compatible).
 * Modèle visuel : StorageConsentBanner.
 */
const InstallPromptHint: React.FC<InstallPromptHintProps> = ({ installMode, isStandalone, onInstall }) => {
    const [visible, setVisible] = useState(false);
    const decidedRef = useRef(false);

    useEffect(() => {
        if (decidedRef.current || visible) return;
        const eligible = installMode !== 'pending';
        const now = Date.now();
        if (shouldShowHint(getInstallHintState(), now, { isStandalone, eligible })) {
            decidedRef.current = true;
            markHintShown(now);
            setVisible(true);
        }
    }, [installMode, isStandalone, visible]);

    if (!visible || installMode === 'pending') return null;

    const handleDismiss = () => {
        markHintDismissed();
        setVisible(false);
    };

    const handleInstall = () => {
        setVisible(false);
        onInstall();
    };

    return (
        <div
            role="dialog"
            aria-label="Installer l'application"
            className="fixed z-[55] left-4 right-4 bottom-24 sm:left-6 sm:right-auto sm:bottom-6 sm:max-w-sm bg-white/95 dark:bg-nature-dark-surface/95 backdrop-blur-md border border-white/20 dark:border-white/10 rounded-2xl shadow-xl p-4 animate-fadeIn"
        >
            <div className="flex items-start gap-3">
                <div className="shrink-0 w-10 h-10 rounded-xl bg-nature-green/10 text-nature-green flex items-center justify-center">
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="w-5 h-5" aria-hidden="true">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 7.5h-.75A2.25 2.25 0 004.5 9.75v7.5a2.25 2.25 0 002.25 2.25h7.5a2.25 2.25 0 002.25-2.25v-7.5a2.25 2.25 0 00-2.25-2.25h-.75m-6 3 3 3m0 0 3-3m-3 3V3" />
                    </svg>
                </div>
                <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-nature-dark dark:text-white">Installer l'application</p>
                    <p className="text-xs text-gray-600 dark:text-gray-300 mt-0.5">
                        {BODY_BY_MODE[installMode]}
                    </p>
                    <div className="flex items-center gap-2 mt-3">
                        {installMode === 'prompt' ? (
                            <>
                                <button
                                    onClick={handleInstall}
                                    className="px-4 py-1.5 rounded-lg bg-nature-green hover:bg-nature-dark text-white text-sm font-semibold shadow-sm transition-all"
                                >
                                    Installer
                                </button>
                                <button
                                    onClick={handleDismiss}
                                    className="px-3 py-1.5 rounded-lg text-sm font-medium text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-white/10 transition-colors"
                                >
                                    Non merci
                                </button>
                            </>
                        ) : (
                            <button
                                onClick={handleDismiss}
                                className="px-4 py-1.5 rounded-lg bg-nature-green hover:bg-nature-dark text-white text-sm font-semibold shadow-sm transition-all"
                            >
                                Compris
                            </button>
                        )}
                    </div>
                </div>
                <button
                    onClick={handleDismiss}
                    aria-label="Fermer"
                    className="shrink-0 p-1 -mt-1 -mr-1 rounded-full text-gray-400 hover:bg-gray-100 dark:hover:bg-white/10 transition-colors"
                >
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4" aria-hidden="true">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                    </svg>
                </button>
            </div>
        </div>
    );
};

export default InstallPromptHint;
