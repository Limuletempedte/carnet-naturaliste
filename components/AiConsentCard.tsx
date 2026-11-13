import React, { useId, useState } from 'react';
import { SparklesIcon } from './icons';
import type { AiTextFeature } from '../services/aiAssistService';

const CONTACT_EMAIL = 'carnetnaturaliste.app@gmail.com';

/**
 * Texte du consentement « Bilan du mois », version `2026-11-v1`
 * (`AI_TEXT_CONSENT_VERSIONS.summary`, services/aiAssistService.ts).
 * Toute modification de fond impose de changer cette version ET
 * `CONSENT_VERSIONS.summary` dans supabase/functions/ai-text/logic.ts :
 * chacun devra alors redonner son accord.
 */
export const SummaryConsentText: React.FC = () => (
    <div className="space-y-3 text-sm text-gray-700 dark:text-gray-300" data-testid="ai-summary-consent-text">
        <p>
            L'assistant rédige un court texte à partir des chiffres de votre mois, calculés par l'application.
            Il est fourni par <strong>Anthropic</strong> (modèle Claude).
        </p>
        <div>
            <p className="font-semibold text-nature-dark dark:text-white">Ce qui est envoyé</p>
            <ul className="list-disc pl-5 space-y-1">
                <li>Le mois choisi (mois et année).</li>
                <li>Les totaux du mois : nombre d'observations, d'espèces et de jours d'activité, et leur répartition par groupe.</li>
                <li>Les noms des 15 espèces les plus observées, avec leur nombre d'individus, et jusqu'à 30 espèces vues pour la première fois.</li>
                <li>Les mêmes totaux pour le même mois de l'année précédente.</li>
            </ul>
        </div>
        <div>
            <p className="font-semibold text-nature-dark dark:text-white">Ce qui n'est pas envoyé</p>
            <p>Ni lieu, ni commune, ni coordonnées GPS, ni commentaire, ni observateur, ni date précise, ni photo, ni votre adresse e-mail.</p>
        </div>
        <div>
            <p className="font-semibold text-nature-dark dark:text-white">Destinataire, transfert et conservation</p>
            <ul className="list-disc pl-5 space-y-1">
                <li>Destinataire : Anthropic, via Anthropic Ireland Ltd pour l'Espace économique européen.</li>
                <li>Transfert hors de l'UE : les données sont stockées aux <strong>États-Unis</strong> et peuvent être traitées hors de l'UE, dans le cadre des clauses contractuelles types de l'UE.</li>
                <li>Chez Anthropic : effacement sous 30 jours ; jusqu'à 2 ans si un contrôle de sécurité signale la demande. Par défaut, ces données ne servent pas à entraîner les modèles.</li>
                <li>Dans le Carnet : le bilan rédigé est gardé dans ce navigateur seulement (24 mois au plus) ; le journal d'usage (date, modèle, volume traité, coût, résultat technique) est gardé 3 mois, sans les chiffres ni le texte.</li>
            </ul>
        </div>
        <div>
            <p className="font-semibold text-nature-dark dark:text-white">À savoir</p>
            <ul className="list-disc pl-5 space-y-1">
                <li>C'est une aide : le texte peut contenir des maladresses. Les chiffres de l'application font foi, et c'est vous qui décidez de rédiger un bilan.</li>
                <li>Chaque rédaction compte pour 1 utilisation sur les 20 du mois, partagées avec l'aide à l'identification. Un refus de l'assistant ou une réponse inexploitable compte aussi.</li>
                <li>Vous pouvez retirer votre accord à tout moment dans « Assistant IA » (menu du compte), bouton « Retirer mon accord au bilan ». Les chiffres déjà envoyés ne peuvent pas être rappelés.</li>
                <li>Contact : {CONTACT_EMAIL}</li>
            </ul>
        </div>
    </div>
);

const FEATURE_LABELS: Record<AiTextFeature, string> = {
    summary: 'Bilan du mois',
    note: 'Note → fiche',
    search: 'Recherche en langage naturel',
};

const CONSENT_TEXTS: Partial<Record<AiTextFeature, React.FC>> = {
    summary: SummaryConsentText,
};

const CHECKBOX_LABELS: Partial<Record<AiTextFeature, string>> = {
    summary: "J'ai lu ces informations et j'accepte l'envoi des chiffres de mes bilans à Anthropic lorsque je demande une rédaction.",
};

export const consentCheckboxLabel = (feature: AiTextFeature): string => CHECKBOX_LABELS[feature] ?? '';

/** Texte complet du consentement d'une fonctionnalité texte. */
export const AiFeatureConsentText: React.FC<{ feature: AiTextFeature }> = ({ feature }) => {
    const Text = CONSENT_TEXTS[feature];
    return Text ? <Text /> : null;
};

interface AiConsentCardProps {
    feature: AiTextFeature;
    /** Donne l'accord ; la carte se ferme quand la promesse aboutit. */
    onAccept: () => void | Promise<void>;
    onCancel: () => void;
    /** Ouvre « Assistant IA » (menu du compte). */
    onOpenAssistant?: () => void;
    isWorking?: boolean;
    isOffline?: boolean;
    /** L'accord avait été donné sous un ancien texte. */
    outdated?: boolean;
    error?: string | null;
    /** Libellé du bouton d'acceptation (« Accepter et rédiger »). */
    acceptLabel?: string;
}

/**
 * Carte de consentement affichée à l'endroit même, à la première utilisation
 * d'une fonctionnalité texte : texte court, case obligatoire, lien vers le
 * point central « Assistant IA ».
 */
const AiConsentCard: React.FC<AiConsentCardProps> = ({
    feature,
    onAccept,
    onCancel,
    onOpenAssistant,
    isWorking = false,
    isOffline = false,
    outdated = false,
    error = null,
    acceptLabel = 'Accepter',
}) => {
    const [checked, setChecked] = useState(false);
    const titleId = useId();
    return (
        <section
            aria-labelledby={titleId}
            data-testid={`ai-consent-card-${feature}`}
            className="rounded-2xl border border-ai-200 bg-ai-50/80 p-4 sm:p-5 space-y-4 dark:border-ai-400/30 dark:bg-ai-500/10"
        >
            <div className="flex items-start gap-3">
                <span className="mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-ai-100 text-ai-700 dark:bg-ai-500/20 dark:text-ai-200">
                    <SparklesIcon className="w-4 h-4" />
                </span>
                <div>
                    <h4 id={titleId} className="font-semibold text-nature-dark dark:text-white">
                        {outdated ? 'Le texte de votre accord a changé' : 'Votre accord, avant la première utilisation'}
                    </h4>
                    <p className="text-sm text-gray-600 dark:text-gray-300">
                        {FEATURE_LABELS[feature]} : lisez ce qui est envoyé, puis cochez la case.
                    </p>
                </div>
            </div>
            <div className="max-h-72 overflow-y-auto rounded-xl bg-white/70 p-3 dark:bg-black/20">
                <AiFeatureConsentText feature={feature} />
            </div>
            <label className="flex items-start gap-3 text-sm font-medium text-nature-dark dark:text-white">
                <input
                    type="checkbox"
                    checked={checked}
                    onChange={(e) => setChecked(e.target.checked)}
                    className="mt-1 h-4 w-4 shrink-0 accent-ai-600"
                />
                <span>{consentCheckboxLabel(feature)}</span>
            </label>
            {error && <p role="alert" className="text-sm text-red-600 dark:text-red-400">{error}</p>}
            {isOffline && <p className="text-sm text-amber-700 dark:text-amber-300">Disponible en ligne uniquement.</p>}
            <div className="flex flex-wrap items-center gap-2">
                <button
                    type="button"
                    onClick={() => void onAccept()}
                    disabled={!checked || isWorking || isOffline}
                    className="min-h-[44px] rounded-full bg-ai-600 px-5 py-2 text-sm font-semibold text-white transition-all hover:bg-ai-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                    {isWorking ? 'Envoi…' : acceptLabel}
                </button>
                <button
                    type="button"
                    onClick={onCancel}
                    className="min-h-[44px] rounded-full px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-black/5 dark:text-gray-200 dark:hover:bg-white/10"
                >
                    Annuler
                </button>
                {onOpenAssistant && (
                    <button
                        type="button"
                        onClick={onOpenAssistant}
                        className="min-h-[44px] px-2 text-sm font-semibold text-ai-700 underline underline-offset-2 dark:text-ai-200"
                    >
                        Tout savoir sur l'assistant
                    </button>
                )}
            </div>
        </section>
    );
};

export default AiConsentCard;
