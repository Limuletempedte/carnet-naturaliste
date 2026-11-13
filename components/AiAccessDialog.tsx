import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useAccessibleDialog } from '../hooks/useAccessibleDialog';
import {
    AI_TEXT_CONSENT_VERSIONS,
    AiAssistError,
    getAiOverview,
    giveConsent,
    hasCurrentConsent,
    hasOutdatedConsent,
    readCachedAiCounter,
    requestAccess,
    withdrawAccess,
    withdrawConsent,
    type AiAccessStatus,
    type AiOverview,
    type AiTextFeature,
} from '../services/aiAssistService';
import { captureSessionContext, isSessionCurrent, type SessionContext } from '../services/sessionScope';
import { SparklesIcon } from './icons';
import { AiFeatureConsentText, consentCheckboxLabel } from './AiConsentCard';

const CONTACT_EMAIL = 'carnetnaturaliste.app@gmail.com';

interface AiAccessDialogProps {
    isOpen: boolean;
    onClose: () => void;
    isOffline?: boolean;
}

type ViewState =
    | { phase: 'loading' }
    | { phase: 'error'; message: string }
    | { phase: 'ready'; overview: AiOverview };

/**
 * Texte de consentement, version `AI_CONSENT_VERSION` (services/aiAssistService.ts).
 * Toute modification de fond impose de changer cette version ET
 * `CONSENT_VERSION` dans supabase/functions/ai-identify/logic.ts.
 */
export const AiConsentText: React.FC = () => (
    <div className="space-y-3 text-sm text-gray-700 dark:text-gray-300" data-testid="ai-consent-text">
        <p>
            L'assistant propose jusqu'à 3 hypothèses d'espèce à partir de la photo d'une observation.
            Il est fourni par <strong>Anthropic</strong> (modèle Claude).
        </p>
        <div>
            <p className="font-semibold text-nature-dark dark:text-white">Ce qui est envoyé</p>
            <ul className="list-disc pl-5 space-y-1">
                <li>La photo, réencodée (1 280 px au plus, sans métadonnées EXIF ni position GPS).</li>
                <li>Le mois de l'observation, le pays et le département.</li>
                <li>Le groupe taxonomique, seulement si vous l'avez choisi, et l'habitat s'il est renseigné.</li>
            </ul>
        </div>
        <div>
            <p className="font-semibold text-nature-dark dark:text-white">Ce qui n'est pas envoyé</p>
            <p>Ni coordonnées GPS, ni commune, ni lieu-dit, ni altitude, ni date exacte, ni commentaire, ni votre adresse e-mail.</p>
        </div>
        <div>
            <p className="font-semibold text-nature-dark dark:text-white">Destinataire, transfert et conservation</p>
            <ul className="list-disc pl-5 space-y-1">
                <li>Destinataire : Anthropic, via Anthropic Ireland Ltd pour l'Espace économique européen.</li>
                <li>Transfert hors de l'UE : les données sont stockées aux <strong>États-Unis</strong> et peuvent être traitées hors de l'UE, dans le cadre des clauses contractuelles types de l'UE.</li>
                <li>Chez Anthropic : effacement sous 30 jours ; jusqu'à 2 ans si un contrôle de sécurité signale la demande. Par défaut, ces données ne servent pas à entraîner les modèles.</li>
                <li>Dans le Carnet : un journal d'usage (date, modèle, volume traité, coût, résultat technique) est gardé 3 mois pour contrôler les coûts et les abus. Il ne contient ni la photo ni les hypothèses.</li>
            </ul>
        </div>
        <div>
            <p className="font-semibold text-nature-dark dark:text-white">À savoir</p>
            <ul className="list-disc pl-5 space-y-1">
                <li><strong>Une photo déjà envoyée ne peut pas être rappelée.</strong></li>
                <li>Évitez les photos où des personnes sont reconnaissables.</li>
                <li>C'est une aide, pas une certitude : l'IA peut se tromper. C'est vous qui décidez ; rien n'est rempli sans votre choix et aucune décision n'est prise automatiquement.</li>
                <li>Quota : 20 analyses par mois. Une analyse lancée compte, même si la connexion est coupée pendant l'attente. Le service peut être suspendu, par exemple quand le budget du mois est atteint.</li>
                <li>Vous pouvez retirer votre accord à tout moment depuis cette fenêtre (« Retirer mon accord »).</li>
                <li>Contact : {CONTACT_EMAIL}</li>
            </ul>
        </div>
    </div>
);

const formatDate = (iso: string | null): string | null => {
    if (!iso) return null;
    const date = new Date(iso);
    return Number.isNaN(date.getTime()) ? null : date.toLocaleDateString('fr-FR');
};

const formatDayMonth = (iso: string): string => {
    const date = new Date(iso);
    return Number.isNaN(date.getTime()) ? '' : date.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' });
};

const plural = (n: number, singular: string, pluralForm = `${singular}s`) => `${n} ${n > 1 ? pluralForm : singular}`;

/** Fonctionnalités présentées dans le point central (une carte chacune). */
interface FeatureInfo {
    key: 'identify' | AiTextFeature;
    title: string;
    purpose: string;
    where: string;
    sent: string;
}

const FEATURES: readonly FeatureInfo[] = [
    {
        key: 'identify',
        title: "Aide à l'identification (photo)",
        purpose: "Propose jusqu'à 3 hypothèses d'espèce à vérifier à partir de la photo d'une observation.",
        where: "Formulaire d'observation, sous la photo.",
        sent: "La photo réencodée (sans EXIF ni GPS), le mois, le pays, le département, le groupe si vous l'avez choisi et l'habitat.",
    },
    {
        key: 'summary',
        title: 'Bilan du mois',
        purpose: "Rédige un court texte à partir des chiffres d'un mois, calculés par l'application.",
        where: 'Onglet Stats, carte « Bilan du mois ».',
        sent: "Le mois, les totaux, la répartition par groupe et les noms d'espèces avec leurs effectifs. Jamais de lieu, de commentaire ni de date précise.",
    },
];

const USAGE_LABELS: Record<string, [string, string]> = {
    identify: ['analyse photo', 'analyses photo'],
    summary: ['bilan', 'bilans'],
    note: ['note', 'notes'],
    search: ['recherche', 'recherches'],
};

const AiAccessDialog: React.FC<AiAccessDialogProps> = ({ isOpen, onClose, isOffline = false }) => {
    const { dialogRef, dialogProps } = useAccessibleDialog({ isOpen, onClose, titleId: 'ai-access-dialog-title' });
    const [view, setView] = useState<ViewState>({ phase: 'loading' });
    const [consentChecked, setConsentChecked] = useState(false);
    const [featureChecked, setFeatureChecked] = useState<Partial<Record<AiTextFeature, boolean>>>({});
    const [isWorking, setIsWorking] = useState(false);
    const [confirmWithdraw, setConfirmWithdraw] = useState(false);
    const [actionError, setActionError] = useState<string | null>(null);
    const [justRequested, setJustRequested] = useState(false);
    const contextRef = useRef<SessionContext | null>(null);

    const load = useCallback(async () => {
        setView({ phase: 'loading' });
        let context: SessionContext;
        try {
            context = captureSessionContext();
        } catch {
            setView({ phase: 'error', message: 'Connectez-vous pour utiliser l’assistant.' });
            return;
        }
        contextRef.current = context;
        try {
            const overview = await getAiOverview(context);
            if (isSessionCurrent(context)) setView({ phase: 'ready', overview });
        } catch (error) {
            if (!isSessionCurrent(context)) return;
            const message = error instanceof AiAssistError ? error.message : 'Impossible de lire l’état de votre accès.';
            setView({ phase: 'error', message });
        }
    }, []);

    useEffect(() => {
        if (!isOpen) return;
        setConsentChecked(false);
        setFeatureChecked({});
        setConfirmWithdraw(false);
        setActionError(null);
        setJustRequested(false);
        void load();
    }, [isOpen, load]);

    if (!isOpen) return null;

    const runAction = async (action: (context: SessionContext) => Promise<void>, after: () => void) => {
        const context = contextRef.current;
        if (!context || !isSessionCurrent(context)) return;
        setIsWorking(true);
        setActionError(null);
        try {
            await action(context);
            if (!isSessionCurrent(context)) return;
            after();
            const overview = await getAiOverview(context);
            if (isSessionCurrent(context)) setView({ phase: 'ready', overview });
        } catch (error) {
            if (!isSessionCurrent(context)) return;
            setActionError(error instanceof AiAssistError ? error.message : 'L’opération a échoué. Réessayez.');
        } finally {
            if (isSessionCurrent(context)) setIsWorking(false);
        }
    };

    const handleRequest = (replaceExisting: boolean) => runAction(
        context => requestAccess({ replaceExisting }, context),
        () => { setJustRequested(true); setConsentChecked(false); },
    );

    const handleWithdraw = () => runAction(
        context => withdrawAccess(context),
        () => { setConfirmWithdraw(false); setJustRequested(false); },
    );

    const handleGiveConsent = (feature: AiTextFeature) => runAction(
        context => giveConsent(feature, context),
        () => setFeatureChecked(prev => ({ ...prev, [feature]: false })),
    );

    const handleWithdrawConsent = (feature: AiTextFeature) => runAction(
        context => withdrawConsent(feature, context),
        () => undefined,
    );

    const primaryButton = 'px-5 py-2 rounded-full font-semibold text-white bg-nature-green hover:bg-green-600 transition-all disabled:opacity-50 disabled:cursor-not-allowed';
    const aiPrimaryButton = 'min-h-[40px] px-4 py-2 rounded-full text-sm font-semibold text-white bg-ai-600 hover:bg-ai-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed';
    const secondaryButton = 'px-5 py-2 rounded-full font-semibold text-gray-800 bg-gray-300 hover:bg-gray-400 dark:bg-gray-600 dark:text-white dark:hover:bg-gray-500 transition-all';
    const dangerButton = 'px-5 py-2 rounded-full font-semibold text-red-700 border border-red-300 hover:bg-red-50 dark:text-red-300 dark:border-red-500/50 dark:hover:bg-red-900/20 transition-all disabled:opacity-50 disabled:cursor-not-allowed';
    const smallDangerButton = 'min-h-[40px] px-4 py-2 rounded-full text-sm font-semibold text-red-700 border border-red-300 hover:bg-red-50 dark:text-red-300 dark:border-red-500/50 dark:hover:bg-red-900/20 transition-all disabled:opacity-50 disabled:cursor-not-allowed';
    const sectionTitle = 'text-xs font-bold uppercase tracking-[0.16em] text-gray-500 dark:text-gray-400';

    const consentForm = (replaceExisting: boolean) => (
        <div className="space-y-4">
            <AiConsentText />
            <label className="flex items-start gap-3 text-sm font-medium text-nature-dark dark:text-white">
                <input
                    type="checkbox"
                    checked={consentChecked}
                    onChange={(e) => setConsentChecked(e.target.checked)}
                    className="mt-1 h-4 w-4 accent-nature-green"
                />
                <span>J'ai lu ces informations et j'accepte l'envoi de mes photos à Anthropic lorsque je lance une analyse.</span>
            </label>
            <button
                type="button"
                onClick={() => void handleRequest(replaceExisting)}
                disabled={!consentChecked || isWorking || isOffline}
                className={primaryButton}
            >
                {isWorking ? 'Envoi…' : replaceExisting ? 'Renouveler mon accord' : "Demander l'accès"}
            </button>
        </div>
    );

    const withdrawBlock = (
        <div className="pt-4 border-t border-gray-200 dark:border-white/10">
            {confirmWithdraw ? (
                <div className="space-y-2">
                    <p className="text-sm text-gray-700 dark:text-gray-300">
                        Votre demande ou votre accès sera supprimé, ainsi que vos accords aux autres fonctions (bilan du mois). Pour réutiliser l'assistant, il faudra refaire une demande, validée à nouveau à la main.
                    </p>
                    <div className="flex flex-wrap gap-2">
                        <button type="button" onClick={() => void handleWithdraw()} disabled={isWorking || isOffline} className={dangerButton}>
                            {isWorking ? 'Retrait…' : 'Confirmer le retrait'}
                        </button>
                        <button type="button" onClick={() => setConfirmWithdraw(false)} className={secondaryButton}>Garder mon accord</button>
                    </div>
                </div>
            ) : (
                <button type="button" onClick={() => setConfirmWithdraw(true)} disabled={isWorking || isOffline} className={dangerButton}>
                    Retirer mon accord
                </button>
            )}
        </div>
    );

    const emailLine = (
        <p className="text-sm text-gray-700 dark:text-gray-300">
            Les demandes sont validées à la main. Prévenez le propriétaire par e-mail à <strong>{CONTACT_EMAIL}</strong> en indiquant l'adresse de votre compte.
        </p>
    );

    const counterBlock = (overview: AiOverview) => {
        if (overview.access.kind !== 'approved') return null;
        const { remaining, monthlyQuota } = overview.access;
        const details = Object.entries(overview.usedByFeature)
            .filter(([, count]) => typeof count === 'number' && count > 0)
            .map(([feature, count]) => {
                const [one, many] = USAGE_LABELS[feature] ?? [feature, feature];
                return plural(count as number, one, many);
            });
        const ratio = monthlyQuota > 0 ? Math.min(1, Math.max(0, remaining / monthlyQuota)) : 0;
        return (
            <div className="rounded-2xl border border-ai-200 bg-ai-50/70 p-4 dark:border-ai-400/30 dark:bg-ai-500/10" data-testid="ai-counter">
                <p className="text-sm font-medium text-nature-dark dark:text-white">
                    Accès actif : <strong>{remaining}</strong> utilisation{remaining > 1 ? 's' : ''} restante{remaining > 1 ? 's' : ''} ce mois-ci (sur {monthlyQuota}).
                </p>
                <div className="mt-2 h-2 rounded-full bg-ai-100 dark:bg-white/10" aria-hidden="true">
                    <div className="h-2 rounded-full bg-ai-500" style={{ width: `${Math.round(ratio * 100)}%` }} />
                </div>
                <p className="mt-2 text-xs text-gray-600 dark:text-gray-300">
                    {details.length > 0 ? `Ce mois-ci : ${details.join(', ')}. ` : 'Aucune utilisation ce mois-ci. '}
                    Compteur commun à toutes les fonctions (1 action = 1 utilisation), il repart le 1er du mois.
                </p>
            </div>
        );
    };

    const featureConsentControls = (feature: AiTextFeature, overview: AiOverview) => {
        if (!AI_TEXT_CONSENT_VERSIONS[feature]) return null;
        if (hasCurrentConsent(overview, feature)) {
            return (
                <div className="flex flex-wrap items-center gap-2">
                    <span className="inline-flex items-center rounded-full bg-ai-100 px-3 py-1 text-xs font-semibold text-ai-700 dark:bg-ai-500/20 dark:text-ai-200">Accord donné</span>
                    <button
                        type="button"
                        onClick={() => void handleWithdrawConsent(feature)}
                        disabled={isWorking || isOffline}
                        className={smallDangerButton}
                    >
                        Retirer mon accord au bilan
                    </button>
                </div>
            );
        }
        const outdated = hasOutdatedConsent(overview, feature);
        return (
            <details className="text-sm" open={outdated}>
                <summary className="cursor-pointer font-semibold text-ai-700 dark:text-ai-200">
                    {outdated ? 'Le texte a changé : relire et redonner mon accord' : 'Lire et donner mon accord'}
                </summary>
                <div className="mt-3 space-y-3">
                    <AiFeatureConsentText feature={feature} />
                    <label className="flex items-start gap-3 text-sm font-medium text-nature-dark dark:text-white">
                        <input
                            type="checkbox"
                            checked={featureChecked[feature] ?? false}
                            onChange={(e) => setFeatureChecked(prev => ({ ...prev, [feature]: e.target.checked }))}
                            className="mt-1 h-4 w-4 shrink-0 accent-ai-600"
                        />
                        <span>{consentCheckboxLabel(feature)}</span>
                    </label>
                    <button
                        type="button"
                        onClick={() => void handleGiveConsent(feature)}
                        disabled={!featureChecked[feature] || isWorking || isOffline}
                        className={aiPrimaryButton}
                    >
                        {isWorking ? 'Envoi…' : 'Donner mon accord'}
                    </button>
                </div>
            </details>
        );
    };

    const featureCards = (overview: AiOverview) => (
        <div className="space-y-3">
            <p className={sectionTitle}>Fonctions</p>
            {FEATURES.map(feature => (
                <article key={feature.key} className="rounded-2xl border border-gray-200 bg-white/60 p-4 space-y-2 dark:border-white/10 dark:bg-white/5" data-testid={`ai-feature-${feature.key}`}>
                    <h4 className="flex items-center gap-2 font-semibold text-nature-dark dark:text-white">
                        <SparklesIcon className="w-4 h-4 text-ai-600 dark:text-ai-300" />
                        {feature.title}
                    </h4>
                    <p className="text-sm text-gray-700 dark:text-gray-300">{feature.purpose}</p>
                    <dl className="grid grid-cols-[auto,1fr] gap-x-2 gap-y-1 text-xs text-gray-600 dark:text-gray-300">
                        <dt className="font-semibold">Où :</dt><dd>{feature.where}</dd>
                        <dt className="font-semibold">Envoyé :</dt><dd>{feature.sent}</dd>
                    </dl>
                    {feature.key === 'identify' ? (
                        <details className="text-sm">
                            <summary className="cursor-pointer font-semibold text-ai-700 dark:text-ai-200">Accord donné avec votre demande d'accès — rappel des conditions</summary>
                            <div className="mt-3"><AiConsentText /></div>
                        </details>
                    ) : featureConsentControls(feature.key, overview)}
                </article>
            ))}
        </div>
    );

    const renderStatus = (overview: AiOverview) => {
        const status: AiAccessStatus = overview.access;
        switch (status.kind) {
            case 'none':
                return consentForm(false);
            case 'consent_outdated':
                return (
                    <div className="space-y-4">
                        <p className="text-sm font-medium text-amber-700 dark:text-amber-300">
                            Les conditions de l'assistant ont changé. Pour continuer à l'utiliser, relisez-les et renouvelez votre accord ; votre demande repassera en attente de validation.
                        </p>
                        {consentForm(true)}
                        {withdrawBlock}
                    </div>
                );
            case 'pending': {
                const date = formatDate(status.requestedAt);
                return (
                    <div className="space-y-4">
                        <p className="text-sm font-medium text-nature-dark dark:text-white">
                            {justRequested ? 'Demande envoyée.' : 'Demande en attente de validation'}{date ? ` (le ${date})` : ''}.
                        </p>
                        {emailLine}
                        {withdrawBlock}
                    </div>
                );
            }
            case 'approved':
                return (
                    <div className="space-y-4">
                        {counterBlock(overview)}
                        {featureCards(overview)}
                        {withdrawBlock}
                    </div>
                );
            case 'refused':
            case 'revoked':
                return (
                    <div className="space-y-4">
                        <p className="text-sm font-medium text-nature-dark dark:text-white">
                            {status.kind === 'refused' ? "Votre demande n'a pas été acceptée." : 'Votre accès a été retiré.'}
                        </p>
                        {status.note && (
                            <p className="text-sm text-gray-700 dark:text-gray-300">Message : {status.note}</p>
                        )}
                        <p className="text-sm text-gray-700 dark:text-gray-300">Pour toute question : {CONTACT_EMAIL}</p>
                        {withdrawBlock}
                    </div>
                );
        }
    };

    const cachedCounter = isOffline ? readCachedAiCounter() : null;

    return (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-[80] flex justify-center items-center p-4">
            <div
                ref={dialogRef}
                {...dialogProps}
                className="liquid-glass-opaque animate-scaleIn rounded-2xl p-5 sm:p-8 w-full max-w-lg max-h-[90vh] overflow-y-auto"
            >
                <h3 id="ai-access-dialog-title" className="flex items-center gap-2 text-2xl font-serif font-bold text-nature-dark dark:text-white">
                    <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-ai-100 text-ai-700 dark:bg-ai-500/20 dark:text-ai-200">
                        <SparklesIcon className="w-5 h-5" />
                    </span>
                    Assistant IA
                </h3>
                <p className="mt-2 text-sm text-gray-600 dark:text-gray-300">
                    Des aides facultatives, fournies par Claude (Anthropic). Rien n'est envoyé sans votre action, et c'est toujours vous qui décidez.
                </p>
                <div className="mt-4 space-y-4">
                    {isOffline && (
                        <div className="space-y-1">
                            <p className="text-sm font-medium text-amber-700 dark:text-amber-300">Disponible en ligne uniquement.</p>
                            {cachedCounter && (
                                <p className="text-sm text-gray-700 dark:text-gray-300" data-testid="ai-cached-counter">
                                    Dernier compteur connu : {plural(cachedCounter.remaining, 'utilisation restante', 'utilisations restantes')} sur {cachedCounter.monthlyQuota} (au {formatDayMonth(cachedCounter.at)}).
                                </p>
                            )}
                        </div>
                    )}
                    {view.phase === 'loading' && <p className="text-sm text-gray-500 dark:text-gray-400">Chargement…</p>}
                    {view.phase === 'error' && (
                        <div className="space-y-3">
                            <p role="alert" className="text-sm text-red-600 dark:text-red-400">{view.message}</p>
                            {!isOffline && (
                                <button type="button" onClick={() => void load()} className={secondaryButton}>Réessayer</button>
                            )}
                        </div>
                    )}
                    {view.phase === 'ready' && renderStatus(view.overview)}
                    {actionError && <p role="alert" className="text-sm text-red-600 dark:text-red-400">{actionError}</p>}
                </div>
                <div className="mt-6 flex justify-end">
                    <button type="button" onClick={onClose} className={secondaryButton}>Fermer</button>
                </div>
            </div>
        </div>
    );
};

export default AiAccessDialog;
