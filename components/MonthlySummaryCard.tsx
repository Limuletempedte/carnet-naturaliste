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
    | { kind: 'consent'; outdated: boolean }
    | { kind: 'writing' }
    | { kind: 'needs_access'; message: string }
    | { kind: 'error'; message: string };

const cardShellClass = 'bg-white/86 dark:bg-nature-dark-surface/88 backdrop-blur-xl rounded-[28px] shadow-ios border border-white/25 dark:border-white/10';

const formatDate = (iso: string): string => {
    const date = new Date(iso);
    return Number.isNaN(date.getTime()) ? '' : date.toLocaleDateString('fr-FR');
};

const NEW_SPECIES_SHOWN = 8;
const TOP_SPECIES_SHOWN = 5;

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
 * texte brut (jamais interprété comme du HTML ou du markdown).
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
    const abortRef = useRef<AbortController | null>(null);

    const stats = useMemo(() => computeMonthlySummaryStats(observations, month, now), [observations, month, now]);
    const payload = useMemo(() => buildMonthlySummaryPayload(stats), [stats]);
    const fingerprint = useMemo(() => summaryFingerprint(payload), [payload]);
    const stored = useMemo(() => {
        void cacheVersion;
        if (unsaved && unsaved.month === month) return unsaved.summary;
        return readMonthlySummary(month);
    }, [month, cacheVersion, unsaved]);

    let pendingSync = 0;
    try { pendingSync = getOfflineQueueSnapshot().length; } catch { pendingSync = 0; }

    // Annule une rédaction en cours si la carte disparaît.
    useEffect(() => () => abortRef.current?.abort(), []);

    // En ligne : lit le compteur de l'assistant dès l'ouverture,
    // en silence. Une erreur ici n'affiche rien : elle sera redite au clic.
    useEffect(() => {
        if (isOffline) return;
        let context: SessionContext;
        try { context = captureSessionContext(); } catch { return; }
        let cancelled = false;
        getAiOverview(context).then(next => {
            if (cancelled || !isSessionCurrent(context)) return;
            if (next.access.kind === 'approved') setRemaining(next.access.remaining);
        }).catch(() => undefined);
        return () => { cancelled = true; };
    }, [isOffline]);

    // Changement de mois : on repart d'un état neutre.
    useEffect(() => {
        abortRef.current?.abort();
        setPhase({ kind: 'idle' });
        setConsentError(null);
    }, [month]);

    const loadOverview = async (context: SessionContext): Promise<AiOverview | null> => {
        try {
            const next = await getAiOverview(context);
            if (!isSessionCurrent(context)) return null;
            if (next.access.kind === 'approved') setRemaining(next.access.remaining);
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

    const write = async (context: SessionContext) => {
        abortRef.current?.abort();
        const controller = new AbortController();
        abortRef.current = controller;
        const requestMonth = month;
        const requestPayload = payload;
        const requestFingerprint = fingerprint;
        setPhase({ kind: 'writing' });
        try {
            const response = await callAiText('summary', requestPayload, { signal: controller.signal }, context);
            if (controller.signal.aborted || !isSessionCurrent(context)) return;
            setRemaining(response.remaining);
            rememberRemaining(response.remaining, context);
            const parsed = parseSummaryResult(response.result);
            if (!parsed) {
                setPhase({ kind: 'error', message: new AiAssistError('invalid_output', { feature: 'summary' }).message });
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
        } catch (error) {
            if (controller.signal.aborted || !isSessionCurrent(context)) return;
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
                setPhase({ kind: 'needs_access', message: wrapped.message });
                return;
            }
            setPhase({ kind: 'error', message: wrapped.message });
        } finally {
            if (abortRef.current === controller) abortRef.current = null;
        }
    };

    const handleWrite = async () => {
        if (isOffline || phase.kind === 'writing') return;
        let context: SessionContext;
        try {
            context = captureSessionContext();
        } catch {
            setPhase({ kind: 'error', message: 'Connectez-vous pour utiliser l’assistant.' });
            return;
        }
        setConsentError(null);
        // Toujours relu : l'accord a pu changer dans « Assistant IA » entre-temps.
        const current = await loadOverview(context);
        if (!current || !isSessionCurrent(context)) return;
        const blocked = accessMessage(current);
        if (blocked) {
            setPhase({ kind: 'needs_access', message: blocked });
            return;
        }
        if (!hasCurrentConsent(current, 'summary')) {
            setPhase({ kind: 'consent', outdated: hasOutdatedConsent(current, 'summary') });
            return;
        }
        await write(context);
    };

    const handleAcceptConsent = async () => {
        let context: SessionContext;
        try {
            context = captureSessionContext();
        } catch {
            return;
        }
        setConsentWorking(true);
        setConsentError(null);
        try {
            await giveConsent('summary', context);
            if (!isSessionCurrent(context)) return;
            const refreshed = await loadOverview(context);
            if (!refreshed || !isSessionCurrent(context)) return;
            await write(context);
        } catch (error) {
            if (!isSessionCurrent(context)) return;
            setConsentError(error instanceof AiAssistError ? error.message : 'Votre accord n’a pas pu être enregistré. Réessayez.');
        } finally {
            if (isSessionCurrent(context)) setConsentWorking(false);
        }
    };

    const monthLabel = formatMonthLabel(month);
    const previousYearLabel = String(Number(month.slice(0, 4)) - 1);
    const isEmpty = stats.totals.observations === 0;
    const isWriting = phase.kind === 'writing';
    const figuresChanged = stored !== null && !stats.provisional && stored.fingerprint !== fingerprint;
    const writtenBeforeEnd = stored !== null && !stats.provisional && stored.provisional && !figuresChanged;
    const shownNewSpecies = stats.newSpecies.slice(0, NEW_SPECIES_SHOWN);
    const moreNewSpecies = stats.newSpecies.length - shownNewSpecies.length;
    const topSpecies = stats.species.slice(0, TOP_SPECIES_SHOWN);

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
                        disabled={isWriting}
                        className="mt-1 min-h-[44px] w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-nature-dark shadow-sm focus:outline-none focus:ring-2 focus:ring-ai-500 dark:border-white/10 dark:bg-nature-dark-surface dark:text-white sm:w-auto"
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

                    <div className={`grid gap-4 ${isMobileView ? 'grid-cols-1' : 'md:grid-cols-2'}`}>
                        {topSpecies.length > 0 && (
                            <div>
                                <p className="text-xs font-bold uppercase tracking-[0.14em] text-gray-500 dark:text-gray-400">Les plus observées</p>
                                <ol className="mt-2 space-y-1">
                                    {topSpecies.map((item, index) => (
                                        <li key={`${index}-${item.name}`} className="flex items-baseline justify-between gap-3 text-sm">
                                            <span className="truncate text-nature-dark dark:text-white">{item.name}</span>
                                            <span className="shrink-0 tabular-nums text-gray-500 dark:text-gray-400">{item.count} ind.</span>
                                        </li>
                                    ))}
                                </ol>
                            </div>
                        )}
                        <div>
                            <p className="text-xs font-bold uppercase tracking-[0.14em] text-gray-500 dark:text-gray-400">Nouvelles pour votre carnet</p>
                            {shownNewSpecies.length > 0 ? (
                                <ul className="mt-2 flex flex-wrap gap-1.5">
                                    {shownNewSpecies.map((name, index) => (
                                        <li key={`${index}-${name}`} className="rounded-full bg-nature-green/10 px-2.5 py-1 text-xs font-medium text-nature-green-text dark:bg-green-500/15 dark:text-green-300">{name}</li>
                                    ))}
                                    {moreNewSpecies > 0 && (
                                        <li className="rounded-full bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-600 dark:bg-white/10 dark:text-gray-300">+ {moreNewSpecies} autre{moreNewSpecies > 1 ? 's' : ''}</li>
                                    )}
                                </ul>
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
                <p className="rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:bg-amber-900/20 dark:text-amber-100">
                    Ce bilan a été rédigé avant la fin du mois.
                </p>
            )}

            {phase.kind === 'consent' ? (
                <AiConsentCard
                    feature="summary"
                    outdated={phase.outdated}
                    onAccept={handleAcceptConsent}
                    onCancel={() => setPhase({ kind: 'idle' })}
                    onOpenAssistant={onOpenAiAssistant}
                    isWorking={consentWorking}
                    isOffline={isOffline}
                    error={consentError}
                    acceptLabel="Accepter et rédiger"
                />
            ) : !isEmpty && (
                <AiButton
                    label={stored ? 'Régénérer le bilan' : 'Rédiger le bilan'}
                    loadingLabel="Rédaction en cours…"
                    onClick={() => void handleWrite()}
                    isLoading={isWriting}
                    isOffline={isOffline}
                    remaining={remaining}
                    hint={stored ? 'remplace le texte ci-dessus' : 'texte court, à relire'}
                />
            )}

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
