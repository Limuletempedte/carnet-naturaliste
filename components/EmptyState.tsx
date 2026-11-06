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

/** La mascotte : l'oiseau de `public/logo.svg` (mêmes tracés), silhouette en
    currentColor. L'œil et l'aile sont « percés » par un masque (comme le vert
    qui transparaît sur le logo), pour rester lisibles sur n'importe quel fond,
    sombre compris. */
const BirdMascot: React.FC<{ className?: string }> = ({ className }) => {
    // useId peut contenir « : » → assainir avant de l'injecter dans url(#…).
    const maskId = `es-cut-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;
    return (
        <svg viewBox="70 80 342 342" className={className} aria-hidden="true">
            <mask id={maskId} maskUnits="userSpaceOnUse" x="70" y="80" width="342" height="342">
                <rect x="70" y="80" width="342" height="342" fill="white" />
                <circle cx="311.2" cy="150.6" r="13.5" fill="black" />
                <path d="M280.6 217 C291.6 282 211.6 332 135.4 308 C201.4 302 263.4 264 280.6 217 Z" fill="black" />
            </mask>
            <g fill="currentColor" mask={`url(#${maskId})`}>
                <path d="M86 293 C130.5 267 194 184.5 223.2 132.5 C238 106 262 96.5 293.2 96.6 C322 96 346 117 357.4 134.8 L396.4 138.1 L361 167.8 C357.8 185 362.4 205 361.6 228 C360.6 300.5 310 365.4 234 365.4 C180 367.5 118 338 86 293 Z" />
                <path d="M200.8 358 L200.8 398 Q200.8 402.3 205 402.3 L236 402.3 Q240.5 402.3 240 398.5 Q239.3 394.6 234 394 L222 393 Q215.4 392.4 215.4 386 L215.4 358 Z M251 358 L251 401 Q251 405.6 255.5 405.6 L288 405.6 Q293 405.6 292.7 401.5 Q292.2 397.6 287 396.9 L273 395.3 Q265.6 394.5 265.6 388 L265.6 358 Z" />
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
