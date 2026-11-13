import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import type { Observation } from '../types';
import {
    AiAssistError,
    callAiText,
    getAiOverview,
    giveConsent,
    hasCurrentConsent,
    hasOutdatedConsent,
    parseSummaryResult,
    readCachedAiCounter,
    rememberRemaining,
    type AiOverview,
} from '../services/aiAssistService';
import { readMonthlySummary, saveMonthlySummary, type StoredMonthlySummary } from '../services/monthlySummaryCache';
import { captureSessionContext, isSessionCurrent, type SessionContext } from '../services/sessionScope';
import { getOfflineQueueSnapshot } from '../services/storageService';
import {
    buildMonthlySummaryPayload,
    computeMonthlySummaryStats,
    defaultSummaryMonth,
    formatMonthLabel,
    selectableMonths,
    summaryFingerprint,
} from '../utils/monthlySummaryStats';
import AiButton from './AiButton';
import AiConsentCard from './AiConsentCard';
import { SparklesIcon } from './icons';

interface MonthlySummaryCardProps {
    observations: Observation[];
    isOffline?: boolean;
    isMobileView?: boolean;
    /** Ouvre « Assistant IA » (accès, consentements). */
    onOpenAiAssistant?: () => void;
    /** Date de référence (tests). */
    now?: Date;
}

type Phase =
    | { kind: 'idle' }
    /** Relecture de l'accès et de l'accord, avant tout envoi. */
    | { kind: 'checking' }
    | { kind: 'consent'; outdated: boolean }
    | { kind: 'writing' }
    | { kind: 'needs_access'; message: string }
    | { kind: 'error'; message: string };

const cardShellClass = 'bg-white/86 dark:bg-nature-dark-surface/88 backdrop-blur-xl rounded-[28px] shadow-ios border border-white/25 dark:border-white/10';
const listTitleClass = 'text-xs font-bold uppercase tracking-[0.14em] text-gray-500 dark:text-gray-400';
const moreButtonClass = 'mt-2 min-h-[36px] text-sm font-semibold text-ai-700 underline underline-offset-2 dark:text-ai-200';

const formatDate = (iso: string): string => {
    const date = new Date(iso);
    return Number.isNaN(date.getTime()) ? '' : date.toLocaleDateString('fr-FR');
};

/** « de mars 2026 », mais « d'octobre 2026 » (élision devant une voyelle). */
const ofMonth = (label: string): string => (/^[aeiouyàâéèêh]/i.test(label) ? `d'${label}` : `de ${label}`);

/** Nombre d'éléments visibles avant « Voir … » ; tout ce qui est envoyé reste consultable. */
const SPECIES_SHOWN = 5;
const NEW_SPECIES_SHOWN = 8;

/**
 * Mois proposé à l'ouverture : le dernier mois complet s'il compte des
 * observations ; sinon le mois le plus récent qui en compte parmi les 12
 * proposés (un petit carnet n'ouvre pas sur un mois vide).
 */
const initialMonth = (months: readonly string[], counts: Map<string, number>, now: Date): string => {
    const lastComplete = defaultSummaryMonth(now);
    if ((counts.get(lastComplete) ?? 0) > 0) return lastComplete;
    return months.find(month => (counts.get(month) ?? 0) > 0) ?? lastComplete;
};

const StatTile: React.FC<{ label: string; value: number; previous?: number; previousYear: string }> = ({ label, value, previous, previousYear }) => (
    <div className="rounded-2xl bg-gray-50/80 px-3 py-3 text-center dark:bg-white/5">
        <p className="text-2xl font-bold tabular-nums text-nature-dark dark:text-white">{value}</p>
        <p className="text-xs font-medium text-gray-600 dark:text-gray-300">{label}</p>
        {previous !== undefined && (
            <p className="mt-1 text-[0.7rem] text-gray-500 dark:text-gray-400">{previousYear} : {previous}</p>
        )}
    </div>
);

/**
 * Bilan du mois (onglet Stats) : les chiffres sont calculés ici, gratuitement
 * et hors ligne ; un court texte peut être rédigé par l'assistant (1
 * utilisation), puis conservé dans le navigateur. Le texte est affiché en
 * texte brut (jamais interprété comme du HTML ou du markdown). Tous les
 * chiffres envoyés à l'assistant sont consultables sur la carte.
 *
 * Garde-fous contre une utilisation payée sans le vouloir : un seul envoi à
 * la fois (verrou posé dès le clic), sélecteur de mois figé pendant la
 * vérification, l'accord et la rédaction, et « Annuler » arrête la suite.
 */
const MonthlySummaryCard: React.FC<MonthlySummaryCardProps> = ({
    observations,
    isOffline = false,
    isMobileView = false,
    onOpenAiAssistant,
    now: nowProp,
}) => {
    const now = useMemo(() => nowProp ?? new Date(), [nowProp]);
    const selectId = useId();
    const months = useMemo(() => selectableMonths(now), [now]);
    const monthCounts = useMemo(() => {
        const counts = new Map<string, number>();
        for (const observation of observations) {
            const month = (observation.date ?? '').slice(0, 7);
            counts.set(month, (counts.get(month) ?? 0) + 1);
        }
        return counts;
    }, [observations]);
    const [month, setMonth] = useState(() => initialMonth(months, monthCounts, now));
    const [phase, setPhase] = useState<Phase>({ kind: 'idle' });
    const [remaining, setRemaining] = useState<number | null>(() => readCachedAiCounter(undefined, now)?.remaining ?? null);
    const [consentWorking, setConsentWorking] = useState(false);
    const [consentError, setConsentError] = useState<string | null>(null);
    const [cacheVersion, setCacheVersion] = useState(0);
    const [unsaved, setUnsaved] = useState<{ month: string; summary: StoredMonthlySummary } | null>(null);
    const [announcement, setAnnouncement] = useState('');
    const [showAllSpecies, setShowAllSpecies] = useState(false);
    const [showAllNew, setShowAllNew] = useState(false);
    const abortRef = useRef<AbortController | null>(null);
    /** Verrou synchrone : un seul parcours « Rédiger » à la fois. */
    const busyRef = useRef(false);
    /** Incrémenté par « Annuler », un changement de mois ou le démontage : la suite s'arrête. */
    const runRef = useRef(0);
    const buttonRef = useRef<HTMLButtonElement | null>(null);
    const focusButtonRef = useRef(false);

    const stats = useMemo(() => computeMonthlySummaryStats(observations, month, now), [observations, month, now]);
    const payload = useMemo(() => buildMonthlySummaryPayload(stats), [stats]);
    const fingerprint = useMemo(() => summaryFingerprint(payload), [payload]);
    const stored = useMemo(() => {
        void cacheVersion;
        if (unsaved && unsaved.month === month) return unsaved.summary;
        return readMonthlySummary(month, undefined, now);
    }, [month, cacheVersion, unsaved, now]);

    let pendingSync = 0;
    try { pendingSync = getOfflineQueueSnapshot().length; } catch { pendingSync = 0; }

    // Démontage : la suite d'un parcours en cours s'arrête.
    useEffect(() => () => {
        runRef.current += 1;
        abortRef.current?.abort();
    }, []);

    // En ligne : lit le compteur de l'assistant dès l'ouverture, en silence.
    // Une erreur ici n'affiche rien : elle sera redite au clic. Sans accès
    // approuvé, aucun compteur n'est affiché.
    useEffect(() => {
        if (isOffline) return;
        let context: SessionContext;
        try { context = captureSessionContext(); } catch { return; }
        let cancelled = false;
        getAiOverview(context).then(next => {
            if (cancelled || !isSessionCurrent(context)) return;
            setRemaining(next.access.kind === 'approved' ? next.access.remaining : null);
        }).catch(() => undefined);
        return () => { cancelled = true; };
    }, [isOffline]);

    // Changement de mois : on repart d'un état neutre (le sélecteur est figé
    // pendant un parcours, donc rien n'est en vol ici).
    useEffect(() => {
        runRef.current += 1;
        setPhase({ kind: 'idle' });
        setConsentError(null);
        setShowAllSpecies(false);
        setShowAllNew(false);
    }, [month]);

    // Rend le focus au bouton IA quand la carte d'accord disparaît.
    useEffect(() => {
        if (phase.kind === 'consent' || !focusButtonRef.current) return;
        focusButtonRef.current = false;
        buttonRef.current?.focus();
    }, [phase]);

    const loadOverview = async (context: SessionContext): Promise<AiOverview | null> => {
        try {
            const next = await getAiOverview(context);
            if (!isSessionCurrent(context)) return null;
            setRemaining(next.access.kind === 'approved' ? next.access.remaining : null);
            return next;
        } catch (error) {
            if (!isSessionCurrent(context)) return null;
            setPhase({ kind: 'error', message: error instanceof AiAssistError ? error.message : "Impossible de joindre l'assistant. Réessayez plus tard." });
            return null;
        }
    };

    const accessMessage = (current: AiOverview): string | null => {
        switch (current.access.kind) {
            case 'approved': return null;
            case 'pending': return "Votre demande d'accès à l'assistant attend encore sa validation.";
            case 'refused':
            case 'revoked': return "L'assistant n'est pas ouvert pour votre compte.";
            case 'consent_outdated': return "Les conditions de l'assistant ont changé : renouvelez votre accord dans « Assistant IA ».";
            default: return "Le bilan rédigé fait partie de l'assistant IA, sur demande d'accès.";
        }
    };

    /** Envoie les chiffres du mois `requestMonth`. N'annule jamais un appel déjà parti. */
    const write = async (context: SessionContext, runId: number, requestMonth: string, requestPayload: typeof payload, requestFingerprint: string) => {
        if (abortRef.current || runRef.current !== runId) return;
        const controller = new AbortController();
        abortRef.current = controller;
        const label = formatMonthLabel(requestMonth);
        setPhase({ kind: 'writing' });
        setAnnouncement(`Rédaction du bilan ${ofMonth(label)} en cours…`);
        try {
            const response = await callAiText('summary', requestPayload, { signal: controller.signal }, context);
            if (controller.signal.aborted || !isSessionCurrent(context)) return;
            setRemaining(response.remaining);
            rememberRemaining(response.remaining, context);
            const parsed = parseSummaryResult(response.result);
            if (!parsed) {
                const message = new AiAssistError('invalid_output', { feature: 'summary' }).message;
                setPhase({ kind: 'error', message });
                setAnnouncement('');
                return;
            }
            const summary: StoredMonthlySummary = {
                text: parsed.text,
                generatedAt: new Date().toISOString(),
                fingerprint: requestFingerprint,
                provisional: requestPayload.provisional,
            };
            if (saveMonthlySummary(requestMonth, summary, context)) {
                setUnsaved(null);
                setCacheVersion(version => version + 1);
            } else {
                setUnsaved({ month: requestMonth, summary });
            }
            setPhase({ kind: 'idle' });
            setAnnouncement(`Bilan ${ofMonth(label)} rédigé.`);
        } catch (error) {
            if (controller.signal.aborted || !isSessionCurrent(context)) return;
            setAnnouncement('');
            const wrapped = error instanceof AiAssistError ? error : new AiAssistError('unknown', { feature: 'summary' });
            if (typeof wrapped.remaining === 'number') {
                setRemaining(wrapped.remaining);
                rememberRemaining(wrapped.remaining, context);
            }
            if (wrapped.code === 'consent_outdated') {
                const refreshed = await loadOverview(context);
                if (refreshed) setPhase({ kind: 'consent', outdated: true });
                return;
            }
            if (wrapped.code === 'not_approved') {
                setRemaining(null);
                setPhase({ kind: 'needs_access', message: wrapped.message });
                return;
            }
            setPhase({ kind: 'error', message: wrapped.message });
        } finally {
            if (abortRef.current === controller) abortRef.current = null;
        }
    };

    const handleWrite = async () => {
        // Verrou SYNCHRONE, posé avant le premier `await` : un double clic ne
        // peut pas lancer deux envois (chacun coûterait une utilisation).
        if (isOffline || busyRef.current) return;
        let context: SessionContext;
        try {
            context = captureSessionContext();
        } catch {
            setPhase({ kind: 'error', message: 'Connectez-vous pour utiliser l’assistant.' });
            return;
        }
        busyRef.current = true;
        const runId = runRef.current + 1;
        runRef.current = runId;
        const requestMonth = month;
        const requestPayload = payload;
        const requestFingerprint = fingerprint;
        setConsentError(null);
        setPhase({ kind: 'checking' });
        setAnnouncement('Vérification de votre accès…');
        try {
            // Toujours relu : l'accord a pu changer dans « Assistant IA » entre-temps.
            const current = await loadOverview(context);
            if (!current || !isSessionCurrent(context) || runRef.current !== runId) return;
            const blocked = accessMessage(current);
            if (blocked) {
                setPhase({ kind: 'needs_access', message: blocked });
                setAnnouncement('');
                return;
            }
            if (!hasCurrentConsent(current, 'summary')) {
                setPhase({ kind: 'consent', outdated: hasOutdatedConsent(current, 'summary') });
                setAnnouncement('');
                return;
            }
            await write(context, runId, requestMonth, requestPayload, requestFingerprint);
        } finally {
            busyRef.current = false;
        }
    };

    const handleCancelConsent = () => {
        runRef.current += 1;
        focusButtonRef.current = true;
        setConsentWorking(false);
        setPhase({ kind: 'idle' });
    };

    const handleAcceptConsent = async () => {
        if (busyRef.current) return;
        let context: SessionContext;
        try {
            context = captureSessionContext();
        } catch {
            return;
        }
        busyRef.current = true;
        const runId = runRef.current + 1;
        runRef.current = runId;
        const requestMonth = month;
        const requestPayload = payload;
        const requestFingerprint = fingerprint;
        const stillWanted = () => isSessionCurrent(context) && runRef.current === runId;
        setConsentWorking(true);
        setConsentError(null);
        try {
            await giveConsent('summary', context);
            // « Annuler » pendant l'envoi : l'accord est donné, mais rien n'est rédigé.
            if (!stillWanted()) return;
            const refreshed = await loadOverview(context);
            if (!refreshed || !stillWanted()) return;
            setConsentWorking(false);
            focusButtonRef.current = true;
            await write(context, runId, requestMonth, requestPayload, requestFingerprint);
        } catch (error) {
            if (!stillWanted()) return;
            setConsentError(error instanceof AiAssistError ? error.message : 'Votre accord n’a pas pu être enregistré. Réessayez.');
        } finally {
            busyRef.current = false;
            if (isSessionCurrent(context)) setConsentWorking(false);
        }
    };

    const monthLabel = formatMonthLabel(month);
    const previousYearLabel = String(Number(month.slice(0, 4)) - 1);
    const isEmpty = stats.totals.observations === 0;
    const isChecking = phase.kind === 'checking';
    const isWriting = phase.kind === 'writing';
    const isBusy = isChecking || isWriting || consentWorking;
    const writtenBeforeEnd = stored !== null && !stats.provisional && stored.provisional;
    const figuresChanged = stored !== null && !stats.provisional && !stored.provisional && stored.fingerprint !== fingerprint;
    // Ce qui est affiché = ce qui est envoyé (15 espèces, 30 nouvelles au plus).
    const sentSpecies = payload.topSpecies;
    const visibleSpecies = showAllSpecies ? sentSpecies : sentSpecies.slice(0, SPECIES_SHOWN);
    const sentNew = payload.newSpecies;
    const visibleNew = showAllNew ? sentNew : sentNew.slice(0, NEW_SPECIES_SHOWN);
    const hiddenNew = sentNew.length - visibleNew.length;

    return (
        <section
            className={`${cardShellClass} ${isMobileView ? 'p-4' : 'p-7'} space-y-5`}
            aria-labelledby={`${selectId}-title`}
            data-testid="monthly-summary-card"
        >
            <div className={`flex ${isMobileView ? 'flex-col gap-3' : 'items-start justify-between gap-6'}`}>
                <div className="flex items-start gap-3">
                    <span className="mt-1 inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-ai-100 text-ai-700 dark:bg-ai-500/20 dark:text-ai-200">
                        <SparklesIcon className="w-5 h-5" />
                    </span>
                    <div>
                        <h3 id={`${selectId}-title`} className="text-[1.6rem] font-serif font-bold tracking-tight text-nature-dark dark:text-white">Bilan du mois</h3>
                        <p className="text-sm text-gray-600 dark:text-gray-300">
                            Les chiffres d&apos;un mois, et si vous le souhaitez un court texte rédigé par l&apos;assistant.
                        </p>
                    </div>
                </div>
                <div className="shrink-0">
                    <label htmlFor={selectId} className="block text-xs font-semibold uppercase tracking-[0.14em] text-gray-500 dark:text-gray-400">Mois</label>
                    <select
                        id={selectId}
                        value={month}
                        onChange={(e) => setMonth(e.target.value)}
                        disabled={isBusy}
                        className="mt-1 min-h-[44px] w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-nature-dark shadow-sm focus:outline-none focus:ring-2 focus:ring-ai-500 disabled:opacity-60 dark:border-white/10 dark:bg-nature-dark-surface dark:text-white sm:w-auto"
                    >
                        {months.map(option => {
                            const count = monthCounts.get(option) ?? 0;
                            const provisional = option === months[0];
                            return (
                                <option key={option} value={option}>
                                    {formatMonthLabel(option)}{provisional ? ' (provisoire)' : ''}{count > 0 ? ` · ${count} obs.` : ''}
                                </option>
                            );
                        })}
                    </select>
                </div>
            </div>

            {stats.provisional && (
                <p className="inline-flex items-center rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-800 dark:bg-amber-500/15 dark:text-amber-200">
                    Mois en cours : chiffres provisoires
                </p>
            )}

            {isEmpty ? (
                <p className="rounded-2xl bg-gray-50/80 px-4 py-6 text-center text-sm text-gray-600 dark:bg-white/5 dark:text-gray-300">
                    Aucune observation en {monthLabel} : rien à résumer pour ce mois.
                </p>
            ) : (
                <>
                    <div className="grid grid-cols-3 gap-2 sm:gap-3">
                        <StatTile label={stats.totals.observations > 1 ? 'observations' : 'observation'} value={stats.totals.observations} previous={stats.previousYear?.observations} previousYear={previousYearLabel} />
                        <StatTile label={stats.totals.species > 1 ? 'espèces' : 'espèce'} value={stats.totals.species} previous={stats.previousYear?.species} previousYear={previousYearLabel} />
                        <StatTile label={stats.totals.activeDays > 1 ? "jours d'activité" : "jour d'activité"} value={stats.totals.activeDays} previous={stats.previousYear?.activeDays} previousYear={previousYearLabel} />
                    </div>

                    <div className={`grid gap-5 ${isMobileView ? 'grid-cols-1' : 'md:grid-cols-3'}`}>
                        {sentSpecies.length > 0 && (
                            <div data-testid="monthly-summary-species">
                                <p className={listTitleClass}>Les plus observées</p>
                                <ol className="mt-2 space-y-1">
                                    {visibleSpecies.map((item, index) => (
                                        <li key={`${index}-${item.name}`} className="flex items-baseline justify-between gap-3 text-sm">
                                            <span className="truncate text-nature-dark dark:text-white">{item.name}</span>
                                            <span className="shrink-0 tabular-nums text-gray-500 dark:text-gray-400">{item.count} ind.</span>
                                        </li>
                                    ))}
                                </ol>
                                {sentSpecies.length > SPECIES_SHOWN && (
                                    <button type="button" onClick={() => setShowAllSpecies(value => !value)} aria-expanded={showAllSpecies} className={moreButtonClass}>
                                        {showAllSpecies ? 'Voir moins' : `Voir les ${sentSpecies.length} espèces`}
                                    </button>
                                )}
                            </div>
                        )}
                        <div data-testid="monthly-summary-groups">
                            <p className={listTitleClass}>Par groupe</p>
                            <ul className="mt-2 space-y-1">
                                {stats.groups.map(group => (
                                    <li key={group.group} className="flex items-baseline justify-between gap-3 text-sm">
                                        <span className="truncate text-nature-dark dark:text-white">{group.group}</span>
                                        <span className="shrink-0 tabular-nums text-gray-500 dark:text-gray-400">
                                            {group.observations} obs. · {group.species} esp.
                                        </span>
                                    </li>
                                ))}
                            </ul>
                        </div>
                        <div data-testid="monthly-summary-new">
                            <p className={listTitleClass}>Nouvelles pour votre carnet</p>
                            {sentNew.length > 0 ? (
                                <>
                                    <ul className="mt-2 flex flex-wrap gap-1.5">
                                        {visibleNew.map((name, index) => (
                                            <li key={`${index}-${name}`} className="rounded-full bg-nature-green/10 px-2.5 py-1 text-xs font-medium text-nature-green-text dark:bg-green-500/15 dark:text-green-300">{name}</li>
                                        ))}
                                        {payload.newSpeciesMore > 0 && (showAllNew || hiddenNew === 0) && (
                                            <li className="rounded-full bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-600 dark:bg-white/10 dark:text-gray-300">
                                                + {payload.newSpeciesMore} autre{payload.newSpeciesMore > 1 ? 's' : ''}
                                            </li>
                                        )}
                                    </ul>
                                    {sentNew.length > NEW_SPECIES_SHOWN && (
                                        <button type="button" onClick={() => setShowAllNew(value => !value)} aria-expanded={showAllNew} className={moreButtonClass}>
                                            {showAllNew ? 'Voir moins' : `Voir les ${sentNew.length + payload.newSpeciesMore} nouvelles`}
                                        </button>
                                    )}
                                </>
                            ) : (
                                <p className="mt-2 text-sm text-gray-600 dark:text-gray-300">Aucune espèce nouvelle ce mois-ci.</p>
                            )}
                        </div>
                    </div>
                </>
            )}

            {pendingSync > 0 && (
                <p className="text-xs text-gray-500 dark:text-gray-400">
                    Des enregistrements attendent leur synchronisation : les chiffres peuvent encore changer.
                </p>
            )}

            {stored && (
                <figure className="rounded-2xl border border-ai-200 bg-ai-50/70 p-4 dark:border-ai-400/30 dark:bg-ai-500/10" data-testid="monthly-summary-text">
                    <blockquote className="whitespace-pre-line text-[0.95rem] leading-relaxed text-nature-dark dark:text-white">
                        {stored.text}
                    </blockquote>
                    <figcaption className="mt-3 flex items-center gap-1.5 text-xs text-gray-600 dark:text-gray-300">
                        <SparklesIcon className="w-3.5 h-3.5 text-ai-600 dark:text-ai-300" />
                        Rédigé par l&apos;assistant le {formatDate(stored.generatedAt)}{stored.provisional ? ' (mois en cours)' : ''}. Les chiffres ci-dessus font foi.
                    </figcaption>
                </figure>
            )}

            {figuresChanged && (
                <p className="rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:bg-amber-900/20 dark:text-amber-100" data-testid="monthly-summary-changed">
                    Chiffres modifiés depuis la rédaction de ce bilan.
                </p>
            )}
            {writtenBeforeEnd && (
                <p className="rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:bg-amber-900/20 dark:text-amber-100" data-testid="monthly-summary-before-end">
                    Ce bilan a été rédigé avant la fin du mois.
                </p>
            )}

            {phase.kind === 'consent' ? (
                <AiConsentCard
                    feature="summary"
                    outdated={phase.outdated}
                    onAccept={handleAcceptConsent}
                    onCancel={handleCancelConsent}
                    onOpenAssistant={onOpenAiAssistant}
                    isWorking={consentWorking}
                    isOffline={isOffline}
                    error={consentError}
                    acceptLabel="Accepter et rédiger"
                    autoFocus
                />
            ) : !isEmpty && (
                <AiButton
                    label={stored ? 'Régénérer le bilan' : 'Rédiger le bilan'}
                    loadingLabel={isChecking ? 'Vérification…' : 'Rédaction en cours…'}
                    onClick={() => void handleWrite()}
                    isLoading={isChecking || isWriting}
                    isOffline={isOffline}
                    remaining={remaining}
                    hint={stored ? 'remplace le texte ci-dessus' : 'texte court, à relire'}
                    buttonRef={buttonRef}
                />
            )}

            <p role="status" aria-live="polite" className="sr-only" data-testid="monthly-summary-status">{announcement}</p>

            {phase.kind === 'needs_access' && (
                <div role="alert" className="rounded-xl bg-ai-50 p-3 text-sm text-nature-dark dark:bg-ai-500/10 dark:text-white">
                    <p>{phase.message}</p>
                    {onOpenAiAssistant && (
                        <button type="button" onClick={onOpenAiAssistant} className="mt-2 font-semibold text-ai-700 underline underline-offset-2 dark:text-ai-200">
                            Ouvrir « Assistant IA »
                        </button>
                    )}
                </div>
            )}
            {phase.kind === 'error' && (
                <p role="alert" className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-900/20 dark:text-amber-100">{phase.message}</p>
            )}
        </section>
    );
};

export default MonthlySummaryCard;
