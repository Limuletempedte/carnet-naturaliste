import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import {
    AI_NOTE_LIMITS,
    AiAssistError,
    callAiText,
    getAiOverview,
    giveConsent,
    hasCurrentConsent,
    hasOutdatedConsent,
    isEmptyNoteResult,
    parseNoteResult,
    rememberRemaining,
    type AiNoteResult,
    type AiOverview,
} from '../services/aiAssistService';
import type { ObservationFormData } from '../services/observationFormService';
import { isSessionCurrent, type SessionContext } from '../services/sessionScope';
import {
    AI_NOTE_CHOICES,
    buildNoteProposals,
    commentContains,
    initialNoteSelection,
    type NoteProposalKey,
} from '../utils/aiNoteMapping';
import { dateToIsoLocal } from '../utils/dateUtils';
import AiButton, { AI_OFFLINE_REASON } from './AiButton';
import AiConsentCard from './AiConsentCard';
import AiNotePanel from './AiNotePanel';

/** Ce que le formulaire a fait de la sélection. */
export interface NoteApplyReport {
    /** Libellés des champs appliqués. */
    applied: string[];
    /** Avertissements (nom introuvable, répartition écartée…). */
    warnings: string[];
}

export interface NoteApplyRequest {
    result: AiNoteResult;
    selection: ReadonlySet<NoteProposalKey>;
    keepNote: boolean;
    noteText: string;
    /** Date du formulaire à l'ouverture du panneau (référence des dates relatives). */
    referenceDate: string;
    today: string;
    signal: AbortSignal;
}

interface AiNoteAssistProps {
    formData: ObservationFormData;
    /** Date et heure de départ d'une NOUVELLE fiche (comptent comme « par défaut »). */
    formDefaults: Pick<ObservationFormData, 'date' | 'time'> | null;
    /** Fiche existante : propose de reprendre son commentaire comme note. */
    isEditing: boolean;
    session: SessionContext | null;
    isOffline?: boolean;
    remaining: number | null;
    onRemainingChange: (remaining: number | null) => void;
    /** Applique la sélection (espèce d'abord) ; null si rien n'a été appliqué (annulé). */
    onApply: (request: NoteApplyRequest) => Promise<NoteApplyReport | null>;
    /** Revient à l'état d'avant la dernière application. */
    onUndo: () => void;
    /** Garde la note dans le commentaire, sans l'assistant (hors ligne). */
    onKeepNoteOnly: (noteText: string) => void;
    onOpenAiAccess?: () => void;
}

type Phase =
    | { kind: 'idle' }
    | { kind: 'checking' }
    | { kind: 'consent'; outdated: boolean }
    | { kind: 'analyzing' }
    | { kind: 'review'; result: AiNoteResult; snapshot: ObservationFormData }
    | { kind: 'applying'; result: AiNoteResult; snapshot: ObservationFormData }
    | { kind: 'applied'; result: AiNoteResult; snapshot: ObservationFormData; report: NoteApplyReport }
    | { kind: 'empty' }
    | { kind: 'needs_access'; message: string }
    | { kind: 'error'; message: string };

const textareaClass = 'w-full rounded-xl border-none bg-nature-beige p-3 text-base text-nature-dark placeholder-gray-500 transition-all focus:ring-2 focus:ring-ai-500 dark:bg-black/20 dark:text-white dark:placeholder-gray-400';
const quietButton = 'min-h-[44px] rounded-full px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-black/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ai-500 dark:text-gray-200 dark:hover:bg-white/10';
const linkButton = 'min-h-[44px] text-sm font-semibold text-ai-700 underline underline-offset-2 dark:text-ai-200';

const accessMessage = (overview: AiOverview): string | null => {
    switch (overview.access.kind) {
        case 'approved': return null;
        case 'pending': return "Votre demande d'accès à l'assistant attend encore sa validation.";
        case 'refused':
        case 'revoked': return "L'assistant n'est pas ouvert pour votre compte.";
        case 'consent_outdated': return "Les conditions de l'assistant ont changé : renouvelez votre accord dans « Assistant IA ».";
        default: return "Le remplissage depuis une note fait partie de l'assistant IA, sur demande d'accès.";
    }
};

/**
 * « Remplir depuis une note » (formulaire d'observation, section
 * Identification). La personne tape ou dicte une note ; l'assistant propose
 * des champs ; elle relit et choisit. Rien n'est appliqué sans son clic.
 *
 * Garde-fous contre une utilisation payée sans le vouloir (défauts relevés
 * sur le bilan) : un seul envoi à la fois (verrou posé dès le clic), aucun
 * envoi pendant l'enregistrement d'un accord, « Annuler » arrête vraiment la
 * suite, rien n'est envoyé hors ligne. La note reste dans l'état du
 * composant (jamais dans le stockage du navigateur) et n'est jamais journalisée.
 */
const AiNoteAssist: React.FC<AiNoteAssistProps> = ({
    formData,
    formDefaults,
    isEditing,
    session,
    isOffline = false,
    remaining,
    onRemainingChange,
    onApply,
    onUndo,
    onKeepNoteOnly,
    onOpenAiAccess,
}) => {
    const baseId = useId();
    const [open, setOpen] = useState(false);
    const [noteText, setNoteText] = useState('');
    const [phase, setPhase] = useState<Phase>({ kind: 'idle' });
    const [selection, setSelection] = useState<Set<NoteProposalKey>>(new Set());
    const [keepNote, setKeepNote] = useState(true);
    const [consentWorking, setConsentWorking] = useState(false);
    const [consentError, setConsentError] = useState<string | null>(null);
    const [announcement, setAnnouncement] = useState('');
    /**
     * Verrou synchrone : un seul parcours (« Analyser », accord, « Appliquer »)
     * à la fois. Il porte le numéro du parcours qui le tient : un parcours
     * annulé ne peut pas libérer le verrou d'un parcours plus récent.
     */
    const busyRef = useRef<number | null>(null);
    const formDataRef = useRef(formData);
    /** Incrémenté par « Annuler », la fermeture ou le démontage : la suite s'arrête. */
    const runRef = useRef(0);
    const abortRef = useRef<AbortController | null>(null);
    const applyAbortRef = useRef<AbortController | null>(null);
    const openButtonRef = useRef<HTMLButtonElement | null>(null);
    const analyzeButtonRef = useRef<HTMLButtonElement | null>(null);
    const textareaRef = useRef<HTMLTextAreaElement | null>(null);
    const panelHeadingRef = useRef<HTMLHeadingElement | null>(null);
    const appliedRef = useRef<HTMLParagraphElement | null>(null);
    const focusTarget = useRef<'analyze' | 'panel' | 'applied' | 'textarea' | 'open' | null>(null);

    const today = dateToIsoLocal(new Date());
    const tooLong = noteText.length > AI_NOTE_LIMITS.maxInputChars;
    const isEmptyNote = noteText.trim().length === 0;
    const reviewing = phase.kind === 'review' || phase.kind === 'applying';
    const reviewResult = reviewing ? phase.result : null;
    const reviewSnapshot = reviewing ? phase.snapshot : null;

    // Les propositions suivent le formulaire : la valeur « actuelle » reste juste.
    const proposals = useMemo(() => (reviewResult && reviewSnapshot
        ? buildNoteProposals(reviewResult, { snapshot: reviewSnapshot, current: formData, defaults: formDefaults, today })
        : []), [reviewResult, reviewSnapshot, formData, formDefaults, today]);

    useEffect(() => { formDataRef.current = formData; }, [formData]);

    const lock = (): number | null => {
        if (busyRef.current !== null) return null;
        const runId = runRef.current + 1;
        runRef.current = runId;
        busyRef.current = runId;
        return runId;
    };
    const unlock = (runId: number) => {
        if (busyRef.current === runId) busyRef.current = null;
    };

    // Démontage : la suite d'un parcours en cours s'arrête.
    useEffect(() => () => {
        runRef.current += 1;
        abortRef.current?.abort();
        applyAbortRef.current?.abort();
    }, []);

    // Focus rendu au bon endroit après chaque étape.
    useEffect(() => {
        const target = focusTarget.current;
        if (!target) return;
        const element = {
            analyze: analyzeButtonRef.current,
            panel: panelHeadingRef.current,
            applied: appliedRef.current,
            textarea: textareaRef.current,
            open: openButtonRef.current,
        }[target];
        if (!element) return;
        focusTarget.current = null;
        element.focus();
    }, [phase, open]);

    const loadOverview = async (context: SessionContext): Promise<AiOverview | null> => {
        try {
            const next = await getAiOverview(context);
            if (!isSessionCurrent(context)) return null;
            onRemainingChange(next.access.kind === 'approved' ? next.access.remaining : null);
            return next;
        } catch (error) {
            if (!isSessionCurrent(context)) return null;
            setPhase({ kind: 'error', message: error instanceof AiAssistError ? error.message : "Impossible de joindre l'assistant. Réessayez plus tard." });
            setAnnouncement('');
            return null;
        }
    };

    /** Envoie la note. Ne relance jamais un appel déjà parti. */
    const analyze = async (context: SessionContext, runId: number, text: string) => {
        if (abortRef.current || runRef.current !== runId) return;
        const controller = new AbortController();
        abortRef.current = controller;
        setPhase({ kind: 'analyzing' });
        setAnnouncement('Analyse de la note en cours…');
        try {
            const response = await callAiText('note', { text }, { signal: controller.signal }, context);
            if (controller.signal.aborted || runRef.current !== runId || !isSessionCurrent(context)) return;
            onRemainingChange(response.remaining);
            rememberRemaining(response.remaining, context);
            const result = parseNoteResult(response.result, AI_NOTE_CHOICES);
            if (!result) {
                setPhase({ kind: 'error', message: new AiAssistError('invalid_output', { feature: 'note' }).message });
                setAnnouncement('');
                return;
            }
            if (isEmptyNoteResult(result)) {
                setPhase({ kind: 'empty' });
                setAnnouncement("L'assistant n'a rien trouvé à reporter dans la fiche.");
                focusTarget.current = 'textarea';
                return;
            }
            const latest = formDataRef.current;
            const snapshot = { ...latest, gps: { ...latest.gps } };
            const initial = buildNoteProposals(result, { snapshot, current: snapshot, defaults: formDefaults, today: dateToIsoLocal(new Date()) });
            setSelection(initialNoteSelection(initial));
            setKeepNote(true);
            setPhase({ kind: 'review', result, snapshot });
            setAnnouncement(`${initial.length} champ${initial.length > 1 ? 's' : ''} proposé${initial.length > 1 ? 's' : ''}, à relire avant d'appliquer.`);
            focusTarget.current = 'panel';
        } catch (error) {
            if (controller.signal.aborted || runRef.current !== runId || !isSessionCurrent(context)) return;
            setAnnouncement('');
            const wrapped = error instanceof AiAssistError ? error : new AiAssistError('unknown', { feature: 'note' });
            if (typeof wrapped.remaining === 'number') {
                onRemainingChange(wrapped.remaining);
                rememberRemaining(wrapped.remaining, context);
            }
            if (wrapped.code === 'consent_outdated') {
                const refreshed = await loadOverview(context);
                if (refreshed && runRef.current === runId) setPhase({ kind: 'consent', outdated: true });
                return;
            }
            if (wrapped.code === 'not_approved') {
                onRemainingChange(null);
                setPhase({ kind: 'needs_access', message: wrapped.message });
                return;
            }
            setPhase({ kind: 'error', message: wrapped.message });
            focusTarget.current = 'analyze';
        } finally {
            if (abortRef.current === controller) abortRef.current = null;
        }
    };

    const handleAnalyze = async () => {
        // Verrou SYNCHRONE, posé avant le premier `await` : un double clic ne
        // peut pas lancer deux envois (chacun coûterait une utilisation).
        if (isOffline || busyRef.current !== null || isEmptyNote || tooLong) return;
        if (!session || !isSessionCurrent(session)) {
            setPhase({ kind: 'error', message: 'Connectez-vous pour utiliser l’assistant.' });
            return;
        }
        const context = session;
        const runId = lock();
        if (runId === null) return;
        const text = noteText;
        setConsentError(null);
        setPhase({ kind: 'checking' });
        setAnnouncement('Vérification de votre accès…');
        try {
            // Toujours relu : l'accord a pu changer dans « Assistant IA » entre-temps.
            const current = await loadOverview(context);
            if (!current || runRef.current !== runId) return;
            const blocked = accessMessage(current);
            if (blocked) {
                setPhase({ kind: 'needs_access', message: blocked });
                setAnnouncement('');
                return;
            }
            if (!hasCurrentConsent(current, 'note')) {
                setPhase({ kind: 'consent', outdated: hasOutdatedConsent(current, 'note') });
                setAnnouncement('');
                return;
            }
            await analyze(context, runId, text);
        } finally {
            unlock(runId);
        }
    };

    /** « Annuler » pendant la vérification ou l'attente : rien ne sera appliqué. */
    const handleStop = () => {
        runRef.current += 1;
        abortRef.current?.abort();
        abortRef.current = null;
        busyRef.current = null;
        setPhase({ kind: 'error', message: new AiAssistError('cancelled', { feature: 'note' }).message });
        setAnnouncement('');
        focusTarget.current = 'analyze';
    };

    // Pendant l'enregistrement d'un accord, le verrou reste tenu par ce
    // parcours : « Annuler » n'ouvre pas la porte à un second envoi.
    const handleCancelConsent = () => {
        runRef.current += 1;
        setPhase({ kind: 'idle' });
        focusTarget.current = 'analyze';
    };

    const handleAcceptConsent = async () => {
        if (!session || !isSessionCurrent(session)) return;
        const context = session;
        const runId = lock();
        if (runId === null) return;
        const text = noteText;
        const stillWanted = () => isSessionCurrent(context) && runRef.current === runId;
        setConsentWorking(true);
        setConsentError(null);
        try {
            await giveConsent('note', context);
            // « Annuler » pendant l'enregistrement : l'accord est donné, mais rien n'est envoyé.
            if (!stillWanted()) return;
            const refreshed = await loadOverview(context);
            if (!refreshed || !stillWanted()) return;
            setConsentWorking(false);
            await analyze(context, runId, text);
        } catch (error) {
            if (!stillWanted()) return;
            setConsentError(error instanceof AiAssistError ? error.message : 'Votre accord n’a pas pu être enregistré. Réessayez.');
        } finally {
            unlock(runId);
            if (isSessionCurrent(context)) setConsentWorking(false);
        }
    };

    const handleToggle = (key: NoteProposalKey) => {
        setSelection(previous => {
            const next = new Set(previous);
            if (next.has(key)) next.delete(key);
            else next.add(key);
            return next;
        });
    };

    const handleApply = async () => {
        if (phase.kind !== 'review') return;
        const runId = lock();
        if (runId === null) return;
        const { result, snapshot } = phase;
        const controller = new AbortController();
        applyAbortRef.current = controller;
        // Seules les cases visibles comptent (le reste de la note est masqué
        // quand la note entière est gardée).
        const visibleKeys = new Set(proposals.map(proposal => proposal.key));
        const chosen = new Set([...selection].filter(key => visibleKeys.has(key)));
        setPhase({ kind: 'applying', result, snapshot });
        try {
            const report = await onApply({
                result,
                selection: chosen,
                keepNote,
                noteText,
                referenceDate: snapshot.date,
                today: dateToIsoLocal(new Date()),
                signal: controller.signal,
            });
            if (runRef.current !== runId || controller.signal.aborted) return;
            if (!report) {
                setPhase({ kind: 'review', result, snapshot });
                setAnnouncement('Rien n’a été appliqué.');
                focusTarget.current = 'panel';
                return;
            }
            setPhase({ kind: 'applied', result, snapshot, report });
            setAnnouncement(report.applied.length > 0
                ? `Appliqué : ${report.applied.join(', ')}.${report.warnings.length > 0 ? ` ${report.warnings.join(' ')}` : ''}`
                : 'Rien n’a été appliqué.');
            focusTarget.current = 'applied';
        } finally {
            if (applyAbortRef.current === controller) applyAbortRef.current = null;
            unlock(runId);
        }
    };

    const handleCancelApply = () => {
        if (phase.kind !== 'applying') return;
        runRef.current += 1;
        applyAbortRef.current?.abort();
        applyAbortRef.current = null;
        busyRef.current = null;
        setPhase({ kind: 'review', result: phase.result, snapshot: phase.snapshot });
        setAnnouncement('Application annulée : rien n’a été appliqué.');
        focusTarget.current = 'panel';
    };

    const handleUndo = () => {
        if (phase.kind !== 'applied') return;
        onUndo();
        setPhase({ kind: 'review', result: phase.result, snapshot: phase.snapshot });
        setAnnouncement('Application annulée : la fiche est revenue à son état d’avant.');
        focusTarget.current = 'panel';
    };

    const resetToEditing = () => {
        setPhase({ kind: 'idle' });
        setAnnouncement('');
        focusTarget.current = 'textarea';
    };

    const handleCloseApplied = () => {
        setNoteText('');
        setPhase({ kind: 'idle' });
        setOpen(false);
        setAnnouncement('');
        focusTarget.current = 'open';
    };

    const handleToggleOpen = () => {
        if (open) {
            // Replier ne perd pas la note (gardée en mémoire), mais arrête un parcours en cours.
            if (phase.kind === 'checking' || phase.kind === 'analyzing') handleStop();
            if (phase.kind === 'applying') handleCancelApply();
            setOpen(false);
            focusTarget.current = 'open';
            return;
        }
        setOpen(true);
        focusTarget.current = 'textarea';
    };

    const handleUseComment = () => {
        setNoteText(formData.comment);
        if (phase.kind === 'empty' || phase.kind === 'error') setPhase({ kind: 'idle' });
        focusTarget.current = 'textarea';
    };

    const handleKeepOnly = () => {
        if (isEmptyNote) return;
        onKeepNoteOnly(noteText);
        setAnnouncement('Note ajoutée au commentaire.');
    };

    const isWaiting = phase.kind === 'checking' || phase.kind === 'analyzing';
    const lockedText = isWaiting || phase.kind === 'consent' || reviewing || phase.kind === 'applied';
    const counterId = `${baseId}-counter`;
    const helpId = `${baseId}-help`;
    const commentAvailable = isEditing && formData.comment.trim().length > 0;
    const noteInComment = commentContains(formData.comment, noteText);

    return (
        <div className="col-span-full space-y-3" data-testid="ai-note">
            <AiButton
                label={open ? 'Replier la note' : 'Remplir depuis une note'}
                onClick={handleToggleOpen}
                isOffline={isOffline && !open}
                remaining={remaining}
                hint="tapez ou dictez ce que vous avez vu, l'assistant propose des champs à relire"
                buttonRef={openButtonRef}
            />

            {open && (
                <div className="space-y-3 rounded-2xl border border-ai-200 bg-white/70 p-3 sm:p-4 dark:border-ai-400/30 dark:bg-white/5" data-testid="ai-note-zone">
                    {!reviewing && phase.kind !== 'applied' && (
                        <>
                            <div>
                                <label htmlFor={`${baseId}-text`} className="mb-1 ml-1 block text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                                    Votre note
                                </label>
                                <textarea
                                    ref={textareaRef}
                                    id={`${baseId}-text`}
                                    value={noteText}
                                    onChange={(e) => setNoteText(e.target.value)}
                                    maxLength={AI_NOTE_LIMITS.maxInputChars}
                                    readOnly={lockedText}
                                    rows={4}
                                    autoComplete="off"
                                    placeholder="Ex. : 3 mésanges charbonnières au bord de l'étang ce matin vers 8 h, ensoleillé"
                                    aria-describedby={`${helpId} ${counterId}`}
                                    aria-invalid={tooLong || undefined}
                                    className={textareaClass}
                                />
                                <div className="mt-1 flex flex-wrap items-start justify-between gap-x-3 gap-y-1 px-1 text-xs">
                                    <div id={helpId} className="space-y-1 text-gray-600 dark:text-gray-300">
                                        <p>Vous pouvez dicter avec le micro de votre clavier.</p>
                                        <p className="font-medium text-amber-800 dark:text-amber-200">
                                            Évitez les noms de personnes et la localisation précise d'espèces sensibles : la note est envoyée telle quelle.
                                        </p>
                                    </div>
                                    <p id={counterId} className={`shrink-0 tabular-nums ${tooLong ? 'font-semibold text-red-600 dark:text-red-400' : 'text-gray-500 dark:text-gray-400'}`}>
                                        {noteText.length} / {AI_NOTE_LIMITS.maxInputChars}
                                    </p>
                                </div>
                                {tooLong && (
                                    <p role="alert" className="mt-1 px-1 text-xs text-red-600 dark:text-red-400">
                                        La note dépasse 1 000 caractères : raccourcissez-la avant de l'analyser.
                                    </p>
                                )}
                            </div>

                            {commentAvailable && !lockedText && (
                                <button type="button" onClick={handleUseComment} className={linkButton}>
                                    Reprendre le commentaire de la fiche comme note
                                </button>
                            )}

                            {phase.kind === 'consent' ? (
                                <AiConsentCard
                                    feature="note"
                                    outdated={phase.outdated}
                                    onAccept={handleAcceptConsent}
                                    onCancel={handleCancelConsent}
                                    onOpenAssistant={onOpenAiAccess}
                                    isWorking={consentWorking}
                                    isOffline={isOffline}
                                    error={consentError}
                                    acceptLabel="Accepter et analyser"
                                    autoFocus
                                />
                            ) : (
                                <div className="flex flex-wrap items-start gap-2">
                                    <AiButton
                                        label="Analyser la note"
                                        loadingLabel={phase.kind === 'checking' ? 'Vérification…' : 'Analyse en cours…'}
                                        onClick={() => void handleAnalyze()}
                                        isLoading={isWaiting}
                                        isOffline={isOffline}
                                        disabled={isEmptyNote || tooLong || consentWorking}
                                        remaining={remaining}
                                        hint="rien n'est appliqué sans votre choix"
                                        buttonRef={analyzeButtonRef}
                                    />
                                    {isWaiting && (
                                        <button type="button" onClick={handleStop} className={quietButton}>
                                            Annuler
                                        </button>
                                    )}
                                </div>
                            )}

                            {isOffline && !isEmptyNote && !isWaiting && (
                                <div className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-900/20 dark:text-amber-100">
                                    <p>{AI_OFFLINE_REASON} Vous pouvez garder la note dans le commentaire et l'analyser plus tard.</p>
                                    <button type="button" onClick={handleKeepOnly} disabled={noteInComment} className={`${linkButton} disabled:opacity-50 disabled:no-underline`}>
                                        {noteInComment ? 'Note déjà dans le commentaire' : 'Mettre la note dans le commentaire'}
                                    </button>
                                </div>
                            )}
                        </>
                    )}

                    {phase.kind === 'empty' && (
                        <p role="alert" className="rounded-xl bg-ai-50 p-3 text-sm text-nature-dark dark:bg-ai-500/10 dark:text-white" data-testid="ai-note-empty">
                            L'assistant n'a trouvé dans cette note aucune information d'observation à reporter dans la fiche. Rien n'a été modifié.
                        </p>
                    )}

                    {phase.kind === 'needs_access' && (
                        <div role="alert" className="rounded-xl bg-ai-50 p-3 text-sm text-nature-dark dark:bg-ai-500/10 dark:text-white">
                            <p>{phase.message}</p>
                            {onOpenAiAccess && (
                                <button type="button" onClick={onOpenAiAccess} className={linkButton}>
                                    Ouvrir « Assistant IA »
                                </button>
                            )}
                        </div>
                    )}

                    {phase.kind === 'error' && (
                        <p role="alert" className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-900/20 dark:text-amber-100">{phase.message}</p>
                    )}

                    {reviewing && (
                        <>
                            <details className="text-sm text-gray-700 dark:text-gray-300">
                                <summary className="cursor-pointer font-semibold">Votre note</summary>
                                <p className="mt-2 whitespace-pre-line break-words rounded-xl bg-white/70 p-3 dark:bg-black/20">{noteText}</p>
                            </details>
                            <AiNotePanel
                                proposals={proposals}
                                selection={selection}
                                onToggle={handleToggle}
                                keepNote={keepNote}
                                onKeepNoteChange={setKeepNote}
                                noteAlreadyInComment={noteInComment}
                                otherSpecies={phase.result.otherSpecies}
                                dropped={phase.result.dropped}
                                onApply={() => void handleApply()}
                                onDiscard={resetToEditing}
                                isApplying={phase.kind === 'applying'}
                                onCancelApply={handleCancelApply}
                                headingRef={panelHeadingRef}
                            />
                        </>
                    )}

                    {phase.kind === 'applied' && (
                        <div className="space-y-3 rounded-xl bg-ai-50 p-3 text-sm text-nature-dark dark:bg-ai-500/10 dark:text-white" data-testid="ai-note-applied">
                            <p ref={appliedRef} tabIndex={-1} className="focus:outline-none">
                                {phase.report.applied.length > 0
                                    ? `Appliqué : ${phase.report.applied.join(', ')}. Vérifiez la fiche avant de l'enregistrer.`
                                    : 'Rien n’a été appliqué.'}
                            </p>
                            {phase.report.warnings.map(warning => (
                                <p key={warning} className="text-amber-900 dark:text-amber-100">{warning}</p>
                            ))}
                            <div className="flex flex-wrap gap-2">
                                <button type="button" onClick={handleUndo} className="min-h-[44px] rounded-full border border-ai-300 px-4 py-2 text-sm font-semibold text-ai-700 hover:bg-ai-100 dark:border-ai-400/40 dark:text-ai-200 dark:hover:bg-ai-500/20">
                                    Annuler l'application
                                </button>
                                <button type="button" onClick={handleCloseApplied} className={quietButton}>
                                    Fermer
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            )}

            <p role="status" aria-live="polite" className="sr-only" data-testid="ai-note-status">{announcement}</p>
        </div>
    );
};

export default AiNoteAssist;
