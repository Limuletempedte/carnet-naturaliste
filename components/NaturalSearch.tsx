import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import {
    AiAssistError,
    callAiText,
    getAiOverview,
    giveConsent,
    hasCurrentConsent,
    hasOutdatedConsent,
    readCachedAiCounter,
    rememberRemaining,
    type AiAssistErrorCode,
    type AiOverview,
} from '../services/aiAssistService';
import {
    interpretationInFlight,
    naturalSearchCachePurges,
    readCachedSearch,
    rememberSearch,
    subscribeNaturalSearchCache,
    trackInterpretation,
} from '../services/naturalSearchCache';
import { resolveNear } from '../services/naturalSearchPlace';
import { captureSessionContext, isSessionCurrent, subscribeSessionChange, type SessionContext } from '../services/sessionScope';
import type { AiSearchProposal, AppliedNaturalSearch, NaturalSearchInput } from '../hooks/useFilterControls';
import {
    AI_SEARCH_LIMITS,
    buildFilterPlan,
    criteriaIsEmpty,
    nearLabel,
    parseSearchResult,
    removeCriterion,
    type CriterionRef,
    type NearResolution,
    type SearchChip,
    type SearchCriteria,
    type SearchNear,
} from '../utils/aiSearchFilters';
import { analyzeNaturalSearch } from '../utils/naturalSearchLocal';
import AiButton from './AiButton';
import AiConsentCard from './AiConsentCard';
import { SparklesIcon, XMarkIcon } from './icons';

/** Délai maximal de la vérification de l'accès, de l'enregistrement d'un accord et de la relecture qui suit. */
export const AI_SEARCH_CONSENT_TIMEOUT_MS = 20_000;

/** Erreurs après lesquelles la tentative a pu être comptée : on relit le compteur. */
const RECOUNT_CODES = new Set<AiAssistErrorCode>(['cancelled', 'timeout', 'network', 'unknown', 'internal_error']);

type Phase =
    | { kind: 'idle' }
    | { kind: 'checking' }
    /** La phrase est figée dans la phase : c'est elle, et elle seule, qui partira. */
    | { kind: 'consent'; outdated: boolean; phrase: string }
    | { kind: 'analyzing' }
    | { kind: 'needs_access'; message: string }
    | { kind: 'error'; message: string };

type ProposalSource = 'local' | 'ai' | 'cache';

interface Proposal {
    phrase: string;
    source: ProposalSource;
    criteria: SearchCriteria;
}

const SOURCE_LABELS: Record<ProposalSource, string> = {
    local: 'analyse gratuite, sur votre appareil',
    ai: "interprété par l'assistant IA",
    cache: 'phrase déjà interprétée par l’assistant : sans nouvelle utilisation',
};

const chipTone: Record<SearchChip['tone'], string> = {
    ok: 'border-ai-200 bg-ai-50 text-ai-800 dark:border-ai-400/30 dark:bg-ai-500/15 dark:text-ai-100',
    warning: 'border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-400/40 dark:bg-amber-900/25 dark:text-amber-100',
    error: 'border-red-300 bg-red-50 text-red-800 dark:border-red-400/40 dark:bg-red-900/25 dark:text-red-100',
};
const quietButton = 'min-h-[44px] rounded-full px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-black/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ai-500 dark:text-gray-200 dark:hover:bg-white/10';
const primaryButton = 'min-h-[44px] rounded-full bg-ai-600 px-5 py-2 text-sm font-semibold text-white hover:bg-ai-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ai-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 dark:focus-visible:ring-offset-nature-dark-surface';
const linkButton = 'min-h-[44px] text-sm font-semibold text-ai-700 underline underline-offset-2 dark:text-ai-200';

const accessMessage = (overview: AiOverview): string | null => {
    switch (overview.access.kind) {
        case 'approved': return null;
        case 'pending': return "Votre demande d'accès à l'assistant attend encore sa validation. L'analyse gratuite reste disponible.";
        case 'refused':
        case 'revoked': return "L'assistant n'est pas ouvert pour votre compte. L'analyse gratuite reste disponible.";
        case 'consent_outdated': return "Les conditions de l'assistant ont changé : renouvelez votre accord dans « Assistant IA ».";
        default: return "L'interprétation par l'IA fait partie de l'assistant, sur demande d'accès. L'analyse gratuite reste disponible.";
    }
};

/** Rejette avec `timeout` si la promesse ne répond pas à temps. */
const withTimeout = <T,>(promise: Promise<T>, ms: number): Promise<T> => new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new AiAssistError('timeout', { feature: 'search' })), ms);
    promise.then(
        value => { clearTimeout(timer); resolve(value); },
        error => { clearTimeout(timer); reject(error); },
    );
});

const plural = (count: number, one: string, many: string) => `${count} ${count > 1 ? many : one}`;

// ---------------------------------------------------------------------------
// Étiquettes
// ---------------------------------------------------------------------------

interface ChipListProps {
    chips: readonly SearchChip[];
    /** Libellé du bouton de retrait (lu par les lecteurs d'écran). */
    removeLabel: (chip: SearchChip) => string;
    onRemove: (chip: SearchChip, index: number) => void;
    /** Bouton « Réessayer » sur l'étiquette d'un lieu non trouvé. */
    onRetryNear?: () => void;
    retrying?: boolean;
    listLabel: string;
    removeRefs?: React.MutableRefObject<Array<HTMLButtonElement | null>>;
    /** Un parcours est en cours (IA, localisation) : rien ne se retire. */
    disabled?: boolean;
}

/** Liste d'étiquettes « J'ai compris : … », chacune retirable au clavier. */
const ChipList: React.FC<ChipListProps> = ({ chips, removeLabel, onRemove, onRetryNear, retrying = false, listLabel, removeRefs, disabled = false }) => (
    <ul aria-label={listLabel} className="flex flex-wrap gap-2">
        {chips.map((chip, index) => (
            <li key={chip.id} className={`inline-flex max-w-full items-center gap-1 rounded-full border py-1 pl-3 pr-1 text-sm ${chipTone[chip.tone]}`} data-testid={`search-chip-${chip.id}`} data-tone={chip.tone}>
                <span className="min-w-0 [overflow-wrap:anywhere]">{chip.label}</span>
                {chip.tone === 'error' && chip.ref.field === 'near' && onRetryNear && (
                    <button
                        type="button"
                        onClick={onRetryNear}
                        disabled={retrying || disabled}
                        className="min-h-[36px] rounded-full px-2 text-xs font-semibold underline underline-offset-2 disabled:opacity-50"
                    >
                        {retrying ? 'Recherche…' : 'Réessayer'}
                    </button>
                )}
                <button
                    type="button"
                    // Sentry garde ce nom fixe au lieu du sélecteur : l'aria-label cite la phrase.
                    data-sentry-element="natural-search-chip-remove"
                    ref={element => { if (removeRefs) removeRefs.current[index] = element; }}
                    onClick={() => onRemove(chip, index)}
                    disabled={disabled}
                    aria-label={removeLabel(chip)}
                    className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full hover:bg-black/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ai-500 disabled:cursor-not-allowed disabled:opacity-40 dark:hover:bg-white/15"
                >
                    <XMarkIcon className="h-4 w-4" />
                </button>
            </li>
        ))}
    </ul>
);

interface NaturalSearchAppliedProps {
    naturalSearch: AppliedNaturalSearch;
    onRemoveCriterion: (ref: CriterionRef) => void;
    /** `forNear` : le critère pour lequel le lieu a été cherché (un résultat périmé est ignoré). */
    onUpdateNear: (near: NearResolution, forNear?: SearchNear) => void;
    onUndo: () => void;
    onResetAll: () => void;
    /** Observations écartées d'une catégorie ou d'un genre faute de nom latin. */
    excludedNoLatinName: number;
    /** Annonce d'un événement (région d'état du parent). */
    onAnnounce?: (message: string) => void;
    /** La dernière étiquette a été retirée (la section disparaît) : le parent reprend le focus. */
    onEmptied?: () => void;
    /** Un parcours de l'assistant est en cours : la recherche appliquée ne change pas. */
    locked?: boolean;
    compact?: boolean;
    /** Titre de la section, pour que le parent puisse y mettre le focus. */
    headingRef?: React.MutableRefObject<HTMLParagraphElement | null>;
}

/**
 * Étiquettes de la recherche APPLIQUÉE (liste, carte, galerie) : chaque
 * critère se retire seul ; « Annuler la recherche » rend les filtres
 * d'avant ; « Réinitialiser » efface tout.
 */
export const NaturalSearchApplied: React.FC<NaturalSearchAppliedProps> = ({
    naturalSearch,
    onRemoveCriterion,
    onUpdateNear,
    onUndo,
    onResetAll,
    excludedNoLatinName,
    onAnnounce,
    onEmptied,
    locked = false,
    compact = false,
    headingRef: outerHeadingRef,
}) => {
    const headingId = useId();
    const ownHeadingRef = useRef<HTMLParagraphElement | null>(null);
    const headingRef = outerHeadingRef ?? ownHeadingRef;
    const removeRefs = useRef<Array<HTMLButtonElement | null>>([]);
    const [retrying, setRetrying] = useState(false);
    const focusAfterRemove = useRef<number | null>(null);
    const { chips, notes } = naturalSearch.plan;
    const usesLatinName = naturalSearch.criteria.categories.length > 0 || naturalSearch.criteria.genera.length > 0;

    // Après un retrait : focus sur l'étiquette suivante (ou le titre).
    useEffect(() => {
        const index = focusAfterRemove.current;
        if (index === null) return;
        focusAfterRemove.current = null;
        const target = removeRefs.current[Math.min(index, chips.length - 1)];
        (target ?? headingRef.current)?.focus();
    }, [chips, headingRef]);

    const handleRetry = async () => {
        const near = naturalSearch.criteria.near;
        if (retrying || !near) return;
        let context: SessionContext;
        try { context = captureSessionContext(); } catch { return; }
        setRetrying(true);
        onUpdateNear({ status: 'pending' }, near);
        const resolution = await resolveNear(near);
        // Compte changé pendant l'attente : rien ne passe à l'autre compte.
        if (!isSessionCurrent(context)) return;
        setRetrying(false);
        // Lié à SON critère : ignoré si une autre recherche est appliquée entre-temps.
        onUpdateNear(resolution, near);
        onAnnounce?.(resolution.status === 'ok' ? 'Lieu trouvé : critère appliqué.' : `${nearLabel(near, resolution).label}.`);
        // « Réessayer » disparaît si le lieu est trouvé : le focus va au titre de la section.
        headingRef.current?.focus();
    };

    return (
        <section aria-labelledby={headingId} className={`space-y-2 rounded-2xl border border-ai-200 bg-white/70 ${compact ? 'p-2' : 'p-3'} dark:border-ai-400/30 dark:bg-white/5`} data-testid="natural-search-applied">
            <p id={headingId} ref={headingRef} tabIndex={-1} className="flex flex-wrap items-center gap-x-2 text-sm font-semibold text-nature-dark focus:outline-none dark:text-white">
                <SparklesIcon className="h-4 w-4 text-ai-600 dark:text-ai-300" />
                J'ai compris :
                <span className="text-xs font-normal text-gray-500 dark:text-gray-400">« {naturalSearch.phrase} » · {SOURCE_LABELS[naturalSearch.source]}</span>
            </p>
            <ChipList
                chips={chips}
                listLabel="Critères appliqués"
                removeLabel={chip => `Retirer le critère : ${chip.label}`}
                onRemove={(chip, index) => {
                    if (locked) return;
                    const last = chips.length === 1;
                    focusAfterRemove.current = last ? null : index;
                    onRemoveCriterion(chip.ref);
                    onAnnounce?.(last ? `Critère retiré : ${chip.label}. Plus aucun filtre de la recherche.` : `Critère retiré : ${chip.label}.`);
                    if (last) onEmptied?.();
                }}
                onRetryNear={() => void handleRetry()}
                retrying={retrying}
                removeRefs={removeRefs}
                disabled={locked}
            />
            {notes.map(note => <p key={note} className="text-xs text-amber-800 dark:text-amber-200">{note}</p>)}
            {usesLatinName && excludedNoLatinName > 0 && (
                <p className="text-xs text-gray-600 dark:text-gray-300" data-testid="natural-search-excluded">
                    {plural(excludedNoLatinName, 'observation sans nom latin ne peut pas être rattachée', 'observations sans nom latin ne peuvent pas être rattachées')} à une catégorie ou à un genre : {excludedNoLatinName > 1 ? 'elles ne sont pas affichées' : "elle n'est pas affichée"}.
                </p>
            )}
            <div className="flex flex-wrap gap-2">
                <button type="button" onClick={onUndo} disabled={locked} className={`${quietButton} disabled:cursor-not-allowed disabled:opacity-50`}>
                    Annuler la recherche
                </button>
                <button type="button" onClick={onResetAll} disabled={locked} className={`${quietButton} disabled:cursor-not-allowed disabled:opacity-50`}>
                    Réinitialiser les filtres
                </button>
            </div>
        </section>
    );
};

// ---------------------------------------------------------------------------
// État de l'assistant (accès, compteur), lu seulement quand le bouton IA
// doit s'afficher, et partagé entre les instances du champ
// ---------------------------------------------------------------------------

interface AccessMemo {
    userId: string;
    approved: boolean;
    remaining: number | null;
    at: number;
}
const ACCESS_MEMO_MS = 5 * 60_000;
let accessMemo: AccessMemo | null = null;
let accessRequest: { userId: string; promise: Promise<AccessMemo | null> } | null = null;

/** Compteur (et accès, s'il est connu) mis à jour : toutes les instances du champ du même compte le suivent. */
interface AccessUpdate {
    userId: string;
    remaining: number | null;
    approved?: boolean;
}
type AccessListener = (update: AccessUpdate) => void;
const accessListeners = new Set<AccessListener>();

const subscribeAccess = (listener: AccessListener): (() => void) => {
    accessListeners.add(listener);
    return () => { accessListeners.delete(listener); };
};

const notifyAccess = (update: AccessUpdate) => {
    for (const listener of [...accessListeners]) {
        try { listener(update); } catch { /* un champ démonté ne bloque pas les autres */ }
    }
};

/** Pour les tests : oublie l'état de l'assistant gardé en mémoire. */
export const resetNaturalSearchAccessMemo = (): void => {
    accessMemo = null;
    accessRequest = null;
};

const rememberAccess = (context: SessionContext, overview: AiOverview): AccessMemo => {
    const approved = overview.access.kind === 'approved';
    accessMemo = {
        userId: context.userId,
        approved,
        remaining: overview.access.kind === 'approved' ? overview.access.remaining : null,
        at: Date.now(),
    };
    notifyAccess({ userId: context.userId, remaining: accessMemo.remaining, approved });
    return accessMemo;
};

/** Compteur connu après un appel : gardé hors ligne, mémorisé et annoncé à toutes les instances. */
const shareRemaining = (context: SessionContext, value: number): void => {
    rememberRemaining(value, context);
    if (accessMemo?.userId === context.userId) accessMemo = { ...accessMemo, remaining: value, at: Date.now() };
    notifyAccess({ userId: context.userId, remaining: value });
};

/** Message d'une vérification d'accès restée sans réponse (rien n'est encore parti). */
const ACCESS_CHECK_TIMEOUT_MESSAGE = "La vérification de votre accès ne répond pas. Rien n'a été envoyé : réessayez.";

const freshAccess = (userId: string): AccessMemo | null =>
    (accessMemo && accessMemo.userId === userId && Date.now() - accessMemo.at < ACCESS_MEMO_MS ? accessMemo : null);

/** Lit l'état de l'assistant une seule fois pour toutes les instances (StrictMode compris). */
const loadAccess = (context: SessionContext): Promise<AccessMemo | null> => {
    const fresh = freshAccess(context.userId);
    if (fresh) return Promise.resolve(fresh);
    if (accessRequest && accessRequest.userId === context.userId) return accessRequest.promise;
    const promise = getAiOverview(context)
        .then(overview => (isSessionCurrent(context) ? rememberAccess(context, overview) : null))
        .catch(() => null)
        .finally(() => { if (accessRequest?.promise === promise) accessRequest = null; });
    accessRequest = { userId: context.userId, promise };
    return promise;
};

const currentUserId = (): string | null => {
    try { return captureSessionContext().userId; } catch { return null; }
};

// ---------------------------------------------------------------------------
// Champ de recherche
// ---------------------------------------------------------------------------

interface NaturalSearchProps {
    variant: 'mobile' | 'desktop';
    inputId: string;
    searchTerm: string;
    /** Recherche par nom (filtre existant), à chaque frappe comme avant. */
    onSearchChange: (value: string) => void;
    /** Texte du champ, gardé par le parent (un remontage ne le perd pas). */
    draft: string;
    onDraftChange: (value: string) => void;
    /** Dernière réponse de l'assistant, gardée par le parent. */
    aiProposal: AiSearchProposal | null;
    onAiProposalChange: (proposal: AiSearchProposal | null) => void;
    naturalSearch: AppliedNaturalSearch | null;
    onApply: (input: NaturalSearchInput) => void;
    onRemoveCriterion: (ref: CriterionRef) => void;
    onUpdateNear: (near: NearResolution, forNear?: SearchNear) => void;
    onUndo: () => void;
    onResetAll: () => void;
    /** Croix « Effacer la recherche » : retire aussi la recherche appliquée. */
    onClearNatural: () => void;
    /** Remplace la recherche appliquée par une recherche par nom. */
    onReplaceWithNameSearch: (text: string) => void;
    hasActiveFilters: boolean;
    excludedNoLatinName: number;
    isOffline?: boolean;
    onOpenAiAccess?: () => void;
}

/**
 * Champ « Rechercher » de la liste, avec la recherche en langage naturel.
 *
 * Principe : **la recherche par nom d'abord**, jamais moins bonne qu'avant.
 * - Sans recherche en langage naturel appliquée, chaque frappe filtre par
 *   nom, exactement comme avant, quoi qu'on tape.
 * - L'analyse locale GRATUITE propose en plus ce qu'elle reconnaît
 *   (« J'ai compris : … »). Entrée ne l'applique que pour une phrase
 *   claire (mot outil, ou plusieurs critères) ; un mot seul (« Fougères »)
 *   reste une recherche par nom, et son filtre ne s'applique que sur un clic.
 * - Une phrase en partie comprise peut être interprétée par l'assistant, sur
 *   un bouton explicite (1 utilisation) : JAMAIS sur Entrée. Accord au
 *   premier usage, à l'endroit même.
 * - Une recherche appliquée ne change plus avant « Appliquer » (ou Entrée
 *   pour une phrase) ; la croix l'efface.
 * - Une phrase interprétée est gardée (cache du navigateur) : rejouée, elle
 *   ne coûte rien et marche hors ligne ; une phrase en cours d'interprétation
 *   n'est jamais renvoyée, même par une autre instance du champ.
 *
 * Garde-fous repris de la note : un seul envoi à la fois (verrou posé dès le
 * clic), aucun envoi pendant l'enregistrement d'un accord, « Annuler »
 * arrête vraiment la suite, compteur relu après une tentative qui a pu
 * compter, tout repart à zéro au changement de compte. Ni la phrase, ni les
 * filtres, ni la position ne sont journalisés.
 */
const NaturalSearch: React.FC<NaturalSearchProps> = ({
    variant,
    inputId,
    searchTerm,
    onSearchChange,
    draft,
    onDraftChange,
    aiProposal,
    onAiProposalChange,
    naturalSearch,
    onApply,
    onRemoveCriterion,
    onUpdateNear,
    onUndo,
    onResetAll,
    onClearNatural,
    onReplaceWithNameSearch,
    hasActiveFilters,
    excludedNoLatinName,
    isOffline = false,
    onOpenAiAccess,
}) => {
    const baseId = useId();
    const helpId = `${baseId}-help`;
    const proposalHeadingId = `${baseId}-proposal`;
    const [phase, setPhase] = useState<Phase>({ kind: 'idle' });
    /** On attend la réponse d'une interprétation lancée par une autre instance du champ. */
    const [adopted, setAdopted] = useState(false);
    /** Critères retirés de la proposition avant de l'appliquer. */
    const [removed, setRemoved] = useState<CriterionRef[]>([]);
    const [locating, setLocating] = useState(false);
    const [access, setAccess] = useState<'unknown' | 'approved' | 'none'>(() => {
        const userId = currentUserId();
        const memo = userId ? freshAccess(userId) : null;
        if (memo) return memo.approved ? 'approved' : 'none';
        return readCachedAiCounter() ? 'approved' : 'unknown';
    });
    const [remaining, setRemaining] = useState<number | null>(() => {
        const userId = currentUserId();
        return (userId ? freshAccess(userId)?.remaining : null) ?? readCachedAiCounter()?.remaining ?? null;
    });
    const [consentWorking, setConsentWorking] = useState(false);
    const [consentError, setConsentError] = useState<string | null>(null);
    const [announcement, setAnnouncement] = useState('');
    const [cacheVersion, setCacheVersion] = useState(0);
    const [emptyMessage, setEmptyMessage] = useState<string | null>(null);
    /**
     * Verrou synchrone : un seul parcours (vérification, accord, envoi) à la
     * fois. Il porte le numéro du parcours qui le tient.
     */
    const busyRef = useRef<number | null>(null);
    /** Incrémenté par « Annuler », un changement de compte, le démontage : la suite s'arrête. */
    const runRef = useRef(0);
    const abortRef = useRef<AbortController | null>(null);
    /** Incrémenté à chaque nouvelle application : une localisation périmée est ignorée. */
    const applyRunRef = useRef(0);
    const inputRef = useRef<HTMLInputElement | null>(null);
    const aiButtonRef = useRef<HTMLButtonElement | null>(null);
    const applyButtonRef = useRef<HTMLButtonElement | null>(null);
    const proposalHeadingRef = useRef<HTMLParagraphElement | null>(null);
    const appliedHeadingRef = useRef<HTMLParagraphElement | null>(null);
    const focusTarget = useRef<'ai' | 'proposal' | 'input' | 'apply' | 'applied' | null>(null);
    /** Phrase du parcours en cours de vérification (« Vérification… ») : elle seule pourra partir. */
    const checkingPhraseRef = useRef<string | null>(null);

    const draftRef = useRef(draft);
    useEffect(() => { draftRef.current = draft; }, [draft]);
    const trimmed = draft.trim();
    const local = useMemo(() => analyzeNaturalSearch(draft), [draft]);
    /** Phrase déjà interprétée par l'assistant (même sans aucun critère : elle n'est pas repayée). */
    const cachedRaw = useMemo(() => {
        void cacheVersion;
        if (trimmed.length === 0 || local.understood) return null;
        return readCachedSearch(draft);
    }, [draft, trimmed, local.understood, cacheVersion]);
    const cached = cachedRaw && !criteriaIsEmpty(cachedRaw) ? cachedRaw : null;
    const aiForDraft = aiProposal && aiProposal.phrase === draft ? aiProposal : null;
    const alreadyApplied = naturalSearch !== null && naturalSearch.phrase === draft;
    /** Plusieurs passages non compris séparés : jamais appliqué tel quel. */
    const fragmented = local.fragments.length > 0;
    /** Passages séparés, ou repère de temps non compris (« oiseaux vus hier ») : jamais appliqué tel quel. */
    const blockedLocal = fragmented || local.unresolvedTime.length > 0;

    const proposal: Proposal | null = useMemo(() => {
        if (trimmed.length === 0 || alreadyApplied) return null;
        if (aiForDraft && !criteriaIsEmpty(aiForDraft.criteria)) return { phrase: draft, source: 'ai', criteria: aiForDraft.criteria };
        if (cached) return { phrase: draft, source: 'cache', criteria: cached };
        if (local.hasCriteria && !blockedLocal) return { phrase: draft, source: 'local', criteria: local.criteria };
        return null;
    }, [trimmed, alreadyApplied, aiForDraft, draft, cached, local, blockedLocal]);

    const proposalCriteria = useMemo(() => {
        if (!proposal) return null;
        return removed.reduce((criteria, ref) => removeCriterion(criteria, ref), proposal.criteria);
    }, [proposal, removed]);
    const proposalPlan = useMemo(
        () => (proposalCriteria ? buildFilterPlan(proposalCriteria, new Date(), locating ? { status: 'pending' } : undefined) : null),
        [proposalCriteria, locating],
    );
    const applicable = proposalCriteria !== null && !criteriaIsEmpty(proposalCriteria);
    /** Entrée applique seulement une phrase claire, ou ce que l'assistant a interprété à la demande. */
    const enterApplies = applicable && proposal !== null && (proposal.source !== 'local' || local.clearlyPhrase);

    const isWaiting = phase.kind === 'checking' || phase.kind === 'analyzing';
    // Pendant l'enregistrement d'un accord annulé, le champ redevient
    // modifiable ; le bouton IA, lui, reste occupé avec sa raison.
    const lockedInput = isWaiting || phase.kind === 'consent';
    /** Une recherche appliquée, et le champ montre autre chose : elle reste telle quelle. */
    const editingApplied = naturalSearch !== null && draft !== naturalSearch.phrase;
    /** Rien à appliquer dans le nouveau texte : proposer de chercher ce nom à la place (lien, ou Entrée). */
    const offerNameSearchInstead = editingApplied && !enterApplies && trimmed.length > 0 && !lockedInput && !locating;
    const tooLong = draft.length > AI_SEARCH_LIMITS.maxInputChars;
    // Bouton IA : une phrase (mot outil, critère reconnu, ou ensemble du
    // dictionnaire suivi d'un complément : « oiseaux de Pessac ») avec des mots
    // non compris, pas déjà interprétée. Jamais pour un simple nom (« buse variable »).
    const offerAi = trimmed.length > 0 && !tooLong && !local.understood
        && (local.hasFunctionWord || local.hasCriteria || local.hasTaxonWord)
        && !cachedRaw && !aiForDraft && !alreadyApplied;
    const showAiZone = offerAi || phase.kind !== 'idle' || consentWorking;

    // Démontage (onglet Carte, rotation de l'écran…) : l'écran ne suit plus,
    // mais une phrase déjà partie n'est PAS coupée : sa réponse, peut-être
    // déjà comptée, est gardée dans le cache pour ne jamais être repayée.
    useEffect(() => () => {
        runRef.current += 1;
        applyRunRef.current += 1;
    }, []);

    // Une autre instance (ou le retrait de l'accord) a changé le cache : on relit.
    useEffect(() => subscribeNaturalSearchCache(() => setCacheVersion(version => version + 1)), []);

    // Compteur relu ou mis à jour par une autre instance (par exemple celle
    // démontée pendant l'attente) : celle-ci le suit aussi.
    useEffect(() => subscribeAccess(update => {
        if (update.userId !== currentUserId()) return;
        setRemaining(update.remaining);
        if (update.approved !== undefined) setAccess(update.approved ? 'approved' : 'none');
    }), []);

    // Changement de compte : tout repart à zéro (le parent vide la phrase).
    useEffect(() => subscribeSessionChange(() => {
        runRef.current += 1;
        applyRunRef.current += 1;
        abortRef.current?.abort();
        abortRef.current = null;
        busyRef.current = null;
        setRemoved([]);
        setPhase({ kind: 'idle' });
        setAdopted(false);
        setLocating(false);
        setConsentWorking(false);
        setConsentError(null);
        setRemaining(null);
        setAccess('unknown');
        setEmptyMessage(null);
        setAnnouncement('');
    }), []);

    // État de l'assistant : lu seulement quand le bouton IA doit s'afficher.
    useEffect(() => {
        if (!offerAi || isOffline) return;
        let context: SessionContext;
        try { context = captureSessionContext(); } catch { return; }
        let cancelled = false;
        void loadAccess(context).then(memo => {
            if (cancelled || !memo || !isSessionCurrent(context)) return;
            setAccess(memo.approved ? 'approved' : 'none');
            setRemaining(memo.remaining);
        });
        return () => { cancelled = true; };
    }, [offerAi, isOffline]);

    // Focus rendu au bon endroit après chaque étape.
    useEffect(() => {
        const target = focusTarget.current;
        if (!target) return;
        const element = {
            ai: aiButtonRef.current,
            proposal: proposalHeadingRef.current,
            input: inputRef.current,
            apply: applyButtonRef.current,
            applied: appliedHeadingRef.current,
        }[target];
        if (!element) return;
        focusTarget.current = null;
        element.focus();
    }, [phase, proposal, removed, naturalSearch, locating]);

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

    /** Compteur connu après un appel : affiché, gardé hors ligne et partagé avec les autres instances. */
    const noteRemaining = (context: SessionContext, value: number) => {
        shareRemaining(context, value);
        if (isSessionCurrent(context)) setRemaining(value);
    };

    const noteOverview = (context: SessionContext, overview: AiOverview) => {
        const memo = rememberAccess(context, overview);
        setAccess(memo.approved ? 'approved' : 'none');
        setRemaining(memo.remaining);
    };

    /** Relit le compteur en arrière-plan (gratuit), après une tentative qui a pu compter. */
    const refreshCounter = (context: SessionContext) => {
        if (!navigator.onLine) return;
        getAiOverview(context).then(next => {
            if (isSessionCurrent(context)) noteOverview(context, next);
        }).catch(() => undefined);
    };

    // Remontage pendant une interprétation lancée ailleurs : on attend SA
    // réponse (gardée dans le cache), sans jamais renvoyer la phrase.
    useEffect(() => {
        let context: SessionContext;
        try { context = captureSessionContext(); } catch { return; }
        const phrase = draftRef.current;
        const pending = phrase.trim() ? interpretationInFlight(phrase, context.userId) : null;
        if (!pending) return;
        const runId = lock();
        if (runId === null) return;
        setPhase({ kind: 'analyzing' });
        setAdopted(true);
        setAnnouncement('Interprétation de la phrase en cours…');
        void pending.then(message => {
            if (runRef.current !== runId || !isSessionCurrent(context)) return;
            finishAdopted(context, phrase, message);
        }).finally(() => unlock(runId));
        // Nettoyage (démontage, ou double montage de React en mode strict) :
        // ce parcours s'arrête et libère le verrou, l'instance suivante reprend l'attente.
        return () => {
            if (runRef.current === runId) runRef.current += 1;
            unlock(runId);
        };
        // Au montage seulement.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    /**
     * Fin d'une interprétation lancée par une autre instance du champ :
     * sa réponse (dans le cache) ou son message d'erreur, et le compteur à jour.
     */
    function finishAdopted(context: SessionContext, phrase: string, message: string | null) {
        setAdopted(false);
        const memo = freshAccess(context.userId);
        if (memo) setRemaining(memo.remaining);
        const found = readCachedSearch(phrase, context);
        if (found) showInterpretation(phrase, found, 'cache');
        else if (message) {
            setPhase({ kind: 'error', message });
            focusTarget.current = 'ai';
        } else setPhase({ kind: 'idle' });
    }

    /** La phrase du champ n'est plus celle du parcours : il s'arrête, rien ne part. */
    function stopForChangedPhrase() {
        // L'ancien parcours ne peut plus rien envoyer (`runRef` a changé) : le
        // verrou est libéré tout de suite, comme avec « Annuler ».
        runRef.current += 1;
        busyRef.current = null;
        setPhase({ kind: 'idle' });
        setConsentError(null);
        setAnnouncement('La phrase a changé : rien n’a été envoyé à l’assistant.');
    }

    // Phrase changée pendant l'accord ou la vérification (preset appliqué,
    // recherche effacée ailleurs) : la carte se ferme, rien ne part.
    useEffect(() => {
        if (phase.kind === 'consent' && draft !== phase.phrase) stopForChangedPhrase();
        else if (phase.kind === 'checking' && checkingPhraseRef.current !== null && draft !== checkingPhraseRef.current) stopForChangedPhrase();
    }, [draft, phase]);

    const handleChange = (value: string) => {
        if (lockedInput) return;
        onDraftChange(value);
        setRemoved([]);
        setEmptyMessage(null);
        applyRunRef.current += 1;
        setLocating(false);
        if (phase.kind === 'error' || phase.kind === 'needs_access') setPhase({ kind: 'idle' });
        // Recherche par nom à chaque frappe, exactement comme avant. Une
        // recherche en langage naturel appliquée, elle, reste telle quelle
        // jusqu'à « Appliquer » (ou la croix).
        if (naturalSearch === null) onSearchChange(value);
    };

    /** Lit l'accès ; en cas d'échec, message d'erreur (ou `nothingSent` si l'accord vient d'être donné). */
    const loadOverview = async (context: SessionContext, runId: number, timeoutMs?: number, nothingSent?: string): Promise<AiOverview | null> => {
        try {
            const pending = getAiOverview(context);
            const next = await (timeoutMs ? withTimeout(pending, timeoutMs) : pending);
            if (!isSessionCurrent(context) || runRef.current !== runId) return null;
            noteOverview(context, next);
            return next;
        } catch (error) {
            if (!isSessionCurrent(context) || runRef.current !== runId) return null;
            const timedOut = timeoutMs !== undefined && error instanceof AiAssistError && error.code === 'timeout';
            setPhase({
                kind: 'error',
                message: nothingSent ?? (timedOut ? ACCESS_CHECK_TIMEOUT_MESSAGE
                    : error instanceof AiAssistError ? error.message : "Impossible de joindre l'assistant. Réessayez plus tard."),
            });
            setAnnouncement('');
            focusTarget.current = 'ai';
            return null;
        }
    };

    /** Montre une interprétation (nouvelle, ou relue du cache) ; rien n'est appliqué. */
    function showInterpretation(phrase: string, criteria: SearchCriteria, source: 'ai' | 'cache') {
        if (source === 'ai') onAiProposalChange({ phrase, criteria });
        setCacheVersion(version => version + 1);
        setRemoved([]);
        setPhase({ kind: 'idle' });
        // Le champ ne montre plus cette phrase : rien d'annoncé ni de focalisé (le résultat reste gardé).
        if (draftRef.current !== phrase) {
            setAnnouncement('');
            return;
        }
        if (criteriaIsEmpty(criteria)) {
            const message = criteria.dropped.length > 0
                ? "L'assistant n'a rien compris d'utilisable dans cette phrase : rien n'est appliqué. Reformulez-la, ou cherchez un nom."
                : "L'assistant n'a trouvé aucun critère de recherche dans cette phrase : rien n'est appliqué.";
            setEmptyMessage(message);
            setAnnouncement(message);
            focusTarget.current = 'input';
            return;
        }
        setAnnouncement("L'assistant a compris votre phrase : relisez les étiquettes, puis appliquez-les.");
        focusTarget.current = 'proposal';
    }

    /** Envoie la phrase. Ne relance jamais un appel déjà parti, ni une phrase déjà interprétée. */
    const interpret = async (context: SessionContext, runId: number, phrase: string) => {
        if (abortRef.current || runRef.current !== runId) return;
        // Déjà en cours (autre instance du champ) : on attend cette réponse.
        const pending = interpretationInFlight(phrase, context.userId);
        if (pending) {
            setPhase({ kind: 'analyzing' });
            setAdopted(true);
            const message = await pending;
            if (runRef.current !== runId || !isSessionCurrent(context)) return;
            finishAdopted(context, phrase, message);
            return;
        }
        // Déjà interprétée (cache relu juste avant d'envoyer).
        const already = readCachedSearch(phrase, context);
        if (already) {
            showInterpretation(phrase, already, 'cache');
            return;
        }
        // Dernier contrôle juste avant l'envoi : le champ montre-t-il toujours cette phrase ?
        if (draftRef.current !== phrase) {
            stopForChangedPhrase();
            return;
        }
        const controller = new AbortController();
        abortRef.current = controller;
        const purges = naturalSearchCachePurges();
        setPhase({ kind: 'analyzing' });
        setAnnouncement('Interprétation de la phrase en cours…');
        // Payé : relu et gardé dès la réponse, même si la liste a été quittée
        // entre-temps (jamais si l'accord a été retiré depuis).
        // Le compteur suit la réponse, réussie ou en erreur, quelle que soit
        // l'instance du champ qui l'attend (la liste a pu être remontée).
        const request = Promise.resolve().then(() => callAiText('search', { text: phrase }, { signal: controller.signal }, context)).then(response => {
            if (controller.signal.aborted || !isSessionCurrent(context)) return null;
            noteRemaining(context, response.remaining);
            const criteria = parseSearchResult(response.result);
            if (criteria) rememberSearch(phrase, criteria, context, purges);
            return { remaining: response.remaining, criteria };
        }, (error: unknown) => {
            const wrapped = error instanceof AiAssistError ? error : new AiAssistError('unknown', { feature: 'search' });
            if (!controller.signal.aborted && isSessionCurrent(context)) {
                if (typeof wrapped.remaining === 'number') noteRemaining(context, wrapped.remaining);
                // Plus rien ce mois-ci : le compteur affiché le dit.
                else if (wrapped.code === 'quota_exceeded') noteRemaining(context, 0);
                else if (RECOUNT_CODES.has(wrapped.code)) refreshCounter(context);
            }
            throw wrapped;
        });
        trackInterpretation(phrase, context.userId, request.then(
            outcome => (outcome && !outcome.criteria ? aiAssistErrorText('invalid_output') : null),
            (error: AiAssistError) => (controller.signal.aborted ? null : error.message),
        ));
        try {
            const outcome = await request;
            if (!outcome || runRef.current !== runId) return;
            setRemaining(outcome.remaining);
            if (!outcome.criteria) {
                setPhase({ kind: 'error', message: aiAssistErrorText('invalid_output') });
                setAnnouncement('');
                focusTarget.current = 'ai';
                return;
            }
            showInterpretation(phrase, outcome.criteria, 'ai');
        } catch (error) {
            if (controller.signal.aborted || runRef.current !== runId || !isSessionCurrent(context)) return;
            setAnnouncement('');
            // Le compteur a déjà été mis à jour avec la réponse (plus haut).
            const wrapped = error instanceof AiAssistError ? error : new AiAssistError('unknown', { feature: 'search' });
            if (wrapped.code === 'consent_outdated') {
                const refreshed = await loadOverview(context, runId);
                if (refreshed && runRef.current === runId) setPhase({ kind: 'consent', outdated: true, phrase });
                return;
            }
            if (wrapped.code === 'not_approved') {
                setRemaining(null);
                setAccess('none');
                setPhase({ kind: 'needs_access', message: wrapped.message });
                return;
            }
            setPhase({ kind: 'error', message: wrapped.message });
            focusTarget.current = 'ai';
        } finally {
            if (abortRef.current === controller) abortRef.current = null;
        }
    };

    const handleInterpret = async () => {
        // Verrou SYNCHRONE, posé avant le premier `await` : un double clic ne
        // peut pas lancer deux envois (chacun coûterait une utilisation).
        if (isOffline || busyRef.current !== null || !offerAi) return;
        let context: SessionContext;
        try { context = captureSessionContext(); } catch {
            setPhase({ kind: 'error', message: 'Connectez-vous pour utiliser l’assistant.' });
            return;
        }
        const runId = lock();
        if (runId === null) return;
        const phrase = draft;
        checkingPhraseRef.current = phrase;
        setConsentError(null);
        setEmptyMessage(null);
        setPhase({ kind: 'checking' });
        setAnnouncement('Vérification de votre accès…');
        try {
            // Toujours relu : l'accord a pu changer dans « Assistant IA » entre-temps.
            // Délai maximal : un serveur muet ne bloque ni le bouton ni le verrou.
            const current = await loadOverview(context, runId, AI_SEARCH_CONSENT_TIMEOUT_MS);
            if (!current || runRef.current !== runId) return;
            const blocked = accessMessage(current);
            if (blocked) {
                setPhase({ kind: 'needs_access', message: blocked });
                setAnnouncement('');
                return;
            }
            if (!hasCurrentConsent(current, 'search')) {
                setPhase({ kind: 'consent', outdated: hasOutdatedConsent(current, 'search'), phrase });
                setAnnouncement('');
                return;
            }
            await interpret(context, runId, phrase);
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
        setPhase({ kind: 'error', message: aiAssistErrorText('cancelled') });
        setAnnouncement('');
        focusTarget.current = 'ai';
        if (wasSending) {
            try { refreshCounter(captureSessionContext()); } catch { /* compte changé */ }
        }
    };

    // Pendant l'enregistrement d'un accord, le verrou reste tenu par ce
    // parcours : « Annuler » n'ouvre pas la porte à un second envoi.
    const handleCancelConsent = () => {
        runRef.current += 1;
        setPhase({ kind: 'idle' });
        setConsentError(null);
        focusTarget.current = 'ai';
    };

    const handleAcceptConsent = async () => {
        // La phrase envoyée est celle pour laquelle la carte a été ouverte, jamais une autre.
        if (phase.kind !== 'consent') return;
        const phrase = phase.phrase;
        let context: SessionContext;
        try { context = captureSessionContext(); } catch { return; }
        const runId = lock();
        if (runId === null) return;
        const stillWanted = () => isSessionCurrent(context) && runRef.current === runId;
        setConsentWorking(true);
        setConsentError(null);
        try {
            try {
                // Délai maximal : un serveur muet ne bloque pas la carte (ni le verrou).
                await withTimeout(giveConsent('search', context), AI_SEARCH_CONSENT_TIMEOUT_MS);
            } catch (error) {
                if (!stillWanted()) return;
                setConsentError(error instanceof AiAssistError && error.code === 'timeout'
                    ? "L'enregistrement de votre accord ne répond pas. Rien n'a été envoyé : réessayez."
                    : error instanceof AiAssistError ? error.message : 'Votre accord n’a pas pu être enregistré. Réessayez.');
                return;
            }
            // « Annuler » pendant l'enregistrement : l'accord est donné, mais rien n'est envoyé.
            if (!stillWanted()) return;
            // La carte se ferme : le bouton IA, occupé, reprend le focus (« Annuler » reste atteignable).
            setConsentWorking(false);
            checkingPhraseRef.current = phrase;
            setPhase({ kind: 'checking' });
            setAnnouncement('Accord enregistré. Vérification de votre accès…');
            focusTarget.current = 'ai';
            const refreshed = await loadOverview(context, runId, AI_SEARCH_CONSENT_TIMEOUT_MS,
                "Votre accord est enregistré, mais l'assistant ne répond pas. Rien n'a été envoyé : réessayez.");
            if (!refreshed || !stillWanted()) return;
            await interpret(context, runId, phrase);
        } finally {
            unlock(runId);
            if (isSessionCurrent(context)) setConsentWorking(false);
        }
    };

    /** Applique la proposition (gratuit : jamais d'appel à l'assistant ici). */
    const applyProposal = async () => {
        if (!proposal || !proposalCriteria || !applicable || locating || lockedInput) return;
        const applyRun = applyRunRef.current + 1;
        applyRunRef.current = applyRun;
        const input: NaturalSearchInput = { phrase: proposal.phrase, source: proposal.source, criteria: proposalCriteria };
        if (proposalCriteria.near) {
            // Le lieu est cherché AVANT d'appliquer ; l'étiquette le montre.
            setLocating(true);
            setAnnouncement(proposalCriteria.near.kind === 'current_position' ? 'Localisation en cours…' : 'Recherche du lieu en cours…');
            const resolution = await resolveNear(proposalCriteria.near);
            if (applyRunRef.current !== applyRun) return;
            setLocating(false);
            input.near = resolution;
        }
        onApply(input);
        setRemoved([]);
        // Sur téléphone, le clavier se ferme : le focus va aux étiquettes
        // appliquées. Sur ordinateur, il revient au champ.
        focusTarget.current = variant === 'mobile' ? 'applied' : 'input';
        if (variant === 'mobile') inputRef.current?.blur();
        const count = buildFilterPlan(proposalCriteria, new Date(), input.near).chips.length;
        setAnnouncement(proposalCriteria.near && input.near && input.near.status !== 'ok'
            ? `Filtres appliqués, sauf : ${nearLabel(proposalCriteria.near, input.near).label}.`
            : `${plural(count, 'critère appliqué', 'critères appliqués')}.`);
    };

    const handleCancelLocating = () => {
        applyRunRef.current += 1;
        setLocating(false);
        setAnnouncement('Rien n’a été appliqué.');
        focusTarget.current = 'apply';
    };

    /** Passe de la recherche appliquée à la recherche par nom du texte tapé (annoncé). */
    const replaceWithName = () => {
        onReplaceWithNameSearch(draft);
        setAnnouncement(`Recherche par nom : « ${draft.trim()} ».`);
    };

    const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
        if (event.key !== 'Enter') return;
        // Entrée applique une phrase claire déjà comprise ; elle n'appelle
        // JAMAIS l'assistant, et ne change rien pour un simple nom.
        event.preventDefault();
        if (enterApplies) {
            void applyProposal();
            return;
        }
        // Un nom tapé par-dessus une recherche appliquée : Entrée (la touche
        // « Rechercher » du clavier) fait comme « Chercher « … » par nom à la place ».
        if (offerNameSearchInstead) replaceWithName();
    };

    const handleClear = () => {
        if (lockedInput) return;
        setRemoved([]);
        setEmptyMessage(null);
        applyRunRef.current += 1;
        setLocating(false);
        if (phase.kind === 'error' || phase.kind === 'needs_access') setPhase({ kind: 'idle' });
        // La croix efface aussi une recherche appliquée.
        if (naturalSearch) onClearNatural();
        else handleChange('');
        setAnnouncement(naturalSearch ? 'Recherche effacée.' : '');
        inputRef.current?.focus();
    };

    // Pendant un parcours de l'assistant (vérification, accord, attente) ou
    // une localisation, la recherche appliquée ne change pas : ces boutons
    // sont désactivés. Ils remettent aussi l'assistant à zéro.
    const handleResetAll = () => {
        if (lockedInput || locating) return;
        onResetAll();
        setRemoved([]);
        setPhase({ kind: 'idle' });
        setConsentError(null);
        focusTarget.current = 'input';
        setEmptyMessage(null);
        setAnnouncement('Tous les filtres sont réinitialisés.');
    };

    const handleUndo = () => {
        if (lockedInput || locating) return;
        onUndo();
        setRemoved([]);
        setPhase({ kind: 'idle' });
        setConsentError(null);
        setEmptyMessage(null);
        focusTarget.current = 'input';
        setAnnouncement('Recherche annulée : les filtres d’avant sont rétablis.');
    };

    const isDesktop = variant === 'desktop';
    const inputClass = isDesktop
        ? 'w-full pl-12 pr-12 py-4 bg-gray-100/80 dark:bg-white/10 border border-transparent rounded-2xl focus:ring-2 focus:ring-nature-green/50 focus:border-nature-green/50 transition-all dark:text-white placeholder-gray-500 dark:placeholder-gray-400 outline-none read-only:opacity-70'
        : 'w-full pl-10 pr-11 py-2 bg-gray-100 dark:bg-white/10 rounded-xl text-base focus:ring-2 focus:ring-nature-green/50 outline-none dark:text-white placeholder-gray-500 dark:placeholder-gray-400 read-only:opacity-70';
    // Ce que l'analyse gratuite n'a pas compris, tel qu'écrit (« lézard des murailles »).
    const unknownText = proposal?.source === 'local' && !local.understood ? local.criteria.text : null;
    /**
     * Recherche par nom active mais absente du champ (preset appliqué, nom
     * tapé sur la carte ou dans la galerie) : jamais un filtre invisible.
     */
    const nameSearchHidden = searchTerm !== '' && searchTerm !== draft && !(naturalSearch?.owned.includes('searchTerm'));

    let help = 'Un nom d’espèce ou de lieu, ou une phrase (« les oiseaux le mois dernier »).';
    if (editingApplied) help = enterApplies
        ? 'Entrée ou « Appliquer » remplace la recherche appliquée. La croix efface tout.'
        : offerNameSearchInstead
            ? 'La recherche appliquée reste active. Entrée cherche ce nom à la place ; la croix efface tout.'
            : 'La recherche appliquée reste active jusqu’à « Appliquer ». La croix efface tout.';
    else if (proposal && enterApplies) help = 'Entrée ou « Appliquer » : les filtres en cours seront remplacés.';
    else if (proposal && applicable) help = 'La recherche par nom est active. « Appliquer ce filtre » pour l’utiliser à la place.';

    return (
        <div className="space-y-2" data-testid={`natural-search-${variant}`}>
            {isDesktop && (
                <label htmlFor={inputId} className="block text-xs font-bold uppercase tracking-widest text-gray-500 dark:text-gray-400 mb-3 ml-1">
                    Recherche
                </label>
            )}
            <div className="relative">
                <span className={`pointer-events-none absolute inset-y-0 left-0 flex items-center ${isDesktop ? 'pl-4' : 'pl-3'}`}>
                    <svg aria-hidden="true" className={`${isDesktop ? 'w-5 h-5' : 'w-4 h-4'} text-gray-400`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path></svg>
                </span>
                <input
                    ref={inputRef}
                    type="text"
                    id={inputId}
                    enterKeyHint="search"
                    autoComplete="off"
                    placeholder={isDesktop ? 'Espèce, lieu, ou phrase : « les rapaces vus en mai près de chez moi »' : 'Espèce, lieu ou phrase…'}
                    aria-label={isDesktop ? undefined : 'Rechercher une observation ou écrire une phrase'}
                    aria-describedby={helpId}
                    value={draft}
                    maxLength={AI_SEARCH_LIMITS.maxInputChars}
                    readOnly={lockedInput}
                    onChange={event => handleChange(event.target.value)}
                    onKeyDown={handleKeyDown}
                    className={inputClass}
                />
                {(draft.length > 0 || naturalSearch !== null) && !lockedInput && (
                    <button
                        type="button"
                        onClick={handleClear}
                        disabled={locating}
                        aria-label="Effacer la recherche"
                        className={`absolute inset-y-0 right-0 flex items-center justify-center ${isDesktop ? 'w-12' : 'w-11'} text-gray-500 hover:text-gray-700 disabled:opacity-40 dark:text-gray-400 dark:hover:text-gray-200`}
                    >
                        <XMarkIcon className="h-4 w-4" />
                    </button>
                )}
            </div>
            <p id={helpId} className="px-1 text-xs text-gray-500 dark:text-gray-400">{help}</p>
            {offerNameSearchInstead && (
                <button type="button" onClick={replaceWithName} className={`${linkButton} min-h-[36px] px-1 text-xs`}>
                    Chercher « {draft} » par nom à la place
                </button>
            )}

            {proposal && proposalPlan && (
                <section aria-labelledby={proposalHeadingId} className="space-y-2 rounded-2xl border border-ai-200 bg-ai-50/60 p-3 dark:border-ai-400/30 dark:bg-ai-500/10" data-testid="natural-search-proposal">
                    <p id={proposalHeadingId} ref={proposalHeadingRef} tabIndex={-1} className="flex flex-wrap items-center gap-x-2 text-sm font-semibold text-nature-dark focus:outline-none dark:text-white">
                        {proposal.source === 'local' ? null : <SparklesIcon className="h-4 w-4 text-ai-600 dark:text-ai-300" />}
                        {enterApplies || proposal.source !== 'local' ? "J'ai compris :" : 'Lire aussi comme un filtre :'}
                        <span className="text-xs font-normal text-gray-500 dark:text-gray-400">{SOURCE_LABELS[proposal.source]}</span>
                    </p>
                    {proposalPlan.chips.length > 0 ? (
                        <ChipList
                            chips={proposalPlan.chips}
                            listLabel="Critères compris, pas encore appliqués"
                            removeLabel={chip => `Ne pas garder : ${chip.label}`}
                            // Pendant la localisation, les critères sont déjà partis vers l'application.
                            disabled={locating}
                            onRemove={chip => {
                                setRemoved(previous => [...previous, chip.ref]);
                                setAnnouncement(`Critère écarté : ${chip.label}.`);
                                focusTarget.current = 'proposal';
                            }}
                        />
                    ) : (
                        <p className="text-sm text-gray-600 dark:text-gray-300">Plus aucun critère : rien à appliquer.</p>
                    )}
                    {unknownText && (
                        <p className="text-xs text-gray-600 dark:text-gray-300">
                            Pas compris : « {unknownText} ». {proposalCriteria?.text ? 'Cherché tel quel dans les noms et les lieux.' : ''}
                        </p>
                    )}
                    {proposal.source === 'local' && local.notes.map(note => (
                        <p key={note} className="text-xs text-amber-800 dark:text-amber-200">{note}</p>
                    ))}
                    {proposalPlan.notes.map(note => <p key={note} className="text-xs text-amber-800 dark:text-amber-200">{note}</p>)}
                    <div className="flex flex-wrap items-center gap-2">
                        <button
                            ref={applyButtonRef}
                            type="button"
                            onClick={() => void applyProposal()}
                            disabled={locating || lockedInput || !applicable}
                            className={primaryButton}
                        >
                            {locating ? 'Localisation…' : enterApplies ? 'Appliquer' : 'Appliquer ce filtre'}
                        </button>
                        {locating && (
                            <button type="button" onClick={handleCancelLocating} className={quietButton}>Annuler</button>
                        )}
                    </div>
                </section>
            )}

            {!fragmented && local.unresolvedTime.length > 0 && !proposal && !alreadyApplied && (
                <p className="rounded-xl bg-ai-50 p-3 text-sm text-nature-dark dark:bg-ai-500/10 dark:text-white" data-testid="natural-search-time">
                    {local.unresolvedTime.map(passage => `« ${passage} »`).join(', ')} : une date, une durée ou une distance que l'analyse gratuite ne sait pas lire. Rien n'est appliqué.
                </p>
            )}
            {fragmented && !proposal && !alreadyApplied && (
                <p className="rounded-xl bg-ai-50 p-3 text-sm text-nature-dark dark:bg-ai-500/10 dark:text-white" data-testid="natural-search-fragments">
                    Plusieurs passages ne sont pas compris : {local.fragments.map(fragment => `« ${fragment} »`).join(', ')}. L'analyse gratuite ne sait pas les relier : rien n'est appliqué, la recherche se fait par nom.
                </p>
            )}

            {!proposal && (emptyMessage || (cachedRaw && !cached && !alreadyApplied)) && (
                <p className="rounded-xl bg-ai-50 p-3 text-sm text-nature-dark dark:bg-ai-500/10 dark:text-white" data-testid="natural-search-empty">
                    {emptyMessage ?? "Phrase déjà interprétée par l'assistant : aucun critère de recherche trouvé, rien n'est appliqué. La recherche se fait par nom."}
                </p>
            )}

            {showAiZone && (
                <div className="space-y-2" data-testid="natural-search-ai">
                    {phase.kind === 'consent' ? (
                        <AiConsentCard
                            feature="search"
                            outdated={phase.outdated}
                            onAccept={handleAcceptConsent}
                            onCancel={handleCancelConsent}
                            onOpenAssistant={onOpenAiAccess}
                            isWorking={consentWorking}
                            isOffline={isOffline}
                            error={consentError}
                            acceptLabel="Accepter et interpréter"
                            autoFocus
                        />
                    ) : (offerAi || isWaiting || consentWorking) && (access !== 'none' || isWaiting || consentWorking) ? (
                        <div className="flex flex-wrap items-start gap-2">
                            <AiButton
                                label="Interpréter avec l'IA"
                                loadingLabel={phase.kind === 'checking' ? 'Vérification…' : isWaiting ? 'Interprétation en cours…' : 'Enregistrement de l’accord…'}
                                onClick={() => void handleInterpret()}
                                isLoading={isWaiting || consentWorking}
                                isOffline={isOffline}
                                remaining={remaining}
                                hint="la phrase est envoyée à l'assistant ; rien n'est appliqué sans votre choix"
                                buttonRef={aiButtonRef}
                            />
                            {isWaiting && !adopted && (
                                <button type="button" onClick={handleStop} className={quietButton}>
                                    Annuler
                                </button>
                            )}
                        </div>
                    ) : offerAi && access === 'none' && phase.kind === 'idle' ? (
                        // Sans accès approuvé : pas de bouton payant, un lien discret.
                        <p className="px-1 text-xs text-gray-600 dark:text-gray-300" data-testid="natural-search-ai-access">
                            L'interprétation de phrases par l'IA fait partie de l'assistant, sur demande d'accès.{' '}
                            {onOpenAiAccess && (
                                <button type="button" onClick={onOpenAiAccess} className={`${linkButton} min-h-[36px] text-xs`}>
                                    Assistant IA
                                </button>
                            )}
                        </p>
                    ) : null}
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
                </div>
            )}

            {naturalSearch && (
                <NaturalSearchApplied
                    naturalSearch={naturalSearch}
                    onRemoveCriterion={onRemoveCriterion}
                    onUpdateNear={onUpdateNear}
                    onUndo={handleUndo}
                    onResetAll={handleResetAll}
                    excludedNoLatinName={excludedNoLatinName}
                    onAnnounce={setAnnouncement}
                    onEmptied={() => { focusTarget.current = 'input'; }}
                    locked={lockedInput || locating}
                    headingRef={appliedHeadingRef}
                />
            )}
            {nameSearchHidden && (
                <p className="flex flex-wrap items-center gap-x-2 px-1 text-xs text-gray-600 dark:text-gray-300" data-testid="natural-search-hidden-term">
                    Recherche par nom active : « {searchTerm} ».
                    <button type="button" onClick={() => onSearchChange('')} disabled={lockedInput} className={`${linkButton} min-h-[36px] text-xs`}>
                        Retirer
                    </button>
                </p>
            )}
            {!naturalSearch && hasActiveFilters && (
                <button type="button" onClick={handleResetAll} disabled={lockedInput || locating} className={`${quietButton} px-2 disabled:cursor-not-allowed disabled:opacity-50`}>
                    Réinitialiser les filtres
                </button>
            )}

            <p role="status" aria-live="polite" className="sr-only" data-testid="natural-search-status">{announcement}</p>
        </div>
    );
};

/** Message de la recherche pour un code d'erreur produit ici (pas par le serveur). */
const aiAssistErrorText = (code: AiAssistErrorCode): string => new AiAssistError(code, { feature: 'search' }).message;

export default NaturalSearch;
