import { describe, expect, it, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import OnboardingTour, { ONBOARDING_SEEN_KEY, isOnboardingSeen, markOnboardingSeen, resetOnboarding } from '../components/OnboardingTour';

beforeEach(() => {
    localStorage.clear();
    cleanup();
});

describe('OnboardingTour (VP-18)', () => {
    it('ne rend rien quand isOpen=false', () => {
        const onClose = vi.fn();
        const { container } = render(<OnboardingTour isOpen={false} onClose={onClose} />);
        expect(container.firstChild).toBeNull();
    });

    it('affiche le premier pas quand isOpen=true', () => {
        const onClose = vi.fn();
        render(<OnboardingTour isOpen onClose={onClose} />);
        expect(screen.getByText(/Bienvenue dans votre carnet naturaliste/i)).toBeDefined();
        expect(screen.getByText(/Étape 1 \/ 5/i)).toBeDefined();
    });

    it('« Passer le tutoriel » marque le flag seen et ferme', () => {
        const onClose = vi.fn();
        render(<OnboardingTour isOpen onClose={onClose} />);
        const skipBtn = screen.getByRole('button', { name: /Passer le tutoriel/i });
        fireEvent.click(skipBtn);
        expect(localStorage.getItem(ONBOARDING_SEEN_KEY)).toBe('true');
        expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('« Suivant » navigue d\'un pas à l\'autre jusqu\'à « Commencer »', () => {
        const onClose = vi.fn();
        render(<OnboardingTour isOpen onClose={onClose} />);
        for (let i = 0; i < 4; i++) {
            const nextBtn = screen.getByRole('button', { name: /Suivant/i });
            fireEvent.click(nextBtn);
        }
        expect(screen.getByText(/Étape 5 \/ 5/i)).toBeDefined();
        const finishBtn = screen.getByRole('button', { name: /Commencer/i });
        fireEvent.click(finishBtn);
        expect(localStorage.getItem(ONBOARDING_SEEN_KEY)).toBe('true');
        expect(onClose).toHaveBeenCalledTimes(1);
    });
});

describe('onboarding persistence helpers', () => {
    it('markOnboardingSeen + isOnboardingSeen', () => {
        expect(isOnboardingSeen()).toBe(false);
        markOnboardingSeen();
        expect(isOnboardingSeen()).toBe(true);
    });

    it('resetOnboarding supprime le flag', () => {
        markOnboardingSeen();
        expect(isOnboardingSeen()).toBe(true);
        resetOnboarding();
        expect(isOnboardingSeen()).toBe(false);
    });
});
