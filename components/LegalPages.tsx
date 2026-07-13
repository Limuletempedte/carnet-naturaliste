import React from 'react';

interface LegalPageProps {
    onBack: () => void;
}

const LegalPageWrapper: React.FC<{ title: string; onBack: () => void; children: React.ReactNode }> = ({ title, onBack, children }) => (
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
        <h1 className="text-2xl font-bold text-nature-dark dark:text-white mb-6">{title}</h1>
        <div className="prose prose-sm dark:prose-invert max-w-none text-gray-700 dark:text-gray-300 space-y-4">
            {children}
        </div>
    </div>
);

const Section: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
    <section className="mt-6">
        <h2 className="text-lg font-semibold text-nature-dark dark:text-white mb-2">{title}</h2>
        {children}
    </section>
);

export const PrivacyPolicy: React.FC<LegalPageProps> = ({ onBack }) => (
    <LegalPageWrapper title="Politique de confidentialite" onBack={onBack}>
        <p className="text-xs text-gray-400 italic">Derniere mise a jour : 13 juillet 2026</p>

        <Section title="1. Responsable du traitement">
            <p>Eliot SERIVE — editeur particulier (service non commercial). Contact : carnetnaturaliste.app@gmail.com</p>
        </Section>

        <Section title="2. Donnees collectees">
            <p>L'application Carnet Naturaliste collecte les donnees suivantes :</p>
            <ul className="list-disc pl-5 space-y-1">
                <li><strong>Donnees de compte</strong> : adresse email (authentification)</li>
                <li><strong>Observations naturalistes</strong> : nom d'espece, coordonnees GPS, date, heure, lieu-dit, commune, photos, sons, commentaires</li>
                <li><strong>Donnees techniques</strong> : identifiant utilisateur, horodatage des actions</li>
            </ul>
        </Section>

        <Section title="3. Finalites et bases legales">
            <ul className="list-disc pl-5 space-y-1">
                <li><strong>Gestion du compte</strong> : execution du contrat (art. 6.1.b RGPD)</li>
                <li><strong>Stockage et synchronisation des observations</strong> : execution du contrat</li>
                <li><strong>Geolocalisation</strong> : consentement via l'API du navigateur (art. 6.1.a)</li>
                <li><strong>Autocomplete especes</strong> : interet legitime (art. 6.1.f) — appels en lecture seule vers iNaturalist et GBIF</li>
                <li><strong>Geocodage inverse</strong> : interet legitime — appels vers Nominatim (OpenStreetMap)</li>
            </ul>
        </Section>

        <Section title="4. Durees de conservation">
            <ul className="list-disc pl-5 space-y-1">
                <li><strong>Compte et observations</strong> : conserves tant que le compte est actif. Supprimes a la demande de suppression du compte.</li>
                <li><strong>Cache local (navigateur)</strong> : 90 jours maximum, renouvele a chaque synchronisation.</li>
                <li><strong>Photos et sons</strong> : conserves tant que l'observation associee existe.</li>
            </ul>
        </Section>

        <Section title="5. Destinataires et transferts">
            <ul className="list-disc pl-5 space-y-1">
                <li><strong>Supabase</strong> (hebergement base de donnees et fichiers) — donnees hebergees dans l'UE (Francfort, eu-central-1)</li>
                <li><strong>Vercel</strong> (hebergement frontend) — fichiers statiques distribues via CDN mondial ; aucune donnee personnelle stockee</li>
                <li><strong>Sentry</strong> (suivi des erreurs techniques) — recoit uniquement les rapports d'erreur du navigateur (message, trace technique, type d'appareil), jamais vos observations ni votre email. Donnees hebergees dans l'UE. Finalite : fiabilite du service (interet legitime, art. 6.1.f RGPD).</li>
                <li><strong>Aucun partage actif</strong> de vos donnees vers des tiers. Les appels vers iNaturalist, GBIF et Nominatim sont en lecture seule (autocomplete) et ne transmettent pas vos observations.</li>
            </ul>
        </Section>

        <Section title="6. Vos droits (RGPD art. 15 a 22)">
            <p>Vous disposez des droits suivants :</p>
            <ul className="list-disc pl-5 space-y-1">
                <li><strong>Acces</strong> : consulter vos donnees depuis votre profil</li>
                <li><strong>Portabilite</strong> : exporter toutes vos donnees (JSON, Excel, ZIP) depuis le menu profil</li>
                <li><strong>Rectification</strong> : modifier vos observations a tout moment</li>
                <li><strong>Effacement</strong> : supprimer votre compte et toutes les donnees associees depuis le menu profil</li>
                <li><strong>Limitation / Opposition</strong> : contacter le DPO ci-dessous</li>
            </ul>
        </Section>

        <Section title="7. Contact DPO / RGPD">
            <p>Pour toute demande relative a vos donnees personnelles :</p>
            <p className="font-medium">carnetnaturaliste.app@gmail.com</p>
        </Section>

        <Section title="8. Cookies et stockage local">
            <p>L'application utilise le stockage local du navigateur (localStorage) pour :</p>
            <ul className="list-disc pl-5 space-y-1">
                <li>Fonctionner hors-ligne (cache des observations)</li>
                <li>Maintenir la session d'authentification</li>
                <li>Sauvegarder les preferences (mode sombre, filtres)</li>
            </ul>
            <p><strong>Aucun cookie traceur ou analytique n'est utilise.</strong></p>
        </Section>

        <Section title="9. Securite">
            <p>Les mesures de securite incluent : chiffrement HTTPS (TLS), authentification par mot de passe, politiques RLS (Row-Level Security) isolant les donnees par utilisateur, headers de securite (CSP, HSTS, X-Frame-Options).</p>
        </Section>
    </LegalPageWrapper>
);

export const TermsOfService: React.FC<LegalPageProps> = ({ onBack }) => (
    <LegalPageWrapper title="Conditions Generales d'Utilisation" onBack={onBack}>
        <p className="text-xs text-gray-400 italic">Derniere mise a jour : 19 juin 2026</p>

        <Section title="1. Objet">
            <p>Les presentes Conditions Generales d'Utilisation (CGU) regissent l'acces et l'utilisation de l'application Carnet Naturaliste, editee par Eliot SERIVE.</p>
        </Section>

        <Section title="2. Acces au service">
            <p>L'application est accessible apres creation d'un compte utilisateur. L'inscription implique l'acceptation des presentes CGU et de la Politique de confidentialite.</p>
        </Section>

        <Section title="3. Description du service">
            <p>Carnet Naturaliste est une application de saisie et de gestion d'observations naturalistes (faune et flore). Elle permet :</p>
            <ul className="list-disc pl-5 space-y-1">
                <li>La saisie d'observations avec geolocalisation, photos et sons</li>
                <li>La synchronisation des donnees entre appareils</li>
                <li>L'export des donnees en divers formats (JSON, Excel, PDF, ZIP)</li>
                <li>Le fonctionnement hors-ligne avec synchronisation differee</li>
            </ul>
        </Section>

        <Section title="4. Obligations de l'utilisateur">
            <ul className="list-disc pl-5 space-y-1">
                <li>Fournir des informations exactes lors de l'inscription</li>
                <li>Ne pas utiliser le service a des fins illicites</li>
                <li>Ne pas divulguer les coordonnees precises d'especes protegees obtenues via l'application</li>
                <li>Respecter les droits de propriete intellectuelle des contenus affiches</li>
            </ul>
        </Section>

        <Section title="5. Propriete intellectuelle">
            <p>L'application et son code source sont la propriete de Eliot SERIVE. Les observations saisies par l'utilisateur restent sa propriete.</p>
            <p>Les images provenant d'iNaturalist ou de Wikipedia sont soumises a leurs licences respectives (generalement Creative Commons).</p>
        </Section>

        <Section title="6. Responsabilite">
            <p>L'editeur s'efforce d'assurer la disponibilite et la fiabilite du service, mais ne peut garantir un fonctionnement ininterrompu. L'editeur n'est pas responsable des dommages indirects lies a l'utilisation du service.</p>
        </Section>

        <Section title="7. Resiliation">
            <p>L'utilisateur peut supprimer son compte a tout moment depuis le menu profil. Cette action entraine la suppression definitive de toutes ses donnees.</p>
        </Section>

        <Section title="8. Modification des CGU">
            <p>L'editeur se reserve le droit de modifier les presentes CGU. Les utilisateurs seront informes de toute modification substantielle.</p>
        </Section>

        <Section title="9. Droit applicable">
            <p>Les presentes CGU sont soumises au droit francais. Tout litige sera porte devant les tribunaux francais competents.</p>
        </Section>
    </LegalPageWrapper>
);

export const MentionsLegales: React.FC<LegalPageProps> = ({ onBack }) => (
    <LegalPageWrapper title="Mentions legales" onBack={onBack}>
        <Section title="Editeur">
            <ul className="list-none space-y-1">
                <li><strong>Nom</strong> : Eliot SERIVE</li>
                <li><strong>Statut</strong> : editeur particulier (service non commercial)</li>
                <li><strong>Adresse</strong> : communiquee a l'hebergeur ; disponible sur demande a carnetnaturaliste.app@gmail.com</li>
                <li><strong>Email</strong> : carnetnaturaliste.app@gmail.com</li>
                <li><strong>SIRET</strong> : non applicable (editeur particulier non commercial)</li>
                <li><strong>Directeur de la publication</strong> : Eliot SERIVE</li>
            </ul>
        </Section>

        <Section title="Hebergement">
            <ul className="list-none space-y-1">
                <li><strong>Frontend</strong> : Vercel Inc., 340 S Lemon Ave #4133, Walnut, CA 91789, USA</li>
                <li><strong>Backend et base de donnees</strong> : Supabase Inc., 970 Toa Payoh North #07-04, Singapore 318992</li>
            </ul>
        </Section>

        <Section title="Propriete intellectuelle">
            <p>L'ensemble du contenu de l'application (code, design, textes) est protege par le droit de la propriete intellectuelle. Toute reproduction non autorisee est interdite.</p>
        </Section>

        <Section title="Donnees personnelles">
            <p>Conformement au RGPD, vous disposez de droits sur vos donnees personnelles. Consultez notre Politique de confidentialite pour plus de details.</p>
        </Section>

        <Section title="Credits">
            <ul className="list-disc pl-5 space-y-1">
                <li>Donnees taxonomiques : iNaturalist (California Academy of Sciences) et GBIF</li>
                <li>Geocodage : Nominatim / OpenStreetMap (licence ODbL)</li>
                <li>Meteo : Open-Meteo (licence Apache 2.0)</li>
                <li>Cartographie : OpenStreetMap, OpenTopoMap, CARTO, Esri</li>
            </ul>
        </Section>
    </LegalPageWrapper>
);
