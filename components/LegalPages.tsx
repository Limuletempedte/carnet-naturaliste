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
        <p className="text-xs text-gray-400 italic">Derniere mise a jour : 13 novembre 2026</p>

        <Section title="1. Responsable du traitement">
            <p>Eliot SERIVE — editeur particulier (service non commercial). Contact : carnetnaturaliste.app@gmail.com</p>
        </Section>

        <Section title="2. Donnees collectees">
            <p>L'application Carnet Naturaliste collecte les donnees suivantes :</p>
            <ul className="list-disc pl-5 space-y-1">
                <li><strong>Donnees de compte</strong> : adresse email (authentification)</li>
                <li><strong>Observations naturalistes</strong> : nom d'espece, coordonnees GPS, date, heure, lieu-dit, commune, photos, sons, commentaires</li>
                <li><strong>Protection anti-robots</strong> : adresse IP, informations du navigateur et de connexion transmises à Cloudflare Turnstile sur les formulaires de connexion, inscription et récupération du compte.</li>
                <li><strong>Donnees techniques</strong> : identifiant utilisateur, horodatage des actions</li>
                <li><strong>Assistant IA (facultatif)</strong> : rien n'est envoyé sans votre accord ni sans votre action, et chaque fonction a son propre accord.
                    <ul className="list-disc pl-5 space-y-1 mt-1">
                        <li><em>Aide à l'identification (photo)</em> : quand vous lancez une analyse, la photo de l'observation réencodée (1 280 px au plus, sans métadonnées EXIF ni position GPS), le mois, le pays, le département, le groupe taxonomique si vous l'avez choisi et l'habitat s'il est renseigné. Jamais la commune, le lieu-dit, les coordonnées GPS ni le commentaire.</li>
                        <li><em>Bilan du mois</em> : quand vous demandez une rédaction, des chiffres calculés par l'application pour le mois choisi (mois et année, nombre d'observations, d'espèces et de jours d'activité, répartition par groupe, noms des 15 espèces les plus observées avec leur nombre d'individus, jusqu'à 30 espèces nouvelles, mêmes totaux un an plus tôt). Jamais de lieu, de commune, de coordonnées GPS, de commentaire, d'observateur ni de date précise.</li>
                    </ul>
                    Le Carnet conserve l'état de votre demande d'accès (avec la version du texte accepté), vos accords par fonction (fonction, version du texte, date) et un journal d'usage (date, fonction, modèle, volume traité, coût, résultat technique), sans photo, chiffres, hypothèses ni texte rédigé. Les bilans rédigés sont gardés dans votre navigateur seulement.</li>
            </ul>
        </Section>

        <Section title="3. Finalites et bases legales">
            <ul className="list-disc pl-5 space-y-1">
                <li><strong>Protection contre les abus automatisés</strong> : intérêt légitime à sécuriser les comptes (art. 6.1.f RGPD).</li>
                <li><strong>Gestion du compte</strong> : execution du contrat (art. 6.1.b RGPD)</li>
                <li><strong>Stockage et synchronisation des observations</strong> : execution du contrat</li>
                <li><strong>Geolocalisation</strong> : consentement via l'API du navigateur (art. 6.1.a)</li>
                <li><strong>Autocomplete especes</strong> : interet legitime (art. 6.1.f) — appels en lecture seule vers iNaturalist et GBIF</li>
                <li><strong>Geocodage inverse</strong> : interet legitime — appels vers Nominatim (OpenStreetMap)</li>
                <li><strong>Assistant IA</strong> : consentement (art. 6.1.a RGPD), donné séparément pour chaque fonction (envoi des photos pour l'aide à l'identification, envoi des chiffres du mois pour le bilan) et retirable à tout moment ; journal d'usage : intérêt légitime à contrôler les coûts et les abus (art. 6.1.f). Les chiffres et noms d'espèces liés à votre compte restent des données personnelles. Les propositions de l'assistant sont de simples aides : c'est vous qui choisissez l'espèce ou décidez de garder un bilan, aucune décision n'est prise automatiquement.</li>
            </ul>
        </Section>

        <Section title="4. Durees de conservation">
            <ul className="list-disc pl-5 space-y-1">
                <li><strong>Compte et observations</strong> : conserves tant que le compte est actif. Supprimes immediatement a la demande de suppression du compte ; les sauvegardes techniques deja constituees expirent au plus tard sous 35 jours.</li>
                <li><strong>Cache local (navigateur)</strong> : 90 jours maximum, renouvele a chaque synchronisation.</li>
                <li><strong>Photos et sons</strong> : conserves tant que l'observation associee existe.</li>
                <li><strong>Assistant IA</strong> : la demande d'accès et les accords par fonction sont conservés jusqu'au retrait de votre accord ou à la suppression du compte ; le journal d'usage est conservé 3 mois, puis effacé (il est rendu anonyme si le compte est supprimé). Les bilans du mois rédigés restent dans le navigateur où ils ont été rédigés, 24 mois au plus après leur rédaction (un bilan plus ancien est effacé à la prochaine ouverture de l'application dans ce navigateur). Ils sont aussi effacés de l'appareil depuis lequel vous supprimez votre compte ; sur vos autres appareils, ils restent jusqu'à leur expiration ou jusqu'à ce que vous effaciez les données du site. Chez Anthropic, les données envoyées et les réponses sont effacées sous 30 jours, ou jusqu'à 2 ans si un contrôle de sécurité signale la demande.</li>
            </ul>
        </Section>

        <Section title="5. Destinataires et transferts">
            <ul className="list-disc pl-5 space-y-1">
                <li><strong>Supabase</strong> (hebergement base de donnees et fichiers) — donnees hebergees dans l'UE (Francfort, eu-central-1)</li>
                <li><strong>Vercel</strong> (hebergement frontend) — fichiers statiques distribues via CDN mondial ; aucune donnee personnelle stockee</li>
                <li><strong>Sentry</strong> (suivi des erreurs techniques) — recoit uniquement les rapports d'erreur du navigateur (message, trace technique, type d'appareil), jamais vos observations ni votre email. Donnees hebergees dans l'UE. Finalite : fiabilite du service (interet legitime, art. 6.1.f RGPD).</li>
                <li><strong>GitHub</strong> (sauvegarde technique hebdomadaire) — recoit une copie <strong>chiffree</strong> de la base, conservee 35 jours puis supprimee automatiquement. Elle sert uniquement a restaurer le service apres un incident. GitHub heberge cette archive aux Etats-Unis mais ne peut pas la lire : la cle de dechiffrement n'est detenue que par l'editeur.</li>
                <li><strong>Cloudflare Turnstile</strong> (protection anti-robots) — traite des signaux techniques du navigateur et de connexion, notamment l’adresse IP, selon sa <a href="https://www.cloudflare.com/turnstile-privacy-policy/" target="_blank" rel="noopener noreferrer" className="underline">politique de confidentialité</a>. Des traitements hors UE sont possibles. L’application ne lui transmet pas vos mots de passe ni vos observations. Le jeton de vérification est transmis à Supabase pour validation et n’est pas conservé dans le stockage local de l’application.</li>
                <li><strong>Anthropic</strong> (assistant IA, modèle Claude) — reçoit, seulement quand vous lancez une action après avoir donné l'accord de cette fonction, les données décrites au §2 : la photo réencodée et son contexte pour l'aide à l'identification, les chiffres du mois pour le bilan ; jamais vos coordonnées GPS, votre commune, votre commentaire ni votre adresse email. Cocontractant pour l'Espace économique européen : Anthropic Ireland Ltd. Les données sont stockées aux <strong>États-Unis</strong> et peuvent être traitées hors de l'UE ; ce transfert est encadré par les clauses contractuelles types de l'UE. Par défaut, ces données ne servent pas à entraîner les modèles. Une donnée déjà envoyée ne peut pas être rappelée : évitez les photos où des personnes sont reconnaissables.</li>
                <li>Les services tiers interviennent pour les finalités décrites ci-dessus. Les appels vers iNaturalist, GBIF et Nominatim sont en lecture seule (autocomplete) et ne transmettent pas vos observations.</li>
            </ul>
        </Section>

        <Section title="6. Vos droits (RGPD art. 15 a 22)">
            <p>Vous disposez des droits suivants :</p>
            <ul className="list-disc pl-5 space-y-1">
                <li><strong>Acces</strong> : consulter vos donnees depuis votre profil</li>
                <li><strong>Portabilite</strong> : exporter toutes vos donnees (JSON, Excel, ZIP) depuis le menu profil. L'archive ZIP « Exporter mes données » contient vos observations, leurs photos et sons, et les données de l'assistant IA (fichier <code>assistant_ia.json</code> : votre demande d'accès, vos accords par fonction et le journal de vos utilisations des 3 derniers mois, vide si vous ne vous en êtes jamais servi)</li>
                <li><strong>Rectification</strong> : modifier vos observations a tout moment</li>
                <li><strong>Effacement</strong> : supprimer votre compte et toutes les donnees associees depuis le menu profil</li>
                <li><strong>Retrait du consentement</strong> : dans la fenêtre « Assistant IA » du menu profil, « Retirer mon accord » (tout l'assistant) ou « Retirer mon accord au bilan » (le bilan du mois seulement). Le retrait vaut pour l'avenir : les données déjà envoyées ne peuvent pas être rappelées.</li>
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
                <li>Garder les bilans du mois rédigés par l'assistant IA (24 mois au plus après leur rédaction) et le dernier compteur d'utilisations connu (jusqu'à la fin du mois), pour les relire hors ligne</li>
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
        <p className="text-xs text-gray-400 italic">Derniere mise a jour : 13 novembre 2026</p>

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
                <li>Un assistant IA facultatif, sur demande d'accès validée par l'éditeur : une aide à l'identification qui propose des hypothèses à vérifier à partir d'une photo, et un bilan du mois rédigé à partir des chiffres calculés par l'application. C'est une aide, pas une certitude : l'utilisateur reste seul juge de l'espèce enregistrée et du texte qu'il garde. L'assistant est limité à <strong>20 utilisations IA par mois, toutes fonctionnalités confondues</strong> (par défaut) : chaque action lancée compte pour 1, y compris un refus de l'assistant ou une réponse inexploitable. Il n'est disponible qu'en ligne.</li>
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
            <p>L'assistant IA, ou l'une de ses fonctions, peut être suspendu, limité ou retiré à tout moment, notamment lorsque le budget mensuel du service est atteint. Ses propositions peuvent être erronées : l'éditeur n'est pas responsable d'une identification reprise sans vérification ni d'un bilan rédigé gardé sans relecture. Une utilisation lancée reste comptée, même si la réponse est un refus ou est inexploitable.</p>
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
                <li>Cartographie : OpenStreetMap, OpenTopoMap, Esri</li>
            </ul>
        </Section>
    </LegalPageWrapper>
);
