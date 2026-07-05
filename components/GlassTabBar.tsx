import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { View } from '../types';
import { useLiquidGlassRefraction } from './LiquidGlass';

// EE-4 (8a v3) : barre d'onglets « Liquid Glass » iOS 26 — une pilule de verre
// contenant une bulle d'eau quasi transparente qui glisse élastiquement sous
// l'onglet actif, comme la barre Photothèque/Collections de l'app Photos.
// Partagée entre la barre du bas mobile (icône au-dessus du libellé) et les
// onglets desktop (icône + libellé en ligne).

export interface GlassTabDefinition {
    id: View;
    label: string;
    /** L'icône reçoit sa classe de taille (elle diffère entre mobile et desktop). */
    icon: (className: string) => React.ReactNode;
}

// Définition unique des 5 vues, partagée mobile/desktop (avant le Lot 8a v3,
// les icônes étaient dupliquées entre App.tsx et BottomNavigation.tsx).
export const VIEW_TABS: GlassTabDefinition[] = [
    {
        id: View.LIST, label: 'Liste',
        icon: (cls) => <svg xmlns="http://www.w3.org/2000/svg" className={cls} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 10h16M4 14h16M4 18h16" /></svg>
    },
    {
        id: View.MAP, label: 'Carte',
        icon: (cls) => <svg xmlns="http://www.w3.org/2000/svg" className={cls} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" /></svg>
    },
    {
        id: View.STATS, label: 'Stats',
        icon: (cls) => <svg xmlns="http://www.w3.org/2000/svg" className={cls} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg>
    },
    {
        id: View.CALENDAR, label: 'Calendrier',
        icon: (cls) => <svg xmlns="http://www.w3.org/2000/svg" className={cls} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
    },
    {
        id: View.GALLERY, label: 'Galerie',
        icon: (cls) => <svg xmlns="http://www.w3.org/2000/svg" className={cls} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
    },
];

interface BubbleRect {
    x: number;
    y: number;
    w: number;
    h: number;
}

interface GlassTabBarProps {
    tabs: GlassTabDefinition[];
    /** Vue courante — si elle n'est pas dans tabs (ex. vue détail), la bulle disparaît. */
    activeId: View;
    onChange: (id: View) => void;
    /** mobile = icône au-dessus du libellé (barre du bas) ; desktop = en ligne. */
    variant: 'mobile' | 'desktop';
    ariaLabel: string;
}

const GlassTabBar: React.FC<GlassTabBarProps> = ({ tabs, activeId, onChange, variant, ariaLabel }) => {
    const isMobile = variant === 'mobile';
    const containerRef = useRef<HTMLDivElement | null>(null);
    const buttonRefs = useRef(new Map<View, HTMLButtonElement>());
    const [bubble, setBubble] = useState<BubbleRect | null>(null);
    // La transition ne s'active qu'après le premier positionnement, sinon la
    // bulle « arriverait » du coin haut-gauche à l'apparition de la barre.
    const hasPositionedRef = useRef(false);

    // Verre de la barre elle-même (réfraction des bords, Chromium uniquement).
    const barGlassRef = useLiquidGlassRefraction<HTMLDivElement>(
        isMobile ? { bezelWidth: 22, scale: 48 } : { bezelWidth: 18 }
    );
    // La bulle : petite lentille très bombée — réfraction forte, flou minimal
    // (le fond doit rester net et magnifié), reflet spéculaire marqué.
    const bubbleGlassRef = useLiquidGlassRefraction<HTMLSpanElement>({
        scale: 72, bezelWidth: 13, blur: 1, saturate: 1.9, brightness: 1.12,
        specularStrength: 1.1, specularShininess: 48
    });

    const setContainerRef = useCallback((node: HTMLDivElement | null) => {
        containerRef.current = node;
        barGlassRef(node);
    }, [barGlassRef]);

    const measure = useCallback(() => {
        const active = buttonRefs.current.get(activeId);
        if (!active || !containerRef.current) {
            setBubble(null);
            return;
        }
        // offsetLeft/offsetTop sont relatifs au conteneur (positionné par
        // :where(.liquid-glass)) — insensibles au scroll et aux transforms.
        setBubble({ x: active.offsetLeft, y: active.offsetTop, w: active.offsetWidth, h: active.offsetHeight });
    }, [activeId]);

    useLayoutEffect(() => {
        measure();
    }, [measure]);

    useEffect(() => {
        hasPositionedRef.current = bubble !== null;
    }, [bubble]);

    // Re-mesure quand la barre change de taille (rotation, resize, police chargée).
    useEffect(() => {
        const container = containerRef.current;
        if (!container || typeof ResizeObserver === 'undefined') return;
        const observer = new ResizeObserver(measure);
        observer.observe(container);
        return () => observer.disconnect();
    }, [measure]);

    const animate = hasPositionedRef.current;

    return (
        <div
            ref={setContainerRef}
            role="tablist"
            aria-label={ariaLabel}
            className={`relative liquid-glass liquid-glass-sheen rounded-full flex items-center max-w-full overflow-x-auto ${isMobile ? 'px-1.5 py-1.5' : 'p-1.5 gap-1'}`}
        >
            {bubble && (
                <span
                    ref={bubbleGlassRef}
                    aria-hidden="true"
                    data-testid="glass-tab-bubble"
                    className="liquid-glass-bubble absolute left-0 top-0 rounded-full pointer-events-none"
                    style={{
                        width: bubble.w,
                        height: bubble.h,
                        transform: `translate(${bubble.x}px, ${bubble.y}px)`,
                        ...(animate ? {} : { transition: 'none' })
                    }}
                />
            )}
            {tabs.map((tab) => {
                const isActive = activeId === tab.id;
                return (
                    <button
                        key={tab.id}
                        ref={(node) => {
                            if (node) buttonRefs.current.set(tab.id, node);
                            else buttonRefs.current.delete(tab.id);
                        }}
                        role="tab"
                        aria-selected={isActive}
                        onClick={() => onChange(tab.id)}
                        className={isMobile
                            ? `relative flex flex-col items-center justify-center min-w-[56px] min-h-[48px] px-2 py-1.5 rounded-full transition-colors duration-300 ${isActive
                                ? 'text-nature-green-text dark:text-nature-green'
                                : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'}`
                            : `relative px-5 py-2.5 rounded-full text-sm font-semibold transition-colors duration-300 flex items-center gap-2 whitespace-nowrap ${isActive
                                ? 'text-nature-dark dark:text-white'
                                : 'text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200 hover:bg-white/30 dark:hover:bg-white/5'}`}
                    >
                        <span aria-hidden="true" className={isMobile ? 'mb-0.5' : ''}>{tab.icon(isMobile ? 'w-5 h-5' : 'w-4 h-4')}</span>
                        <span className={isMobile ? 'text-[10px] font-medium uppercase tracking-wide' : ''}>{tab.label}</span>
                    </button>
                );
            })}
        </div>
    );
};

// React.memo : App re-render souvent (toasts, filtres, observations) alors que
// les onglets ne changent que sur navigation — même logique que BottomNavigation.
export default React.memo(GlassTabBar);
