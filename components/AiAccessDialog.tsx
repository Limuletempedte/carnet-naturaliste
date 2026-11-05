import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useAccessibleDialog } from '../hooks/useAccessibleDialog';
import { useLiquidGlassRefraction } from './LiquidGlass';
import {
    AiAssistError,
    getAccessStatus,
    requestAccess,
    withdrawAccess,
    type AiAccessStatus,
} from '../services/aiAssistService';
import { captureSessionContext, isSessionCurrent, type SessionContext } from '../services/sessionScope';

const CONTACT_EMAIL = 'carnetnaturaliste.app@gmail.com';

interface AiAccessDialogProps {
    isOpen: boolean;
    onClose: () => void;
    isOffline?: boolean;
}

type ViewState =
    | { phase: 'loading' }
    | { phase: 'error'; message: string }
    | { phase: 'ready'; status: AiAccessStatus };

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

const AiAccessDialog: React.FC<AiAccessDialogProps> = ({ isOpen, onClose, isOffline = false }) => {
    const { dialogRef, dialogProps } = useAccessibleDialog({ isOpen, onClose, titleId: 'ai-access-dialog-title' });
    const glassRef = useLiquidGlassRefraction<HTMLDivElement>();
    const [view, setView] = useState<ViewState>({ phase: 'loading' });
    const [consentChecked, setConsentChecked] = useState(false);
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
            const status = await getAccessStatus(context);
            if (isSessionCurrent(context)) setView({ phase: 'ready', status });
        } catch (error) {
            if (!isSessionCurrent(context)) return;
            const message = error instanceof AiAssistError ? error.message : 'Impossible de lire l’état de votre accès.';
            setView({ phase: 'error', message });
        }
    }, []);

    useEffect(() => {
        if (!isOpen) return;
        setConsentChecked(false);
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
            const status = await getAccessStatus(context);
            if (isSessionCurrent(context)) setView({ phase: 'ready', status });
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

    const primaryButton = 'px-5 py-2 rounded-full font-semibold text-white bg-nature-green hover:bg-green-600 transition-all disabled:opacity-50 disabled:cursor-not-allowed';
    const secondaryButton = 'px-5 py-2 rounded-full font-semibold text-gray-800 bg-gray-300 hover:bg-gray-400 dark:bg-gray-600 dark:text-white dark:hover:bg-gray-500 transition-all';
    const dangerButton = 'px-5 py-2 rounded-full font-semibold text-red-700 border border-red-300 hover:bg-red-50 dark:text-red-300 dark:border-red-500/50 dark:hover:bg-red-900/20 transition-all disabled:opacity-50 disabled:cursor-not-allowed';

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
                        Votre demande ou votre accès sera supprimé. Pour réutiliser l'assistant, il faudra refaire une demande, validée à nouveau à la main.
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

    const renderStatus = (status: AiAccessStatus) => {
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
                        <p className="text-sm font-medium text-nature-dark dark:text-white">
                            Accès actif : <strong>{status.remaining}</strong> analyse{status.remaining > 1 ? 's' : ''} restante{status.remaining > 1 ? 's' : ''} ce mois-ci (sur {status.monthlyQuota}).
                        </p>
                        <p className="text-sm text-gray-700 dark:text-gray-300">
                            Le bouton « Aide à l'identification » apparaît dans le formulaire d'observation, sous la photo.
                        </p>
                        <details className="text-sm">
                            <summary className="cursor-pointer font-medium text-nature-green-text">Rappel des conditions</summary>
                            <div className="mt-3"><AiConsentText /></div>
                        </details>
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

    return (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex justify-center items-center p-4">
            <div
                ref={(node) => { dialogRef.current = node; glassRef(node); }}
                {...dialogProps}
                className="liquid-glass liquid-glass-sheen animate-scaleIn rounded-2xl p-6 sm:p-8 w-full max-w-lg max-h-[90vh] overflow-y-auto"
            >
                <h3 id="ai-access-dialog-title" className="text-2xl font-serif font-bold text-nature-dark dark:text-white">Aide à l'identification (IA)</h3>
                <div className="mt-4 space-y-4">
                    {isOffline && (
                        <p className="text-sm font-medium text-amber-700 dark:text-amber-300">Disponible en ligne uniquement.</p>
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
                    {view.phase === 'ready' && renderStatus(view.status)}
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
