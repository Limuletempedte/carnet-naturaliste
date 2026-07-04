import React from 'react';
import { View } from '../types';
import { useLiquidGlassRefraction } from './LiquidGlass';

interface BottomNavigationProps {
    currentView: View;
    onViewChange: (view: View) => void;
}

// Extrait hors du render : ces icônes SVG sont statiques et ne dépendent
// d'aucune prop. Les recréer à chaque render empêche React.memo d'avoir
// un effet optimal (new JSX references → different tabs array reference).
interface TabDefinition {
    id: View;
    label: string;
    icon: React.ReactNode;
}

const TABS: TabDefinition[] = [
    {
        id: View.LIST, label: 'Liste',
        icon: <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 10h16M4 14h16M4 18h16" /></svg>
    },
    {
        id: View.MAP, label: 'Carte',
        icon: <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" /></svg>
    },
    {
        id: View.STATS, label: 'Stats',
        icon: <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg>
    },
    {
        id: View.CALENDAR, label: 'Calendrier',
        icon: <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
    },
    {
        id: View.GALLERY, label: 'Galerie',
        icon: <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
    },
];

const BottomNavigation: React.FC<BottomNavigationProps> = ({ currentView, onViewChange }) => {
    // EE-4 : réfraction Liquid Glass sur les bords de la barre (Chromium uniquement).
    const glassRef = useLiquidGlassRefraction<HTMLElement>({ bezelWidth: 10 });
    return (
        <nav ref={glassRef} aria-label="Navigation principale" className="fixed bottom-0 left-0 right-0 liquid-glass liquid-glass-sheen border-x-0 border-b-0 pb-safe pt-2 px-4 z-50">
            <div role="tablist" aria-label="Vues" className="flex justify-around items-center">
                {TABS.map((tab) => (
                    <button
                        key={tab.id}
                        role="tab"
                        aria-selected={currentView === tab.id}
                        onClick={() => onViewChange(tab.id)}
                        className={`flex flex-col items-center justify-center min-w-[44px] min-h-[44px] p-2 transition-all duration-300 ${currentView === tab.id
                                ? 'text-nature-green-text dark:text-nature-green transform scale-110'
                                : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
                            }`}
                    >
                        <span aria-hidden="true" className="mb-1">{tab.icon}</span>
                        <span className="text-[10px] font-medium uppercase tracking-wide">{tab.label}</span>
                    </button>
                ))}
            </div>
        </nav>
    );
};

// React.memo évite un re-render complet quand App.tsx re-render pour d'autres raisons
// (toasts, filtres, observations mises à jour) mais que currentView et onViewChange
// n'ont pas changé. Gain significatif sur les interactions mobiles.
export default React.memo(BottomNavigation);
