import React, { useId } from 'react';
import { PhotoIcon, SearchIcon, CalendarIcon, ChartBarIcon } from './icons';

// EE-4 (8c) : état vide illustré — la mascotte oiseau du logo (recolorée en
// vert de l'app via currentColor) dans un disque doux, avec un petit badge de
// verre qui porte l'icône du contexte (galerie, recherche, calendrier, stats).
// Les libellés restent fournis par les vues appelantes (textes inchangés).

export type EmptyStateVariant = 'photos' | 'search' | 'calendar' | 'stats';

interface EmptyStateProps {
    title: string;
    hint?: string;
    variant: EmptyStateVariant;
    className?: string;
}

const VARIANT_BADGE: Record<EmptyStateVariant, React.ReactNode> = {
    photos: <PhotoIcon className="w-4 h-4" />,
    search: <SearchIcon className="w-4 h-4" />,
    calendar: <CalendarIcon className="w-4 h-4" />,
    stats: <ChartBarIcon className="w-4 h-4" />
};

/** La mascotte : l'oiseau de `public/logo.svg`, silhouette en currentColor.
    L'œil est « percé » par un masque (comme le vert qui transparaît sur le
    logo), pour rester lisible sur n'importe quel fond, sombre compris. */
const BirdMascot: React.FC<{ className?: string }> = ({ className }) => {
    // useId peut contenir « : » → assainir avant de l'injecter dans url(#…).
    const maskId = `es-eye-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;
    return (
        <svg viewBox="0 0 120 120" className={className} aria-hidden="true">
            <mask id={maskId}>
                <rect width="120" height="120" fill="white" />
                <circle cx="49" cy="27" r="3.5" fill="black" />
            </mask>
            <g transform="translate(8,2)" fill="currentColor" mask={`url(#${maskId})`}>
                <path d="M46 16 C62 16 75 28 79 44 C81 52 82 59 80 65 L94 74 L78 77 C72 90 59 98 46 98 C28 98 15 84 15 65 C15 45 27 30 40 27 Z" />
                <circle cx="45" cy="28" r="17" />
                <path d="M30 22 L14 29 L30 35 Z" />
                <path d="M41 97 v8 h7" stroke="currentColor" strokeWidth="4.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M56 97 v8 h7" stroke="currentColor" strokeWidth="4.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
            </g>
        </svg>
    );
};

const EmptyState: React.FC<EmptyStateProps> = ({ title, hint, variant, className = '' }) => (
    <div role="status" className={`flex flex-col items-center text-center py-12 ${className}`}>
        <div className="relative mb-4" aria-hidden="true">
            <div className="w-28 h-28 rounded-full bg-nature-green/10 dark:bg-nature-green/15 flex items-center justify-center">
                <BirdMascot className="w-16 h-16 text-nature-green-text/70 dark:text-nature-green/70" />
            </div>
            <span
                data-testid="empty-state-badge"
                className="absolute -bottom-1 -right-1 w-9 h-9 rounded-full liquid-glass flex items-center justify-center text-nature-green-text dark:text-nature-green"
            >
                {VARIANT_BADGE[variant]}
            </span>
        </div>
        <p className="font-medium text-gray-500 dark:text-gray-400">{title}</p>
        {hint && <p className="text-sm mt-1 text-gray-400 dark:text-gray-500">{hint}</p>}
    </div>
);

export default EmptyState;
