import React, { useEffect, useRef, useState } from 'react';
import {
    getFeedbackPromptState,
    markFeedbackDisabled,
    markFeedbackShown,
    shouldShowFeedback,
} from '../utils/feedbackPromptState';

const FEEDBACK_EMAIL = 'carnetnaturaliste.app@gmail.com';
const FEEDBACK_MAILTO = `mailto:${FEEDBACK_EMAIL}?subject=${encodeURIComponent('Carnet Naturaliste - Avis / Suggestion')}`;

interface FeedbackPromptHintProps {
    /** Nombre d'observations de l'utilisateur (seuil de déclenchement). */
    observationCount: number;
}

/**
 * Invite d'avis discrète : sollicite l'utilisateur après quelques observations,
 * de façon récurrente mais espacée (cf. utils/feedbackPromptState).
 * Modèle visuel : ancienne bannière d'installation / StorageConsentBanner.
 */
const FeedbackPromptHint: React.FC<FeedbackPromptHintProps> = ({ observationCount }) => {
    const [visible, setVisible] = useState(false);
    const decidedRef = useRef(false);

    useEffect(() => {
        if (decidedRef.current || visible) return;
        const now = Date.now();
        if (shouldShowFeedback(getFeedbackPromptState(), now, { observationCount })) {
            decidedRef.current = true;
            markFeedbackShown(now);
            setVisible(true);
        }
    }, [observationCount, visible]);

    if (!visible) return null;

    const close = () => setVisible(false);
    const disableForever = () => {
        markFeedbackDisabled();
        setVisible(false);
    };

    return (
        <div
            role="dialog"
            aria-label="Votre avis"
            className="fixed z-[55] left-4 right-4 bottom-24 sm:left-6 sm:right-auto sm:bottom-6 sm:max-w-sm bg-white/95 dark:bg-nature-dark-surface/95 backdrop-blur-md border border-white/20 dark:border-white/10 rounded-2xl shadow-xl p-4 animate-fadeIn"
        >
            <div className="flex items-start gap-3">
                <div className="shrink-0 w-10 h-10 rounded-xl bg-nature-green/10 text-nature-green flex items-center justify-center">
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="w-5 h-5" aria-hidden="true">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12.76c0 1.6 1.123 2.994 2.707 3.227 1.087.16 2.185.283 3.293.369V21l4.184-4.183a1.14 1.14 0 01.778-.332 48.294 48.294 0 005.83-.498c1.585-.233 2.708-1.626 2.708-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0012 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018z" />
                    </svg>
                </div>
                <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-nature-dark dark:text-white">Votre avis nous intéresse</p>
                    <p className="text-xs text-gray-600 dark:text-gray-300 mt-0.5">
                        Que pensez-vous de Carnet Naturaliste ? Une idée, une suggestion ou un souci ?
                        Écrivez-nous à <span className="font-medium break-all">{FEEDBACK_EMAIL}</span>.
                    </p>
                    <div className="flex items-center gap-2 mt-3 flex-wrap">
                        <a
                            href={FEEDBACK_MAILTO}
                            onClick={close}
                            className="px-4 py-1.5 rounded-lg bg-nature-green hover:bg-nature-dark text-white text-sm font-semibold shadow-sm transition-all"
                        >
                            Donner mon avis
                        </a>
                        <button
                            onClick={close}
                            className="px-3 py-1.5 rounded-lg text-sm font-medium text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-white/10 transition-colors"
                        >
                            Plus tard
                        </button>
                        <button
                            onClick={disableForever}
                            className="px-2 py-1.5 rounded-lg text-xs font-medium text-gray-400 hover:bg-gray-100 dark:hover:bg-white/10 transition-colors"
                        >
                            Ne plus demander
                        </button>
                    </div>
                </div>
                <button
                    onClick={close}
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

export default FeedbackPromptHint;
