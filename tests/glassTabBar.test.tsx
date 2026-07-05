import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import GlassTabBar, { VIEW_TABS } from '../components/GlassTabBar';
import { View } from '../types';

// jsdom n'est pas Chromium : le hook de réfraction est inactif ici — on teste
// la structure (rôles ARIA), la bulle glissante et le câblage des clics.

// jsdom n'implémente pas PointerEvent (fireEvent.pointerDown fabrique un Event
// sans clientX) → on dispatch des MouseEvent (qui portent clientX) avec le type
// pointer* et un pointerId posé à la main. React les traite normalement.
const firePointer = (el: Element, type: string, init: { clientX?: number; pointerId?: number } = {}) => {
    const event = new MouseEvent(type, { bubbles: true, cancelable: true, clientX: init.clientX ?? 0 });
    Object.defineProperty(event, 'pointerId', { value: init.pointerId ?? 1 });
    fireEvent(el, event);
};

describe('GlassTabBar — onglets Liquid Glass avec bulle (EE-4, 8a v3)', () => {
    it('rend les 5 vues avec le bon état ARIA', () => {
        render(<GlassTabBar tabs={VIEW_TABS} activeId={View.LIST} onChange={() => { /* noop */ }} variant="mobile" ariaLabel="Vues" />);

        expect(screen.getAllByRole('tab')).toHaveLength(5);
        expect(screen.getByRole('tab', { name: /liste/i }).getAttribute('aria-selected')).toBe('true');
        expect(screen.getByRole('tab', { name: /carte/i }).getAttribute('aria-selected')).toBe('false');
    });

    it('affiche la bulle décorative sous l\'onglet actif', () => {
        render(<GlassTabBar tabs={VIEW_TABS} activeId={View.MAP} onChange={() => { /* noop */ }} variant="desktop" ariaLabel="Vues" />);

        const bubble = screen.getByTestId('glass-tab-bubble');
        expect(bubble.getAttribute('aria-hidden')).toBe('true');
        expect(bubble.className).toContain('liquid-glass-bubble');
    });

    it('masque la bulle quand la vue courante n\'est pas un onglet (ex. vue détail)', () => {
        render(<GlassTabBar tabs={VIEW_TABS} activeId={View.DETAIL} onChange={() => { /* noop */ }} variant="desktop" ariaLabel="Vues" />);

        expect(screen.queryByTestId('glass-tab-bubble')).toBeNull();
        expect(screen.queryAllByRole('tab', { selected: true })).toHaveLength(0);
    });

    it('notifie le changement d\'onglet au clic', () => {
        const onChange = vi.fn();
        render(<GlassTabBar tabs={VIEW_TABS} activeId={View.LIST} onChange={onChange} variant="mobile" ariaLabel="Vues" />);

        fireEvent.click(screen.getByRole('tab', { name: /galerie/i }));
        expect(onChange).toHaveBeenCalledWith(View.GALLERY);
    });

    it('permet de faire glisser la bulle vers un autre onglet (drag iOS 26)', () => {
        const onChange = vi.fn();
        render(<GlassTabBar tabs={VIEW_TABS} activeId={View.LIST} onChange={onChange} variant="mobile" ariaLabel="Vues" />);

        // jsdom ne calcule pas de layout : on pose une géométrie factice
        // (5 onglets de 60px côte à côte, centres à 30/90/150/210/270).
        const tabs = screen.getAllByRole('tab');
        tabs.forEach((tab, i) => {
            Object.defineProperty(tab, 'offsetLeft', { value: i * 60, configurable: true });
            Object.defineProperty(tab, 'offsetWidth', { value: 60, configurable: true });
        });

        // Attraper la bulle sur l'onglet actif, glisser, lâcher près de « Galerie ».
        firePointer(tabs[0], 'pointerdown', { pointerId: 1, clientX: 30 });
        firePointer(tabs[0], 'pointermove', { pointerId: 1, clientX: 265 });
        firePointer(tabs[0], 'pointerup', { pointerId: 1, clientX: 265 });

        expect(onChange).toHaveBeenCalledWith(View.GALLERY);
        // Le click fantôme émis après le drag ne doit pas re-naviguer vers l'origine.
        fireEvent.click(tabs[0]);
        expect(onChange).toHaveBeenCalledTimes(1);
    });

    it('un geste interrompu (pointercancel) ne change pas d\'onglet', () => {
        const onChange = vi.fn();
        render(<GlassTabBar tabs={VIEW_TABS} activeId={View.LIST} onChange={onChange} variant="mobile" ariaLabel="Vues" />);

        const tabs = screen.getAllByRole('tab');
        firePointer(tabs[0], 'pointerdown', { pointerId: 1, clientX: 30 });
        firePointer(tabs[0], 'pointermove', { pointerId: 1, clientX: 200 });
        firePointer(tabs[0], 'pointercancel', { pointerId: 1 });

        expect(onChange).not.toHaveBeenCalled();
    });
});
