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
import { readCachedSearch, rememberSearch } from '../services/naturalSearchCache';
import { resolveNear } from '../services/naturalSearchPlace';
import { captureSessionContext, isSessionCurrent, subscribeSessionChange, type SessionContext } from '../services/sessionScope';
import type { AppliedNaturalSearch, NaturalSearchInput } from '../hooks/useFilterControls';
import {
    AI_SEARCH_LIMITS,
    buildFilterPlan,
    criteriaIsEmpty,
    parseSearchResult,
    removeCriterion,
    type CriterionRef,
    type NearResolution,
    type SearchChip,
    type SearchCriteria,
} from '../utils/aiSearchFilters';
import { analyzeNaturalSearch, countWords } from '../utils/naturalSearchLocal';
import AiButton from './AiButton';
import AiConsentCard from './AiConsentCard';
import { SparklesIcon, XMarkIcon } from './icons';

/** Délai maximal de l'enregistrement d'un accord (et de la relecture qui suit). */
export const AI_SEARCH_CONSENT_TIMEOUT_MS = 20_000;

/** Erreurs après lesquelles la tentative a pu être comptée : on relit le compteur. */
const RECOUNT_CODES = new Set<AiAssistErrorCode>(['cancelled', 'timeout', 'network', 'unknown', 'internal_error']);

type Phase =
    | { kind: 'idle' }
    | { kind: 'checking' }
    | { kind: 'consent'; outdated: boolean }
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
}

/** Liste d'étiquettes « J'ai compris : … », chacune retirable au clavier. */
const ChipList: React.FC<ChipListProps> = ({ chips, removeLabel, onRemove, onRetryNear, retrying = false, listLabel, removeRefs }) => (
    <ul aria-label={listLabel} className="flex flex-wrap gap-2">
        {chips.map((chip, index) => (
            <li key={chip.id} className={`inline-flex max-w-full items-center gap-1 rounded-full border py-1 pl-3 pr-1 text-sm ${chipTone[chip.tone]}`} data-testid={`search-chip-${chip.id}`} data-tone={chip.tone}>
                <span className="min-w-0 [overflow-wrap:anywhere]">{chip.label}</span>
                {chip.tone === 'error' && chip.ref.field === 'near' && onRetryNear && (
                    <button
                        type="button"
                        onClick={onRetryNear}
                        disabled={retrying}
                        className="min-h-[36px] rounded-full px-2 text-xs font-semibold underline underline-offset-2 disabled:opacity-50"
                    >
                        {retrying ? 'Recherche…' : 'Réessayer'}
                    </button>
                )}
                <button
                    type="button"
                    ref={element => { if (removeRefs) removeRefs.current[index] = element; }}
                    onClick={() => onRemove(chip, index)}
                    aria-label={removeLabel(chip)}
                    className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full hover:bg-black/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ai-500 dark:hover:bg-white/15"
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
    onUpdateNear: (near: NearResolution) => void;
    onUndo: () => void;
    onResetAll: () => void;
    /** Observations écartées d'une catégorie ou d'un genre faute de nom latin. */
    excludedNoLatinName: number;
    /** Annonce d'un événement (région d'état du parent). */
    onAnnounce?: (message: string) => void;
    compact?: boolean;
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
    compact = false,
}) => {
    const headingId = useId();
    const headingRef = useRef<HTMLParagraphElement | null>(null);
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
    }, [chips]);

    const handleRetry = async () => {
        if (retrying || !naturalSearch.criteria.near) return;
        setRetrying(true);
        onUpdateNear({ status: 'pending' });
        const resolution = await resolveNear(naturalSearch.criteria.near);
        setRetrying(false);
        onUpdateNear(resolution);
        onAnnounce?.(resolution.status === 'ok' ? 'Lieu trouvé : critère appliqué.' : 'Lieu toujours introuvable : critère non appliqué.');
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
                    focusAfterRemove.current = index;
                    onRemoveCriterion(chip.ref);
                    onAnnounce?.(`Critère retiré : ${chip.label}.`);
                }}
                onRetryNear={() => void handleRetry()}
                retrying={retrying}
                removeRefs={removeRefs}
            />
            {notes.map(note => <p key={note} className="text-xs text-amber-800 dark:text-amber-200">{note}</p>)}
            {usesLatinName && excludedNoLatinName > 0 && (
                <p className="text-xs text-gray-600 dark:text-gray-300" data-testid="natural-search-excluded">
                    {plural(excludedNoLatinName, 'observation sans nom latin ne peut pas être rattachée', 'observations sans nom latin ne peuvent pas être rattachées')} à une catégorie ou à un genre : {excludedNoLatinName > 1 ? 'elles ne sont pas affichées' : "elle n'est pas affichée"}.
                </p>
            )}
            <div className="flex flex-wrap gap-2">
                <button type="button" onClick={onUndo} className={quietButton}>
                    Annuler la recherche
                </button>
                <button type="button" onClick={onResetAll} className={quietButton}>
                    Réinitialiser les filtres
                </button>
            </div>
        </section>
    );
};

// ---------------------------------------------------------------------------
// Champ de recherche
// ---------------------------------------------------------------------------

interface NaturalSearchProps {
    variant: 'mobile' | 'desktop';
    inputId: string;
    searchTerm: string;
    onSearchChange: (value: string) => void;
    naturalSearch: AppliedNaturalSearch | null;
    onApply: (input: NaturalSearchInput) => void;
    onRemoveCriterion: (ref: CriterionRef) => void;
    onUpdateNear: (near: NearResolution) => void;
    onUndo: () => void;
    onResetAll: () => void;
    hasActiveFilters: boolean;
    excludedNoLatinName: number;
    isOffline?: boolean;
    onOpenAiAccess?: () => void;
}

/**
 * Champ « Rechercher » de la liste, avec la recherche en langage naturel.
 *
 * - Chaque saisie passe par l'analyse locale GRATUITE ; si elle reconnaît
 *   des critères (période, groupe, « près de chez moi »…), elle les montre
 *   en étiquettes « J'ai compris : … » ; Entrée ou « Appliquer » les
 *   applique. Sinon, le champ cherche dans les noms, comme avant.
 * - Une phrase que l'analyse gratuite ne comprend pas entièrement peut être
 *   interprétée par l'assistant, sur un bouton explicite (1 utilisation) :
 *   JAMAIS sur Entrée. Accord au premier usage, à l'endroit même.
 * - Rien n'est appliqué avant que les étiquettes soient visibles ; tout
 *   s'annule (« Annuler la recherche »).
 * - Une phrase interprétée est gardée (cache du navigateur) : rejouée, elle
 *   ne coûte rien et marche hors ligne.
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
    naturalSearch,
    onApply,
    onRemoveCriterion,
    onUpdateNear,
    onUndo,
    onResetAll,
    hasActiveFilters,
    excludedNoLatinName,
    isOffline = false,
    onOpenAiAccess,
}) => {
    const baseId = useId();
    const helpId = `${baseId}-help`;
    const proposalHeadingId = `${baseId}-proposal`;
    const [draft, setDraft] = useState(() => naturalSearch?.phrase ?? searchTerm);
    const [phase, setPhase] = useState<Phase>({ kind: 'idle' });
    /** Dernière réponse de l'assistant, pour la phrase qu'elle interprète. */
    const [aiProposal, setAiProposal] = useState<Proposal | null>(null);
    /** Critères retirés de la proposition avant de l'appliquer. */
    const [removed, setRemoved] = useState<CriterionRef[]>([]);
    const [locating, setLocating] = useState(false);
    const [remaining, setRemaining] = useState<number | null>(() => readCachedAiCounter()?.remaining ?? null);
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
    /** Incrémenté par « Annuler », un changement de phrase ou de compte, le démontage : la suite s'arrête. */
    const runRef = useRef(0);
    const abortRef = useRef<AbortController | null>(null);
    /** Incrémenté à chaque nouvelle application : une localisation périmée est ignorée. */
    const applyRunRef = useRef(0);
    const inputRef = useRef<HTMLInputElement | null>(null);
    const aiButtonRef = useRef<HTMLButtonElement | null>(null);
    const proposalHeadingRef = useRef<HTMLParagraphElement | null>(null);
    const focusTarget = useRef<'ai' | 'proposal' | 'input' | null>(null);
    const counterLoaded = useRef(false);

    const trimmed = draft.trim();
    const local = useMemo(() => analyzeNaturalSearch(draft), [draft]);
    /** Phrase déjà interprétée par l'assistant (même sans aucun critère : elle n'est pas repayée). */
    const cachedRaw = useMemo(() => {
        void cacheVersion;
        if (trimmed.length === 0 || local.understood) return null;
        return readCachedSearch(draft);
    }, [draft, trimmed, local.understood, cacheVersion]);
    const cached = cachedRaw && !criteriaIsEmpty(cachedRaw) ? cachedRaw : null;
    const alreadyApplied = naturalSearch !== null && naturalSearch.phrase === draft;

    const proposal: Proposal | null = useMemo(() => {
        if (trimmed.length === 0 || alreadyApplied) return null;
        if (aiProposal && aiProposal.phrase === draft && !criteriaIsEmpty(aiProposal.criteria)) return aiProposal;
        if (cached) return { phrase: draft, source: 'cache', criteria: cached };
        if (local.hasCriteria) return { phrase: draft, source: 'local', criteria: local.criteria };
        return null;
    }, [trimmed, alreadyApplied, aiProposal, draft, cached, local]);

    const proposalCriteria = useMemo(() => {
        if (!proposal) return null;
        return removed.reduce((criteria, ref) => removeCriterion(criteria, ref), proposal.criteria);
    }, [proposal, removed]);
    const proposalPlan = useMemo(
        () => (proposalCriteria ? buildFilterPlan(proposalCriteria, new Date(), locating ? { status: 'pending' } : undefined) : null),
        [proposalCriteria, locating],
    );

    const isWaiting = phase.kind === 'checking' || phase.kind === 'analyzing';
    const lockedInput = isWaiting || phase.kind === 'consent' || consentWorking;
    const tooLong = draft.length > AI_SEARCH_LIMITS.maxInputChars;
    // Bouton IA : la phrase n'est pas entièrement comprise et n'a pas déjà été interprétée.
    const offerAi = trimmed.length > 0 && !tooLong && !local.understood && !cachedRaw && !alreadyApplied
        && !(aiProposal && aiProposal.phrase === draft)
        && (countWords(draft) >= 2 || local.hasCriteria);
    const showAiZone = offerAi || phase.kind !== 'idle';

    // Démontage : la suite d'un parcours en cours s'arrête.
    useEffect(() => () => {
        runRef.current += 1;
        applyRunRef.current += 1;
        abortRef.current?.abort();
    }, []);

    // Changement de compte : tout repart à zéro (la phrase n'est pas gardée).
    useEffect(() => subscribeSessionChange(() => {
        runRef.current += 1;
        applyRunRef.current += 1;
        abortRef.current?.abort();
        abortRef.current = null;
        busyRef.current = null;
        setDraft('');
        setAiProposal(null);
        setRemoved([]);
        setPhase({ kind: 'idle' });
        setLocating(false);
        setRemaining(null);
        setEmptyMessage(null);
        setAnnouncement('');
    }), []);

    // Recherche appliquée, annulée ou réinitialisée (ici, sur la carte, par
    // un preset, ou en retirant sa dernière étiquette) : le champ suit.
    const appliedPhrase = naturalSearch?.phrase ?? null;
    const previousApplied = useRef(appliedPhrase);
    useEffect(() => {
        if (previousApplied.current === appliedPhrase) return;
        previousApplied.current = appliedPhrase;
        setDraft(appliedPhrase ?? searchTerm);
        setRemoved([]);
    }, [appliedPhrase, searchTerm]);

    // Compteur : lu une fois, en silence, quand le bouton IA apparaît.
    useEffect(() => {
        if (!offerAi || isOffline || counterLoaded.current) return;
        counterLoaded.current = true;
        let context: SessionContext;
        try { context = captureSessionContext(); } catch { return; }
        let cancelled = false;
        getAiOverview(context).then(next => {
            if (cancelled || !isSessionCurrent(context)) return;
            setRemaining(next.access.kind === 'approved' ? next.access.remaining : null);
        }).catch(() => undefined);
        return () => { cancelled = true; };
    }, [offerAi, isOffline]);

    // Focus rendu au bon endroit après chaque étape.
    useEffect(() => {
        const target = focusTarget.current;
        if (!target) return;
        const element = { ai: aiButtonRef.current, proposal: proposalHeadingRef.current, input: inputRef.current }[target];
        if (!element) return;
        focusTarget.current = null;
        element.focus();
    }, [phase, proposal, removed, naturalSearch]);

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

    /** Relit le compteur en arrière-plan (gratuit), après une tentative qui a pu compter. */
    const refreshCounter = (context: SessionContext) => {
        if (!navigator.onLine) return;
        getAiOverview(context).then(next => {
            if (!isSessionCurrent(context)) return;
            setRemaining(next.access.kind === 'approved' ? next.access.remaining : null);
        }).catch(() => undefined);
    };

    const handleChange = (value: string) => {
        if (lockedInput) return;
        setDraft(value);
        setRemoved([]);
        setEmptyMessage(null);
        applyRunRef.current += 1;
        setLocating(false);
        if (phase.kind === 'error' || phase.kind === 'needs_access') setPhase({ kind: 'idle' });
        const analysis = analyzeNaturalSearch(value);
        const cachedHit = !analysis.understood ? readCachedSearch(value) : null;
        const phraseMode = analysis.hasCriteria || (cachedHit !== null && !criteriaIsEmpty(cachedHit));
        if (!phraseMode) {
            // Recherche par nom, comme avant : appliquée à chaque frappe.
            onSearchChange(value);
        } else if (naturalSearch === null && searchTerm !== '') {
            // Une phrase : la recherche par nom ne reflète plus le champ ; rien d'autre n'est appliqué avant « Appliquer ».
            onSearchChange('');
        }
    };

    const loadOverview = async (context: SessionContext, runId: number, timeoutMs?: number): Promise<AiOverview | null> => {
        try {
            const pending = getAiOverview(context);
            const next = await (timeoutMs ? withTimeout(pending, timeoutMs) : pending);
            if (!isSessionCurrent(context) || runRef.current !== runId) return null;
            setRemaining(next.access.kind === 'approved' ? next.access.remaining : null);
            return next;
        } catch (error) {
            if (!isSessionCurrent(context) || runRef.current !== runId) return null;
            setPhase({ kind: 'error', message: error instanceof AiAssistError ? error.message : "Impossible de joindre l'assistant. Réessayez plus tard." });
            setAnnouncement('');
            focusTarget.current = 'ai';
            return null;
        }
    };

    /** Envoie la phrase. Ne relance jamais un appel déjà parti. */
    const interpret = async (context: SessionContext, runId: number, phrase: string) => {
        if (abortRef.current || runRef.current !== runId) return;
        const controller = new AbortController();
        abortRef.current = controller;
        setPhase({ kind: 'analyzing' });
        setAnnouncement('Interprétation de la phrase en cours…');
        try {
            const response = await callAiText('search', { text: phrase }, { signal: controller.signal }, context);
            if (controller.signal.aborted || runRef.current !== runId || !isSessionCurrent(context)) return;
            setRemaining(response.remaining);
            rememberRemaining(response.remaining, context);
            const criteria = parseSearchResult(response.result);
            if (!criteria) {
                setPhase({ kind: 'error', message: new AiAssistError('invalid_output', { feature: 'search' }).message });
                setAnnouncement('');
                focusTarget.current = 'ai';
                return;
            }
            // Payé : gardé tout de suite, pour ne jamais le repayer.
            rememberSearch(phrase, criteria, context);
            setCacheVersion(version => version + 1);
            setAiProposal({ phrase, source: 'ai', criteria });
            setRemoved([]);
            setPhase({ kind: 'idle' });
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
        } catch (error) {
            if (controller.signal.aborted || runRef.current !== runId || !isSessionCurrent(context)) return;
            setAnnouncement('');
            const wrapped = error instanceof AiAssistError ? error : new AiAssistError('unknown', { feature: 'search' });
            if (typeof wrapped.remaining === 'number') {
                setRemaining(wrapped.remaining);
                rememberRemaining(wrapped.remaining, context);
            } else if (RECOUNT_CODES.has(wrapped.code)) {
                refreshCounter(context);
            }
            if (wrapped.code === 'consent_outdated') {
                const refreshed = await loadOverview(context, runId);
                if (refreshed && runRef.current === runId) setPhase({ kind: 'consent', outdated: true });
                return;
            }
            if (wrapped.code === 'not_approved') {
                setRemaining(null);
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
        setConsentError(null);
        setEmptyMessage(null);
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
                return;
            }
            if (!hasCurrentConsent(current, 'search')) {
                setPhase({ kind: 'consent', outdated: hasOutdatedConsent(current, 'search') });
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
        setPhase({ kind: 'error', message: new AiAssistError('cancelled', { feature: 'search' }).message });
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
        let context: SessionContext;
        try { context = captureSessionContext(); } catch { return; }
        const runId = lock();
        if (runId === null) return;
        const phrase = draft;
        const stillWanted = () => isSessionCurrent(context) && runRef.current === runId;
        setConsentWorking(true);
        setConsentError(null);
        try {
            // Délai maximal : un serveur muet ne bloque pas la carte (ni le verrou).
            await withTimeout(giveConsent('search', context), AI_SEARCH_CONSENT_TIMEOUT_MS);
            // « Annuler » pendant l'enregistrement : l'accord est donné, mais rien n'est envoyé.
            if (!stillWanted()) return;
            const refreshed = await loadOverview(context, runId, AI_SEARCH_CONSENT_TIMEOUT_MS);
            if (!refreshed || !stillWanted()) return;
            setConsentWorking(false);
            await interpret(context, runId, phrase);
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

    /** Applique la proposition (gratuit : jamais d'appel à l'assistant ici). */
    const applyProposal = async () => {
        if (!proposal || !proposalCriteria || locating || lockedInput) return;
        if (criteriaIsEmpty(proposalCriteria)) return;
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
        // Le bouton « Appliquer » disparaît : le focus revient au champ.
        focusTarget.current = 'input';
        const count = buildFilterPlan(proposalCriteria, new Date(), input.near).chips.length;
        setAnnouncement(input.near && input.near.status !== 'ok'
            ? `Filtres appliqués, sauf le lieu : ${input.near.status === 'denied' ? 'position refusée' : 'lieu introuvable'}.`
            : `${plural(count, 'critère appliqué', 'critères appliqués')}.`);
    };

    const handleCancelLocating = () => {
        applyRunRef.current += 1;
        setLocating(false);
        setAnnouncement('Rien n’a été appliqué.');
    };

    const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
        if (event.key !== 'Enter') return;
        // Entrée applique ce qui est déjà compris ; elle n'appelle JAMAIS l'assistant.
        event.preventDefault();
        if (proposal) void applyProposal();
    };

    const handleClear = () => {
        if (lockedInput) return;
        handleChange('');
        inputRef.current?.focus();
    };

    const handleResetAll = () => {
        onResetAll();
        setDraft('');
        setRemoved([]);
        focusTarget.current = 'input';
        setAiProposal(null);
        setEmptyMessage(null);
        setAnnouncement('Tous les filtres sont réinitialisés.');
    };

    const handleUndo = () => {
        onUndo();
        setAnnouncement('Recherche annulée : les filtres d’avant sont rétablis.');
    };

    const isDesktop = variant === 'desktop';
    const inputClass = isDesktop
        ? 'w-full pl-12 pr-12 py-4 bg-gray-100/80 dark:bg-white/10 border border-transparent rounded-2xl focus:ring-2 focus:ring-nature-green/50 focus:border-nature-green/50 transition-all dark:text-white placeholder-gray-500 dark:placeholder-gray-400 outline-none read-only:opacity-70'
        : 'w-full pl-10 pr-11 py-2 bg-gray-100 dark:bg-white/10 rounded-xl text-base focus:ring-2 focus:ring-nature-green/50 outline-none dark:text-white placeholder-gray-500 dark:placeholder-gray-400 read-only:opacity-70';
    // Ce que l'analyse gratuite n'a pas compris, tel qu'écrit (« lézard des murailles »).
    const unknownText = proposal?.source === 'local' && !local.understood ? local.criteria.text : null;

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
                {draft.length > 0 && !lockedInput && (
                    <button
                        type="button"
                        onClick={handleClear}
                        aria-label="Effacer la recherche"
                        className={`absolute inset-y-0 right-0 flex items-center justify-center ${isDesktop ? 'w-12' : 'w-11'} text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200`}
                    >
                        <XMarkIcon className="h-4 w-4" />
                    </button>
                )}
            </div>
            <p id={helpId} className="px-1 text-xs text-gray-500 dark:text-gray-400">
                {proposal
                    ? "Appuyez sur Entrée ou « Appliquer » : les filtres en cours seront remplacés."
                    : 'Un nom d’espèce ou de lieu, ou une phrase (« les oiseaux le mois dernier »).'}
            </p>

            {proposal && proposalPlan && (
                <section aria-labelledby={proposalHeadingId} className="space-y-2 rounded-2xl border border-ai-200 bg-ai-50/60 p-3 dark:border-ai-400/30 dark:bg-ai-500/10" data-testid="natural-search-proposal">
                    <p id={proposalHeadingId} ref={proposalHeadingRef} tabIndex={-1} className="flex flex-wrap items-center gap-x-2 text-sm font-semibold text-nature-dark focus:outline-none dark:text-white">
                        {proposal.source === 'local' ? null : <SparklesIcon className="h-4 w-4 text-ai-600 dark:text-ai-300" />}
                        J'ai compris :
                        <span className="text-xs font-normal text-gray-500 dark:text-gray-400">{SOURCE_LABELS[proposal.source]}</span>
                    </p>
                    {proposalPlan.chips.length > 0 ? (
                        <ChipList
                            chips={proposalPlan.chips}
                            listLabel="Critères compris, pas encore appliqués"
                            removeLabel={chip => `Ne pas garder : ${chip.label}`}
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
                            Pas compris : « {unknownText} ». {proposalCriteria?.text ? "Cherché tel quel dans les noms et les lieux ; l'assistant peut interpréter la phrase entière." : ''}
                        </p>
                    )}
                    {local.notes.length > 0 && proposal.source === 'local' && local.notes.map(note => (
                        <p key={note} className="text-xs text-amber-800 dark:text-amber-200">{note}</p>
                    ))}
                    {proposalPlan.notes.map(note => <p key={note} className="text-xs text-amber-800 dark:text-amber-200">{note}</p>)}
                    <div className="flex flex-wrap items-center gap-2">
                        <button
                            type="button"
                            onClick={() => void applyProposal()}
                            disabled={locating || lockedInput || !proposalCriteria || criteriaIsEmpty(proposalCriteria)}
                            className={primaryButton}
                        >
                            {locating ? 'Localisation…' : 'Appliquer'}
                        </button>
                        {locating && (
                            <button type="button" onClick={handleCancelLocating} className={quietButton}>Annuler</button>
                        )}
                    </div>
                </section>
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
                    ) : (offerAi || isWaiting) && (
                        <div className="flex flex-wrap items-start gap-2">
                            <AiButton
                                label="Interpréter avec l'IA"
                                loadingLabel={phase.kind === 'checking' ? 'Vérification…' : 'Interprétation en cours…'}
                                onClick={() => void handleInterpret()}
                                isLoading={isWaiting}
                                isOffline={isOffline}
                                remaining={remaining}
                                hint="la phrase est envoyée à l'assistant ; rien n'est appliqué sans votre choix"
                                buttonRef={aiButtonRef}
                            />
                            {isWaiting && (
                                <button type="button" onClick={handleStop} className={quietButton}>
                                    Annuler
                                </button>
                            )}
                        </div>
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
                />
            )}
            {!naturalSearch && hasActiveFilters && (
                <button type="button" onClick={handleResetAll} className={`${quietButton} px-2`}>
                    Réinitialiser les filtres
                </button>
            )}

            <p role="status" aria-live="polite" className="sr-only" data-testid="natural-search-status">{announcement}</p>
        </div>
    );
};

export default NaturalSearch;
