import React from 'react';

// EE-4 (8b) : icônes SVG de l'app — remplacent les emojis du chrome pour un
// rendu net et identique sur tous les appareils (les emojis varient selon
// l'OS et pixellisent en grand). Zéro dépendance : paths outline style
// heroicons, trait 2, couleur héritée via currentColor, taille via className.

export interface IconProps {
    className?: string;
}

// Enveloppe commune : décorative par défaut (aria-hidden), les libellés
// textuels restent portés par le texte voisin ou l'aria-label du bouton.
const Svg: React.FC<IconProps & { children: React.ReactNode }> = ({ className = 'w-5 h-5', children }) => (
    <svg
        xmlns="http://www.w3.org/2000/svg"
        className={className}
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={2}
        aria-hidden="true"
    >
        {children}
    </svg>
);

/** 📡 Hors-ligne (antenne barrée). */
export const SignalOffIcon: React.FC<IconProps> = (props) => (
    <Svg {...props}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 3l18 18M8.111 8.404a5.5 5.5 0 000 7.778m-2.475 2.475a9 9 0 01-1.06-11.313m11.313-1.061a9 9 0 012.192 9.11m-2.899-5.464a5.5 5.5 0 011.242 3.57M12 12h.01" />
    </Svg>
);

/** 📍 Position / lieu. */
export const MapPinIcon: React.FC<IconProps> = (props) => (
    <Svg {...props}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M17.657 16.657L13.414 20.9a2 2 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
    </Svg>
);

/** 📅 Date / calendrier (même dessin que l'onglet Calendrier). */
export const CalendarIcon: React.FC<IconProps> = (props) => (
    <Svg {...props}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
    </Svg>
);

/** 🐾 Empreinte animale (fallback quand l'observation n'a pas d'image). */
export const PawIcon: React.FC<IconProps> = (props) => (
    <Svg {...props}>
        <circle cx="6.2" cy="10.4" r="1.7" />
        <circle cx="10" cy="6.9" r="1.8" />
        <circle cx="14" cy="6.9" r="1.8" />
        <circle cx="17.8" cy="10.4" r="1.7" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 12.4c-2.9 0-5.3 2.4-5.3 5.1 0 1.7 1.4 3 3.1 3 .9 0 1.5-.5 2.2-.5s1.3.5 2.2.5c1.7 0 3.1-1.3 3.1-3 0-2.7-2.4-5.1-5.3-5.1z" />
    </Svg>
);

/** 🖼️ Galerie / images (même dessin que l'onglet Galerie). */
export const PhotoIcon: React.FC<IconProps> = (props) => (
    <Svg {...props}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
    </Svg>
);

/** 📷 Appareil photo (image cassée / manquante). */
export const CameraIcon: React.FC<IconProps> = (props) => (
    <Svg {...props}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
    </Svg>
);

/** 🔍 Recherche (aucun résultat). */
export const SearchIcon: React.FC<IconProps> = (props) => (
    <Svg {...props}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
    </Svg>
);

/** ⏳ Chargement — à combiner avec la classe animate-spin. */
export const SpinnerIcon: React.FC<IconProps> = (props) => (
    <Svg {...props}>
        <circle cx="12" cy="12" r="9" strokeOpacity="0.25" />
        <path strokeLinecap="round" d="M21 12a9 9 0 00-9-9" />
    </Svg>
);

/** 📦 Archive / export ZIP. */
export const ArchiveBoxIcon: React.FC<IconProps> = (props) => (
    <Svg {...props}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />
    </Svg>
);

/** 🔥 Série en cours (flamme). */
export const FlameIcon: React.FC<IconProps> = (props) => (
    <Svg {...props}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M15.362 5.214A8.252 8.252 0 0112 21 8.25 8.25 0 016.038 7.048 8.287 8.287 0 009 9.6a8.983 8.983 0 013.361-6.867 8.21 8.21 0 003 2.48z" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 18a3.75 3.75 0 00.495-7.467 5.99 5.99 0 00-1.925 3.546 5.974 5.974 0 01-2.133-1A3.75 3.75 0 0012 18z" />
    </Svg>
);

/** 🏅 Médaille (record / meilleure série). */
export const MedalIcon: React.FC<IconProps> = (props) => (
    <Svg {...props}>
        <circle cx="12" cy="15" r="4.5" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M9.6 11.2L5.5 3.5h4L12 8.2l2.5-4.7h4l-4.1 7.7" />
    </Svg>
);

/** ⚠️ Avertissement (triangle exclamation). */
export const WarningIcon: React.FC<IconProps> = (props) => (
    <Svg {...props}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
    </Svg>
);

/** ✕ Fermer. */
export const XMarkIcon: React.FC<IconProps> = (props) => (
    <Svg {...props}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
    </Svg>
);

/** ＋ Ajouter. */
export const PlusIcon: React.FC<IconProps> = (props) => (
    <Svg {...props}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
    </Svg>
);

/** ← Retour. */
export const ChevronLeftIcon: React.FC<IconProps> = (props) => (
    <Svg {...props}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
    </Svg>
);

/** ✅ Succès (toasts). */
export const CheckCircleIcon: React.FC<IconProps> = (props) => (
    <Svg {...props}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
    </Svg>
);

/** ❌ Erreur (toasts). */
export const XCircleIcon: React.FC<IconProps> = (props) => (
    <Svg {...props}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
    </Svg>
);

/** ℹ️ Information (toasts). */
export const InfoIcon: React.FC<IconProps> = (props) => (
    <Svg {...props}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </Svg>
);

/** ✏️ Modifier (préparée pour le sous-lot 8c). */
export const PencilIcon: React.FC<IconProps> = (props) => (
    <Svg {...props}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
    </Svg>
);

/** 🗑️ Supprimer (préparée pour le sous-lot 8c — même dessin que le bouton
    de suppression groupée existant). */
export const TrashIcon: React.FC<IconProps> = (props) => (
    <Svg {...props}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
    </Svg>
);
