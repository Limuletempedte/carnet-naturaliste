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
    type AiAssistErrorCode,
    type AiNoteResult,
    type AiOverview,
} from '../services/aiAssistService';
import type { ObservationFormData } from '../services/observationFormService';
import { isSessionCurrent, type SessionContext } from '../services/sessionScope';
import {
    AI_NOTE_CHOICES,
    buildNoteProposals,
    commentContains,
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
    /** Une application est en cours (le formulaire bloque l'enregistrement). */
    onApplyingChange?: (applying: boolean) => void;
    /** Revient à l'état d'avant la dernière application. */
    onUndo: () => void;
    /** Garde la note dans le commentaire, sans l'assistant (hors ligne) ; false si refusé. */
    onKeepNoteOnly: (noteText: string) => boolean;
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

/** Délai maximal de l'enregistrement d'un accord (et de la relecture qui suit). */
export const AI_NOTE_CONSENT_TIMEOUT_MS = 20_000;

/** Erreurs après lesquelles la tentative a pu être comptée : on relit le compteur. */
const RECOUNT_CODES = new Set<AiAssistErrorCode>(['cancelled', 'timeout', 'network', 'unknown', 'internal_error']);

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

/** Rejette avec `timeout` si la promesse ne répond pas à temps. */
const withTimeout = <T,>(promise: Promise<T>, ms: number): Promise<T> => new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new AiAssistError('timeout', { feature: 'note' })), ms);
    promise.then(
        value => { clearTimeout(timer); resolve(value); },
        error => { clearTimeout(timer); reject(error); },
    );
});

/**
 * « Remplir depuis une note » (formulaire d'observation, section
 * Identification). La personne tape ou dicte une note ; l'assistant propose
 * des champs ; elle relit et choisit. Rien n'est appliqué sans son clic.
 *
 * Garde-fous contre une utilisation payée sans le vouloir (défauts relevés
 * sur le bilan) : un seul envoi à la fois (verrou posé dès le clic), aucun
 * envoi pendant l'enregistrement d'un accord, « Annuler » arrête vraiment la
 * suite, rien n'est envoyé hors ligne, un résultat payé n'est jamais jeté.
 * Replier la zone ne fait que la masquer. La note reste dans l'état du
 * composant (jamais dans le stockage du navigateur) et n'est jamais
 * journalisée. Le formulaire remonte ce composant à chaque nouvelle fiche.
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
    onApplyingChange,
    onUndo,
    onKeepNoteOnly,
    onOpenAiAccess,
}) => {
    const baseId = useId();
    const [open, setOpen] = useState(false);
    const [noteText, setNoteText] = useState('');
    /** La note a été reprise du commentaire de la fiche : ne pas l'y remettre par défaut. */
    const [fromComment, setFromComment] = useState(false);
    const [phase, setPhase] = useState<Phase>({ kind: 'idle' });
    /** Dernier résultat payé, avec le texte analysé : relisible sans nouvel appel. */
    const [lastResult, setLastResult] = useState<{ text: string; result: AiNoteResult } | null>(null);
    /** Cases que la personne a cochées ou décochées elle-même ; les autres suivent le pré-cochage. */
    const [choices, setChoices] = useState<Map<NoteProposalKey, boolean>>(new Map());
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
    const openRef = useRef(open);
    /** Incrémenté par « Annuler » ou le démontage : la suite s'arrête. */
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

    // Les propositions suivent le formulaire : la valeur « actuelle » reste
    // juste, et une case pré-cochée se décoche d'elle-même si la personne
    // modifie ce champ dans la fiche (sauf si elle a choisi la case elle-même).
    const { proposals, selection } = useMemo(() => {
        if (!reviewResult || !reviewSnapshot) return { proposals: [], selection: new Set<NoteProposalKey>() };
        const context = { snapshot: reviewSnapshot, current: formData, defaults: formDefaults, today };
        const pick = (list: ReturnType<typeof buildNoteProposals>) => new Set(list
            .filter(proposal => choices.get(proposal.key) ?? proposal.preChecked)
            .map(proposal => proposal.key));
        const chosen = pick(buildNoteProposals(reviewResult, context));
        const shown = buildNoteProposals(reviewResult, { ...context, selection: chosen });
        return { proposals: shown, selection: pick(shown) };
    }, [reviewResult, reviewSnapshot, formData, formDefaults, today, choices]);

    useEffect(() => { formDataRef.current = formData; }, [formData]);
    useEffect(() => { openRef.current = open; }, [open]);

    // Le formulaire bloque l'enregistrement pendant une application.
    const applying = phase.kind === 'applying';
    useEffect(() => { onApplyingChange?.(applying); }, [applying, onApplyingChange]);

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

    // Démontage (nouvelle fiche, formulaire fermé) : la suite s'arrête.
    useEffect(() => () => {
        runRef.current += 1;
        abortRef.current?.abort();
        applyAbortRef.current?.abort();
    }, []);

    // Focus rendu au bon endroit après chaque étape (jamais dans une zone repliée).
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

    /**
     * Ce qui arrive zone repliée et demande une réponse (accord, erreur, accès,
     * note hors sujet) rouvre la zone. Un résultat à relire, lui, attend :
     * le bouton l'annonce (« Résultat à relire »).
     */
    const showWhenClosed = () => {
        if (!openRef.current) setOpen(true);
    };

    /** Relit le compteur en arrière-plan (gratuit), après une tentative qui a pu compter. */
    const refreshCounter = (context: SessionContext) => {
        if (!navigator.onLine) return;
        getAiOverview(context).then(next => {
            if (!isSessionCurrent(context)) return;
            onRemainingChange(next.access.kind === 'approved' ? next.access.remaining : null);
        }).catch(() => undefined);
    };

    const loadOverview = async (context: SessionContext, runId: number, timeoutMs?: number): Promise<AiOverview | null> => {
        try {
            const pending = getAiOverview(context);
            const next = await (timeoutMs ? withTimeout(pending, timeoutMs) : pending);
            if (!isSessionCurrent(context) || runRef.current !== runId) return null;
            onRemainingChange(next.access.kind === 'approved' ? next.access.remaining : null);
            return next;
        } catch (error) {
            // Parcours annulé entre-temps : son erreur n'efface pas le message d'annulation.
            if (!isSessionCurrent(context) || runRef.current !== runId) return null;
            setPhase({ kind: 'error', message: error instanceof AiAssistError ? error.message : "Impossible de joindre l'assistant. Réessayez plus tard." });
            setAnnouncement('');
            showWhenClosed();
            focusTarget.current = 'analyze';
            return null;
        }
    };

    /** Ouvre le panneau de relecture pour ce résultat (copie de la fiche prise maintenant). */
    const openReview = (result: AiNoteResult) => {
        const latest = formDataRef.current;
        const snapshot = { ...latest, gps: { ...latest.gps } };
        const kept = !fromComment;
        // Le reste de la note est masqué quand la note entière est gardée.
        const shown = buildNoteProposals(result, { snapshot, current: snapshot, defaults: formDefaults, today: dateToIsoLocal(new Date()) })
            .filter(proposal => !(kept && proposal.key === 'remainder')).length;
        setChoices(new Map());
        setKeepNote(kept);
        setPhase({ kind: 'review', result, snapshot });
        setAnnouncement(shown > 0
            ? `${shown} champ${shown > 1 ? 's' : ''} proposé${shown > 1 ? 's' : ''}, à relire avant d'appliquer.`
            : 'Aucun champ de la fiche à modifier ; vous pouvez garder la note dans le commentaire.');
        if (openRef.current) focusTarget.current = 'panel';
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
                showWhenClosed();
                return;
            }
            if (isEmptyNoteResult(result)) {
                setPhase({ kind: 'empty' });
                setAnnouncement("L'assistant n'a trouvé dans cette note aucune information d'observation à reporter. Rien n'a été modifié.");
                showWhenClosed();
                focusTarget.current = 'textarea';
                return;
            }
            setLastResult({ text, result });
            openReview(result);
        } catch (error) {
            if (controller.signal.aborted || runRef.current !== runId || !isSessionCurrent(context)) return;
            setAnnouncement('');
            const wrapped = error instanceof AiAssistError ? error : new AiAssistError('unknown', { feature: 'note' });
            if (typeof wrapped.remaining === 'number') {
                onRemainingChange(wrapped.remaining);
                rememberRemaining(wrapped.remaining, context);
            } else if (RECOUNT_CODES.has(wrapped.code)) {
                refreshCounter(context);
            }
            showWhenClosed();
            if (wrapped.code === 'consent_outdated') {
                const refreshed = await loadOverview(context, runId);
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
            const current = await loadOverview(context, runId);
            if (!current || runRef.current !== runId) return;
            const blocked = accessMessage(current);
            if (blocked) {
                setPhase({ kind: 'needs_access', message: blocked });
                setAnnouncement('');
                showWhenClosed();
                return;
            }
            if (!hasCurrentConsent(current, 'note')) {
                setPhase({ kind: 'consent', outdated: hasOutdatedConsent(current, 'note') });
                setAnnouncement('');
                showWhenClosed();
                return;
            }
            await analyze(context, runId, text);
        } finally {
            unlock(runId);
        }
    };

    /** « Annuler » pendant la vérification ou l'attente : rien ne sera appliqué. */
    const handleStop = () => {
        const wasSending = phase.kind === 'analyzing';
        runRef.current += 1;
        abortRef.current?.abort();
        abortRef.current = null;
        busyRef.current = null;
        setPhase({ kind: 'error', message: new AiAssistError('cancelled', { feature: 'note' }).message });
        setAnnouncement('');
        focusTarget.current = 'analyze';
        // Une note déjà partie a pu être comptée : le compteur est relu.
        if (wasSending && session && isSessionCurrent(session)) refreshCounter(session);
    };

    // Pendant l'enregistrement d'un accord, le verrou reste tenu par ce
    // parcours : « Annuler » n'ouvre pas la porte à un second envoi.
    const handleCancelConsent = () => {
        runRef.current += 1;
        setPhase({ kind: 'idle' });
        setConsentError(null);
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
            // Délai maximal : un serveur muet ne bloque pas la carte (ni le verrou).
            await withTimeout(giveConsent('note', context), AI_NOTE_CONSENT_TIMEOUT_MS);
            // « Annuler » pendant l'enregistrement : l'accord est donné, mais rien n'est envoyé.
            if (!stillWanted()) return;
            const refreshed = await loadOverview(context, runId, AI_NOTE_CONSENT_TIMEOUT_MS);
            if (!refreshed || !stillWanted()) return;
            setConsentWorking(false);
            // La carte disparaît : le focus revient au bouton « Analyser ».
            focusTarget.current = 'analyze';
            await analyze(context, runId, text);
        } catch (error) {
            if (!stillWanted()) return;
            setConsentError(error instanceof AiAssistError && error.code === 'timeout'
                ? "L'enregistrement de votre accord ne répond pas. Rien n'a été envoyé : réessayez."
                : error instanceof AiAssistError ? error.message : 'Votre accord n’a pas pu être enregistré. Réessayez.');
        } finally {
            unlock(runId);
            if (isSessionCurrent(context)) setConsentWorking(false);
        }
    };

    const handleToggle = (key: NoteProposalKey) => {
        const checked = selection.has(key);
        setChoices(previous => new Map(previous).set(key, !checked));
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
        const visibleKeys = new Set(proposals.filter(proposal => !(keepNote && proposal.key === 'remainder')).map(proposal => proposal.key));
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
            // Le focus va sur le compte rendu, qui sera lu : pas d'annonce en double.
            setAnnouncement('');
            focusTarget.current = 'applied';
            if (!openRef.current) setOpen(true);
        } catch {
            // Message fixe : l'erreur d'origine pourrait citer un champ de la note.
            if (runRef.current !== runId) return;
            setPhase({ kind: 'review', result, snapshot });
            setAnnouncement('L’application a échoué : rien n’a été appliqué. Réessayez.');
            focusTarget.current = 'panel';
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
        setAnnouncement('Application annulée : ce que la note avait rempli est retiré de la fiche.');
        focusTarget.current = 'panel';
    };

    /** « Ne rien appliquer » : retour à la note ; le résultat payé reste relisible. */
    const handleDiscard = () => {
        setPhase({ kind: 'idle' });
        setAnnouncement('Rien n’a été appliqué. Les champs proposés restent disponibles tant que la note ne change pas.');
        focusTarget.current = 'textarea';
    };

    const handleReopenReview = () => {
        if (!lastResult || lastResult.text !== noteText || busyRef.current !== null) return;
        openReview(lastResult.result);
    };

    const handleCloseApplied = () => {
        setNoteText('');
        setFromComment(false);
        setLastResult(null);
        setPhase({ kind: 'idle' });
        setOpen(false);
        setAnnouncement('');
        focusTarget.current = 'open';
    };

    const handleToggleOpen = () => {
        if (open) {
            // Replier MASQUE seulement : la note, un envoi déjà demandé (peut-être
            // déjà compté) et son résultat sont gardés. Seuls les boutons
            // « Annuler » arrêtent un parcours.
            setOpen(false);
            focusTarget.current = 'open';
            return;
        }
        setOpen(true);
        focusTarget.current = reviewing ? 'panel' : phase.kind === 'applied' ? 'applied' : 'textarea';
    };

    const handleNoteChange = (value: string) => {
        setNoteText(value);
        if (value.trim() === '') setFromComment(false);
    };

    const handleUseComment = () => {
        setNoteText(formData.comment);
        // Repris du commentaire : « Garder la note » sera décochée par défaut,
        // sinon le commentaire serait doublé dès qu'on complète la note.
        setFromComment(true);
        if (phase.kind === 'empty' || phase.kind === 'error') setPhase({ kind: 'idle' });
        focusTarget.current = 'textarea';
    };

    const handleKeepOnly = () => {
        if (isEmptyNote) return;
        if (onKeepNoteOnly(noteText)) setAnnouncement('Note ajoutée au commentaire.');
    };

    const isWaiting = phase.kind === 'checking' || phase.kind === 'analyzing';
    const lockedText = isWaiting || phase.kind === 'consent' || reviewing || phase.kind === 'applied';
    const counterId = `${baseId}-counter`;
    const helpId = `${baseId}-help`;
    const commentAvailable = isEditing && formData.comment.trim().length > 0;
    const noteInComment = commentContains(formData.comment, noteText);
    const canReopenReview = lastResult !== null && lastResult.text === noteText && !lockedText;
    /** Quelque chose attend dans la zone : le bouton la rouvre même hors ligne. */
    const somethingPending = !isEmptyNote || phase.kind !== 'idle';
    const openLabel = open
        ? 'Replier la note'
        : isWaiting ? 'Analyse en cours… (afficher)'
            : reviewing ? 'Résultat à relire'
                : phase.kind === 'applied' ? 'Note appliquée (afficher)'
                    : isEmptyNote ? 'Remplir depuis une note' : 'Reprendre la note';

    return (
        <div className="col-span-full space-y-3" data-testid="ai-note">
            <AiButton
                label={openLabel}
                onClick={handleToggleOpen}
                isOffline={isOffline && !open && !somethingPending}
                remaining={remaining}
                // Le coût n'est affiché que sur le geste d'entrée : ouvrir et replier sont gratuits.
                showCost={!open && !somethingPending}
                hint={open ? undefined : "tapez ou dictez ce que vous avez vu, l'assistant propose des champs à relire"}
                buttonRef={openButtonRef}
                expanded={open}
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
                                    onChange={(e) => handleNoteChange(e.target.value)}
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
                                    {canReopenReview && (
                                        <button
                                            type="button"
                                            onClick={handleReopenReview}
                                            className="min-h-[44px] rounded-full bg-ai-600 px-5 py-2 text-sm font-semibold text-white hover:bg-ai-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ai-500"
                                        >
                                            Revoir les champs proposés
                                        </button>
                                    )}
                                    <AiButton
                                        label={canReopenReview ? 'Analyser à nouveau' : 'Analyser la note'}
                                        loadingLabel={phase.kind === 'checking' ? 'Vérification…' : 'Analyse en cours…'}
                                        onClick={() => void handleAnalyze()}
                                        isLoading={isWaiting}
                                        isOffline={isOffline}
                                        disabled={isEmptyNote || tooLong || consentWorking}
                                        remaining={remaining}
                                        hint={canReopenReview ? 'une nouvelle analyse compte à nouveau' : "rien n'est appliqué sans votre choix"}
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

                    {/* Annoncé par la région d'état ; le focus revient à la note. */}
                    {phase.kind === 'empty' && (
                        <p className="rounded-xl bg-ai-50 p-3 text-sm text-nature-dark dark:bg-ai-500/10 dark:text-white" data-testid="ai-note-empty">
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
                                onDiscard={handleDiscard}
                                isApplying={phase.kind === 'applying'}
                                onCancelApply={handleCancelApply}
                                headingRef={panelHeadingRef}
                            />
                        </>
                    )}

                    {phase.kind === 'applied' && (
                        <div className="space-y-3 rounded-xl bg-ai-50 p-3 text-sm text-nature-dark dark:bg-ai-500/10 dark:text-white" data-testid="ai-note-applied">
                            {/* Reçoit le focus : son texte (avertissements compris) est lu une fois. */}
                            <p ref={appliedRef} tabIndex={-1} className="space-y-1 focus:outline-none">
                                <span className="block">
                                    {phase.report.applied.length > 0
                                        ? `Appliqué : ${phase.report.applied.join(', ')}. Vérifiez la fiche avant de l'enregistrer.`
                                        : 'Rien n’a été appliqué.'}
                                </span>
                                {phase.report.warnings.map(warning => (
                                    <span key={warning} className="block text-amber-900 dark:text-amber-100">{warning}</span>
                                ))}
                            </p>
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
