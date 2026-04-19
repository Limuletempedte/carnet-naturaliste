import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import HelpPage from '../components/HelpPage';

describe('HelpPage (VP-19)', () => {
    it('rend le titre Aide et les sections attendues', () => {
        render(<HelpPage onBack={() => {}} onReplayTour={() => {}} />);
        expect(screen.getByRole('heading', { name: /^Aide$/i })).toBeDefined();
        expect(screen.getByText(/Saisir une observation/i)).toBeDefined();
        expect(screen.getByText(/Mode offline et synchronisation/i)).toBeDefined();
        expect(screen.getByText(/Exports disponibles/i)).toBeDefined();
        expect(screen.getByText(/Badges et séries/i)).toBeDefined();
    });

    it('le bouton Retour appelle onBack', () => {
        const onBack = vi.fn();
        render(<HelpPage onBack={onBack} onReplayTour={() => {}} />);
        fireEvent.click(screen.getByRole('button', { name: /Retour/i }));
        expect(onBack).toHaveBeenCalledTimes(1);
    });

    it('le bouton « Relancer le tutoriel » appelle onReplayTour', () => {
        const onReplayTour = vi.fn();
        render(<HelpPage onBack={() => {}} onReplayTour={onReplayTour} />);
        fireEvent.click(screen.getByRole('button', { name: /Relancer le tutoriel/i }));
        expect(onReplayTour).toHaveBeenCalledTimes(1);
    });
});
