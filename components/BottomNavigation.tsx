import React from 'react';
import { View } from '../types';
import GlassTabBar, { VIEW_TABS } from './GlassTabBar';

interface BottomNavigationProps {
    currentView: View;
    onViewChange: (view: View) => void;
}

// EE-4 (8a v3) : pilule flottante détachée du bas de l'écran — le look de la
// barre Photothèque/Collections de Photos sur iOS 26 — avec la bulle d'eau qui
// glisse sous l'onglet actif (rendue par GlassTabBar). Le décalage bas intègre
// la safe-area (Home indicator) puisque la barre ne colle plus au bord.
const BottomNavigation: React.FC<BottomNavigationProps> = ({ currentView, onViewChange }) => (
    <nav
        aria-label="Navigation principale"
        className="fixed left-1/2 -translate-x-1/2 z-50 max-w-[calc(100vw-1rem)]"
        style={{ bottom: 'calc(0.75rem + env(safe-area-inset-bottom, 0px))' }}
    >
        <GlassTabBar tabs={VIEW_TABS} activeId={currentView} onChange={onViewChange} variant="mobile" ariaLabel="Vues" />
    </nav>
);

// React.memo évite un re-render complet quand App.tsx re-render pour d'autres raisons
// (toasts, filtres, observations mises à jour) mais que currentView et onViewChange
// n'ont pas changé. Gain significatif sur les interactions mobiles.
export default React.memo(BottomNavigation);
