import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import GlassTabBar, { VIEW_TABS } from '../components/GlassTabBar';
import { View } from '../types';

// jsdom n'est pas Chromium : le hook de réfraction est inactif ici — on teste
// la structure (rôles ARIA), la bulle glissante et le câblage des clics.

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
});
