import React from 'react';
import type { AiCandidate, AiConfidence, AiIdentifyResult } from '../services/aiAssistService';

interface AiIdentificationPanelProps {
    result: AiIdentifyResult;
    onChoose: (candidate: AiCandidate) => void;
    /** Nom scientifique en cours de reprise (vérification du nom). */
    choosingName?: string | null;
}

const CONFIDENCE_LABELS: Record<AiConfidence, { label: string; className: string }> = {
    elevee: { label: 'Confiance élevée', className: 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-200' },
    moyenne: { label: 'Confiance moyenne', className: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200' },
    faible: { label: 'Confiance faible', className: 'bg-gray-200 text-gray-800 dark:bg-gray-700 dark:text-gray-200' },
};

/**
 * Hypothèses de l'assistant. Tout est affiché en texte brut React (jamais de
 * HTML interprété) et rien n'est appliqué au formulaire sans clic sur « Choisir ».
 */
const AiIdentificationPanel: React.FC<AiIdentificationPanelProps> = ({ result, onChoose, choosingName = null }) => (
    <div className="mt-4 space-y-4 rounded-2xl border border-nature-green/30 bg-nature-green/5 p-4 dark:border-green-500/30 dark:bg-green-900/10" aria-live="polite">
        <p className="text-sm font-semibold text-amber-800 dark:text-amber-200">
            Suggestions à vérifier : l'IA peut se tromper. C'est vous qui choisissez.
        </p>

        {result.candidates.length === 0 ? (
            <p className="text-sm text-gray-700 dark:text-gray-300">Aucune espèce identifiable n'a été proposée pour cette photo.</p>
        ) : (
            <ol className="space-y-3">
                {result.candidates.map((candidate, index) => {
                    const confidence = CONFIDENCE_LABELS[candidate.confidence];
                    const title = candidate.commonName || candidate.scientificName;
                    const isChoosing = choosingName === candidate.scientificName;
                    return (
                        <li key={`${candidate.scientificName}-${index}`} className="rounded-xl bg-white/80 p-3 shadow-sm dark:bg-black/20">
                            <div className="flex flex-wrap items-start justify-between gap-2">
                                <div className="min-w-0">
                                    <p className="font-semibold text-nature-dark dark:text-white break-words">{title}</p>
                                    {candidate.commonName && (
                                        <p className="text-sm italic text-gray-600 dark:text-gray-300 break-words">{candidate.scientificName}</p>
                                    )}
                                </div>
                                <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-semibold ${confidence.className}`}>{confidence.label}</span>
                            </div>
                            {candidate.visibleCriteria.length > 0 && (
                                <div className="mt-2">
                                    <p className="text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">Critères visibles</p>
                                    <ul className="list-disc pl-5 text-sm text-gray-700 dark:text-gray-300">
                                        {candidate.visibleCriteria.map((criterion, i) => <li key={i} className="break-words">{criterion}</li>)}
                                    </ul>
                                </div>
                            )}
                            {candidate.criteriaToCheck.length > 0 && (
                                <div className="mt-2">
                                    <p className="text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">À vérifier</p>
                                    <ul className="list-disc pl-5 text-sm text-gray-700 dark:text-gray-300">
                                        {candidate.criteriaToCheck.map((criterion, i) => <li key={i} className="break-words">{criterion}</li>)}
                                    </ul>
                                </div>
                            )}
                            <button
                                type="button"
                                onClick={() => onChoose(candidate)}
                                disabled={choosingName !== null}
                                aria-label={`Choisir ${title}`}
                                className="mt-3 min-h-[40px] rounded-full bg-nature-green px-4 py-1.5 text-sm font-semibold text-white transition-all hover:bg-green-600 disabled:cursor-not-allowed disabled:opacity-50"
                            >
                                {isChoosing ? 'Vérification du nom…' : 'Choisir'}
                            </button>
                        </li>
                    );
                })}
            </ol>
        )}

        {result.photoNote && (
            <p className="text-sm text-gray-700 dark:text-gray-300 break-words">
                <span className="font-semibold">Remarque sur la photo : </span>{result.photoNote}
            </p>
        )}
        <p className="text-xs text-gray-500 dark:text-gray-400">
            Analyses restantes ce mois-ci : {result.remaining}
        </p>
    </div>
);

export default AiIdentificationPanel;
