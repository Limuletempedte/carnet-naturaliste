import React, { useState, useEffect } from 'react';
import { useAccessibleDialog } from '../hooks/useAccessibleDialog';
import { safeGet, safeSet, safeRemove } from '../utils/safeStorage';

export const ONBOARDING_SEEN_KEY = 'onboarding-seen-v1';

interface OnboardingTourProps {
    isOpen: boolean;
    onClose: () => void;
}

interface Step {
    title: string;
    body: React.ReactNode;
}

const STEPS: Step[] = [
    {
        title: 'Bienvenue dans votre carnet naturaliste',
        body: (
            <>
                <p>
                    Cette application vous permet d&apos;enregistrer, cartographier et analyser vos observations de faune, flore et fonge — même
                    entièrement hors-ligne.
                </p>
                <p className="mt-2">
                    Laissez-vous guider en 5 étapes, ou passez directement si vous préférez explorer.
                </p>
            </>
        ),
    },
    {
        title: 'Ajoutez votre première observation',
        body: (
            <p>
                Le bouton <strong>« + Observation »</strong> (en haut à droite ou flottant sur mobile) ouvre un formulaire. Seuls l&apos;espèce, la
                date et le nombre sont obligatoires — vous pouvez compléter le reste plus tard.
            </p>
        ),
    },
    {
        title: 'Visualisez vos observations',
        body: (
            <p>
                La barre du bas (mobile) ou les onglets (desktop) donnent accès à la <strong>carte</strong>, aux <strong>statistiques</strong>, au
                <strong> calendrier</strong> et à la <strong>galerie photos</strong>.
            </p>
        ),
    },
    {
        title: 'Badges et séries',
        body: (
            <p>
                Vos observations débloquent automatiquement des badges (Débutant, Explorateur, Ornithologue…) et alimentent un
                <strong> compteur de série</strong> visible dans l&apos;onglet Stats.
            </p>
        ),
    },
    {
        title: 'Sauvegardez tout quand vous voulez',
        body: (
            <p>
                Exportez au format JSON, Excel, PDF, <strong>Darwin Core</strong> (standard scientifique) ou <strong>GeoJSON</strong> (QGIS). Un
                backup ZIP complet (données + photos) est toujours restaurable. Vos données vous appartiennent.
            </p>
        ),
    },
];

export const markOnboardingSeen = (): void => {
    try {
        safeSet(ONBOARDING_SEEN_KEY, 'true');
    } catch {
        // non bloquant
    }
};

export const resetOnboarding = (): void => {
    safeRemove(ONBOARDING_SEEN_KEY);
};

export const isOnboardingSeen = (): boolean => safeGet(ONBOARDING_SEEN_KEY) === 'true';

const OnboardingTour: React.FC<OnboardingTourProps> = ({ isOpen, onClose }) => {
    const [stepIndex, setStepIndex] = useState(0);
    const titleId = 'onboarding-tour-title';
    const { dialogRef, dialogProps } = useAccessibleDialog({ isOpen, onClose, titleId });

    useEffect(() => {
        if (isOpen) setStepIndex(0);
    }, [isOpen]);

    if (!isOpen) return null;

    const step = STEPS[stepIndex];
    const isLast = stepIndex === STEPS.length - 1;

    const handleFinish = () => {
        markOnboardingSeen();
        onClose();
    };

    const handleSkip = () => {
        markOnboardingSeen();
        onClose();
    };

    return (
        <div className="fixed inset-0 z-[70] bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center p-4">
            <div
                ref={dialogRef}
                {...dialogProps}
                className="w-full max-w-lg bg-white dark:bg-nature-dark-surface rounded-2xl shadow-2xl border border-white/20 dark:border-white/10 p-6"
            >
                <div className="flex items-center justify-between mb-2">
                    <span className="text-xs uppercase tracking-wider text-gray-500 dark:text-gray-400">
                        Étape {stepIndex + 1} / {STEPS.length}
                    </span>
                    <button
                        type="button"
                        onClick={handleSkip}
                        className="text-xs text-gray-500 hover:text-nature-green-text"
                    >
                        Passer le tutoriel
                    </button>
                </div>

                <h2 id={titleId} className="text-xl font-bold text-nature-dark dark:text-white mb-3">
                    {step.title}
                </h2>
                <div className="text-sm text-gray-700 dark:text-gray-300 space-y-2 min-h-[80px]">
                    {step.body}
                </div>

                <div className="mt-6 flex justify-between gap-3">
                    <button
                        type="button"
                        onClick={() => setStepIndex(i => Math.max(0, i - 1))}
                        disabled={stepIndex === 0}
                        className="px-4 py-2 rounded-lg bg-gray-200 text-gray-800 dark:bg-white/10 dark:text-white font-semibold disabled:opacity-40"
                    >
                        Précédent
                    </button>
                    {isLast ? (
                        <button
                            type="button"
                            onClick={handleFinish}
                            className="px-4 py-2 rounded-lg bg-nature-green text-white font-semibold hover:bg-nature-dark"
                        >
                            Commencer
                        </button>
                    ) : (
                        <button
                            type="button"
                            onClick={() => setStepIndex(i => Math.min(STEPS.length - 1, i + 1))}
                            className="px-4 py-2 rounded-lg bg-nature-green text-white font-semibold hover:bg-nature-dark"
                        >
                            Suivant
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
};

export default OnboardingTour;
