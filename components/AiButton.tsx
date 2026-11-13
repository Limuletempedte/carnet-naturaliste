import React, { useId } from 'react';
import { SparklesIcon } from './icons';

export const AI_OFFLINE_REASON = 'Disponible en ligne uniquement.';

/** « 1 utilisation · N restantes » (ou « 1 utilisation » si le compteur est inconnu). */
export const formatAiCost = (remaining: number | null | undefined): string => {
    if (typeof remaining !== 'number') return '1 utilisation';
    return `1 utilisation · ${remaining} restante${remaining > 1 ? 's' : ''}`;
};

interface AiButtonProps {
    label: string;
    /** Libellé pendant l'attente (« Analyse en cours… »). */
    loadingLabel?: string;
    onClick: () => void;
    isLoading?: boolean;
    isOffline?: boolean;
    disabled?: boolean;
    /** Utilisations restantes connues ; null ou absent : inconnu. */
    remaining?: number | null;
    /** Explication ajoutée sous la mention du quota (en ligne seulement). */
    hint?: React.ReactNode;
    className?: string;
    /** Accès au bouton (pour lui rendre le focus). */
    buttonRef?: React.Ref<HTMLButtonElement>;
}

/**
 * Bouton commun à toutes les actions IA : icône ✨, couleur lavande `ai`,
 * mention de ce que coûte l'action, désactivé hors ligne avec la raison
 * affichée. L'icône ne s'anime que si l'appareil accepte les animations.
 */
const AiButton: React.FC<AiButtonProps> = ({
    label,
    loadingLabel,
    onClick,
    isLoading = false,
    isOffline = false,
    disabled = false,
    remaining,
    hint,
    className = '',
    buttonRef,
}) => {
    const helpId = useId();
    const text = isLoading && loadingLabel ? loadingLabel : label;
    return (
        <div className={className}>
            {/* Pendant l'attente : `aria-disabled` plutôt que `disabled`, pour que
                le focus clavier reste sur le bouton ; le clic est ignoré. */}
            <button
                ref={buttonRef}
                type="button"
                onClick={isLoading ? undefined : onClick}
                disabled={disabled || isOffline}
                aria-disabled={isLoading || undefined}
                aria-label={text}
                aria-describedby={helpId}
                aria-busy={isLoading || undefined}
                className="min-h-[44px] inline-flex items-center gap-2 rounded-full border border-ai-300 bg-ai-50 px-4 py-2 text-sm font-semibold text-ai-700 shadow-sm transition-all hover:bg-ai-100 hover:border-ai-400 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ai-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 disabled:active:scale-100 aria-disabled:cursor-wait aria-disabled:opacity-60 dark:border-ai-400/40 dark:bg-ai-500/15 dark:text-ai-200 dark:hover:bg-ai-500/25 dark:focus-visible:ring-offset-nature-dark-surface"
            >
                <SparklesIcon className={`w-5 h-5 ${isLoading ? 'motion-safe:animate-pulse' : ''}`} />
                {text}
            </button>
            <p id={helpId} className="mt-1 ml-1 text-xs text-gray-500 dark:text-gray-400">
                {isOffline ? AI_OFFLINE_REASON : (
                    <>
                        <span className="font-medium text-ai-700 dark:text-ai-200">{formatAiCost(remaining)}</span>
                        {hint ? <> · {hint}</> : null}
                    </>
                )}
            </p>
        </div>
    );
};

export default AiButton;
