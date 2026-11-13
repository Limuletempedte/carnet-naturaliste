import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import AiButton, { formatAiCost } from '../components/AiButton';

describe('AiButton', () => {
    it('annonce le coût : 1 utilisation et le nombre restant', () => {
        render(<AiButton label="Rédiger le bilan" onClick={vi.fn()} remaining={12} />);
        const button = screen.getByRole('button', { name: 'Rédiger le bilan' });
        const help = document.getElementById(button.getAttribute('aria-describedby')!);
        expect(help?.textContent).toContain('1 utilisation · 12 restantes');
        expect(formatAiCost(1)).toBe('1 utilisation · 1 restante');
        expect(formatAiCost(null)).toBe('1 utilisation');
    });

    it('est désactivé hors ligne avec la raison affichée', () => {
        const onClick = vi.fn();
        render(<AiButton label="Rédiger le bilan" onClick={onClick} isOffline remaining={5} />);
        const button = screen.getByRole('button', { name: 'Rédiger le bilan' }) as HTMLButtonElement;
        expect(button.disabled).toBe(true);
        expect(screen.getByText('Disponible en ligne uniquement.')).toBeTruthy();
        fireEvent.click(button);
        expect(onClick).not.toHaveBeenCalled();
    });

    it('affiche le libellé d’attente et bloque un second clic, sans perdre le focus', () => {
        const onClick = vi.fn();
        const { rerender } = render(<AiButton label="Rédiger le bilan" loadingLabel="Rédaction en cours…" onClick={onClick} />);
        const button = screen.getByRole('button', { name: 'Rédiger le bilan' }) as HTMLButtonElement;
        button.focus();
        rerender(<AiButton label="Rédiger le bilan" loadingLabel="Rédaction en cours…" onClick={onClick} isLoading />);
        expect(screen.getByRole('button', { name: 'Rédaction en cours…' })).toBe(button);
        // aria-disabled plutôt que disabled : le focus clavier reste sur le bouton.
        expect(button.disabled).toBe(false);
        expect(button.getAttribute('aria-disabled')).toBe('true');
        expect(document.activeElement).toBe(button);
        fireEvent.click(button);
        expect(onClick).not.toHaveBeenCalled();
        expect(button.getAttribute('aria-busy')).toBe('true');
        // L'icône ne s'anime que si l'appareil accepte les animations.
        expect(button.querySelector('svg')?.getAttribute('class')).toContain('motion-safe:animate-pulse');
    });
});
