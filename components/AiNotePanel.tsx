import React, { useId } from 'react';
import type { AiNoteField } from '../services/aiAssistService';
import type { NoteProposal, NoteProposalKey } from '../utils/aiNoteMapping';
import { SparklesIcon } from './icons';

/** Noms en clair des champs retirés par la fonction (`dropped`). */
const DROPPED_LABELS: Record<AiNoteField, string> = {
    speciesName: "nom de l'espèce",
    scientificName: 'nom latin',
    count: "nombre d'individus",
    maleCount: 'mâles',
    femaleCount: 'femelles',
    dateExpr: 'date',
    time: 'heure',
    location: 'lieu-dit',
    weather: 'météo',
    habitat: 'habitat',
    comportement: 'comportement',
    observationCondition: 'condition',
    age: 'âge',
    sexe: 'sexe',
    phenology: 'phénologie',
    otherSpecies: 'autres espèces',
    remainder: 'reste de la note',
};

interface AiNotePanelProps {
    proposals: readonly NoteProposal[];
    selection: ReadonlySet<NoteProposalKey>;
    onToggle: (key: NoteProposalKey) => void;
    keepNote: boolean;
    onKeepNoteChange: (keep: boolean) => void;
    /** La note figure déjà dans le commentaire (rien ne sera ajouté). */
    noteAlreadyInComment: boolean;
    otherSpecies: readonly string[];
    dropped: readonly AiNoteField[];
    onApply: () => void;
    onDiscard: () => void;
    /** Application en cours (vérification du nom d'espèce). */
    isApplying?: boolean;
    onCancelApply?: () => void;
    headingRef?: React.Ref<HTMLHeadingElement>;
}

/**
 * Relecture de la note : chaque champ proposé montre la valeur actuelle et la
 * valeur proposée, avec une case à cocher. Tout est affiché en TEXTE React :
 * une balise écrite dans la note (`<img onerror>`) s'affiche telle quelle,
 * jamais interprétée. Rien n'est appliqué sans clic sur « Appliquer la sélection ».
 */
const AiNotePanel: React.FC<AiNotePanelProps> = ({
    proposals,
    selection,
    onToggle,
    keepNote,
    onKeepNoteChange,
    noteAlreadyInComment,
    otherSpecies,
    dropped,
    onApply,
    onDiscard,
    isApplying = false,
    onCancelApply,
    headingRef,
}) => {
    const baseId = useId();
    // Le reste de la note fait doublon avec la note entière gardée.
    const visible = proposals.filter(proposal => !(keepNote && proposal.key === 'remainder'));
    const selectedCount = visible.filter(proposal => selection.has(proposal.key)).length;
    const willKeepNote = keepNote && !noteAlreadyInComment;
    const nothingToApply = selectedCount === 0 && !willKeepNote;

    return (
        <section
            aria-labelledby={`${baseId}-title`}
            data-testid="ai-note-panel"
            className="space-y-4 rounded-2xl border border-ai-200 bg-ai-50/60 p-3 sm:p-4 dark:border-ai-400/30 dark:bg-ai-500/10"
        >
            <div className="flex items-start gap-2">
                <SparklesIcon className="mt-0.5 h-4 w-4 shrink-0 text-ai-600 dark:text-ai-300" />
                <div>
                    <h4 id={`${baseId}-title`} ref={headingRef} tabIndex={-1} className="font-semibold text-nature-dark focus:outline-none dark:text-white">
                        Champs proposés
                    </h4>
                    <p className="text-sm text-amber-800 dark:text-amber-200">
                        À relire : l'assistant peut se tromper. Cochez ce que vous voulez appliquer.
                    </p>
                </div>
            </div>

            {visible.length === 0 ? (
                <p className="text-sm text-gray-700 dark:text-gray-300" data-testid="ai-note-nothing">
                    Aucun champ de la fiche à modifier.
                </p>
            ) : (
                <ul className="space-y-2">
                    {visible.map(proposal => {
                        const id = `${baseId}-${proposal.key}`;
                        return (
                            <li key={proposal.key} className="rounded-xl bg-white/85 p-3 shadow-sm dark:bg-black/25">
                                <label htmlFor={id} className="flex cursor-pointer items-start gap-3">
                                    <input
                                        id={id}
                                        type="checkbox"
                                        checked={selection.has(proposal.key)}
                                        onChange={() => onToggle(proposal.key)}
                                        disabled={isApplying}
                                        aria-describedby={`${id}-values`}
                                        className="mt-1 h-5 w-5 shrink-0 accent-ai-600"
                                    />
                                    <span className="min-w-0 flex-1">
                                        <span className="block text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">{proposal.label}</span>
                                        <span id={`${id}-values`} className="mt-1 block space-y-0.5 text-sm">
                                            <span className="block break-words font-semibold text-nature-dark dark:text-white">
                                                <span className="sr-only">Proposé : </span>{proposal.proposed}
                                            </span>
                                            <span className="block break-words text-gray-600 dark:text-gray-300">
                                                Actuel : {proposal.current}
                                            </span>
                                            {proposal.detail && (
                                                <span className="block break-words text-xs text-gray-600 dark:text-gray-300">{proposal.detail}</span>
                                            )}
                                        </span>
                                    </span>
                                </label>
                            </li>
                        );
                    })}
                </ul>
            )}

            {otherSpecies.length > 0 && (
                <div className="text-sm text-gray-700 dark:text-gray-300" data-testid="ai-note-other-species">
                    <p className="font-semibold">Autres espèces citées (pour information, rien n'est créé) :</p>
                    <ul className="mt-1 flex flex-wrap gap-1.5">
                        {otherSpecies.map(name => (
                            <li key={name} className="break-words rounded-full bg-white/80 px-2.5 py-1 text-xs font-medium text-nature-dark dark:bg-white/10 dark:text-white">{name}</li>
                        ))}
                    </ul>
                </div>
            )}

            {dropped.length > 0 && (
                <p className="text-xs text-gray-600 dark:text-gray-400" data-testid="ai-note-dropped">
                    Écarté car la réponse n'était pas valable : {dropped.map(field => DROPPED_LABELS[field]).join(', ')}.
                </p>
            )}

            <label className="flex items-start gap-3 text-sm font-medium text-nature-dark dark:text-white">
                <input
                    type="checkbox"
                    checked={keepNote}
                    onChange={(e) => onKeepNoteChange(e.target.checked)}
                    disabled={isApplying}
                    className="mt-0.5 h-5 w-5 shrink-0 accent-ai-600"
                />
                <span>
                    Garder la note dans le commentaire
                    <span className="block text-xs font-normal text-gray-600 dark:text-gray-300">
                        {noteAlreadyInComment ? 'Elle y figure déjà : rien ne sera ajouté.' : 'Ajoutée à la fin du commentaire : rien n’est perdu.'}
                    </span>
                </span>
            </label>

            <div className="flex flex-wrap items-center gap-2">
                <button
                    type="button"
                    onClick={isApplying ? undefined : onApply}
                    disabled={nothingToApply}
                    aria-disabled={isApplying || undefined}
                    aria-busy={isApplying || undefined}
                    className="min-h-[44px] rounded-full bg-ai-600 px-5 py-2 text-sm font-semibold text-white transition-colors hover:bg-ai-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ai-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 aria-disabled:cursor-wait aria-disabled:opacity-70 dark:focus-visible:ring-offset-nature-dark-surface"
                >
                    {isApplying ? 'Vérification du nom…' : 'Appliquer la sélection'}
                </button>
                {isApplying && onCancelApply ? (
                    <button type="button" onClick={onCancelApply} className="min-h-[44px] rounded-full px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-black/5 dark:text-gray-200 dark:hover:bg-white/10">
                        Annuler
                    </button>
                ) : (
                    <button type="button" onClick={onDiscard} className="min-h-[44px] rounded-full px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-black/5 dark:text-gray-200 dark:hover:bg-white/10">
                        Ne rien appliquer
                    </button>
                )}
            </div>
        </section>
    );
};

export default AiNotePanel;
