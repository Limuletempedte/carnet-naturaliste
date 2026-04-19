import React from 'react';

interface HelpPageProps {
    onBack: () => void;
    onReplayTour: () => void;
}

const Section: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
    <section className="mt-8">
        <h2 className="text-lg font-semibold text-nature-dark dark:text-white mb-2">{title}</h2>
        <div className="text-sm text-gray-700 dark:text-gray-300 space-y-2">{children}</div>
    </section>
);

const HelpPage: React.FC<HelpPageProps> = ({ onBack, onReplayTour }) => {
    return (
        <div className="max-w-3xl mx-auto px-4 py-8 pb-24">
            <button
                onClick={onBack}
                className="flex items-center gap-1 text-sm text-nature-green-text hover:text-nature-dark dark:hover:text-white mb-6 transition-colors"
            >
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
                </svg>
                Retour
            </button>

            <h1 className="text-2xl font-bold text-nature-dark dark:text-white mb-2">Aide</h1>
            <p className="text-sm text-gray-600 dark:text-gray-400">
                Tout ce dont vous avez besoin pour tirer le meilleur parti de votre Carnet Naturaliste.
            </p>

            <Section title="Saisir une observation">
                <p>
                    Appuyez sur le bouton <strong>« + Observation »</strong> dans la barre du haut ou en bas à droite sur mobile. Le formulaire
                    contient environ 25 champs, mais seuls l&apos;espèce, la date et le nombre sont obligatoires. Les champs de position (GPS,
                    altitude, commune, département, pays) se remplissent automatiquement si vous utilisez la saisie carte ou la géolocalisation.
                </p>
                <p>
                    La <strong>section « Détails avancés »</strong> est repliée par défaut pour ne pas intimider : sexe, âge, protocole STOC-EPS/EPOC,
                    code atlas, statut IUCN, comportement, météo. La <strong>section « Contexte écologique »</strong> contient l&apos;habitat, la
                    phénologie et les observateurs associés (utile pour les sorties en équipe).
                </p>
            </Section>

            <Section title="Mode offline et synchronisation">
                <p>
                    L&apos;application fonctionne <strong>entièrement hors-ligne</strong>. Vos observations sont enregistrées localement puis
                    synchronisées dès que la connexion revient. L&apos;icône <em>Centre de sync</em> en haut à droite vous indique combien d&apos;actions
                    sont en file d&apos;attente ; cliquez dessus pour forcer une synchronisation.
                </p>
                <p>
                    Si le serveur est injoignable alors que vous êtes en ligne, l&apos;app bascule automatiquement en file d&apos;attente (vos
                    observations ne seront pas perdues). Un toast apparaît pour vous prévenir.
                </p>
            </Section>

            <Section title="Exports disponibles">
                <ul className="list-disc pl-5 space-y-1">
                    <li><strong>JSON</strong> : sauvegarde complète réimportable dans l&apos;app.</li>
                    <li><strong>Excel (.xlsx)</strong> : tableau prêt pour analyse ou partage.</li>
                    <li><strong>PDF</strong> : livret imprimable des observations.</li>
                    <li><strong>Darwin Core (.csv)</strong> : standard international GBIF/TDWG — partagez vos données avec la communauté scientifique.</li>
                    <li><strong>GeoJSON</strong> : ouvrable dans QGIS, geojson.io, et tous les outils SIG.</li>
                    <li><strong>Backup ZIP</strong> : sauvegarde complète (données + photos + sons) entièrement restaurable.</li>
                </ul>
                <p className="text-xs italic">
                    Les espèces à statut IUCN sensible (VU, EN, CR, EW) ont leurs coordonnées GPS volontairement imprécises dans tous les exports.
                </p>
            </Section>

            <Section title="Badges et séries">
                <p>
                    Neuf badges récompensent votre activité : Débutant (1 obs), Explorateur (10), Expert (50), Ornithologue (5 oiseaux différents),
                    Entomologiste (5 insectes), Botaniste (5 plantes), Photographe (5 obs avec photo), Voyageur (3 communes différentes). Un toast
                    apparaît au moment du déblocage.
                </p>
                <p>
                    Le <strong>compteur de série</strong> visible dans les statistiques indique le nombre de jours consécutifs pendant lesquels vous
                    avez enregistré au moins une observation. Un geste simple pour entretenir votre pratique naturaliste.
                </p>
            </Section>

            <Section title="Signaler un bug ou suggérer une amélioration">
                <p>
                    Vous avez rencontré un bug ou une idée d&apos;amélioration ? Ouvrez une issue sur le dépôt GitHub du projet ou contactez
                    directement l&apos;équipe à l&apos;adresse indiquée dans les mentions légales.
                </p>
            </Section>

            <Section title="Rejouer le tutoriel de bienvenue">
                <p>
                    Vous pouvez relancer la visite guidée à tout moment.
                </p>
                <button
                    onClick={onReplayTour}
                    className="mt-2 px-4 py-2 rounded-full bg-nature-green text-white font-semibold hover:bg-nature-dark transition-colors"
                >
                    Relancer le tutoriel
                </button>
            </Section>
        </div>
    );
};

export default HelpPage;
