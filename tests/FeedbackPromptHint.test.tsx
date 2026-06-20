import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import FeedbackPromptHint from '../components/FeedbackPromptHint';

/**
 * Tests de coordination : l'invite d'avis cède TOUJOURS la priorité à la
 * notification d'installation (jamais les deux en même temps), après un délai
 * laissant le temps à `beforeinstallprompt` d'arriver.
 */

const DELAY_MS = 4000;

beforeEach(() => {
    localStorage.clear();
    vi.useFakeTimers();
});

afterEach(() => {
    vi.useRealTimers();
    localStorage.clear();
});

const advancePastDelay = (): void => {
    act(() => { vi.advanceTimersByTime(DELAY_MS); });
};

describe('FeedbackPromptHint — coordination avec la notif d’installation', () => {
    it("ne s'affiche pas si la notif d'installation peut s'afficher", () => {
        // installMode 'prompt' + non installée + état vierge → la notif d'installation est prioritaire.
        render(<FeedbackPromptHint observationCount={10} installMode="prompt" isStandalone={false} />);
        advancePastDelay();
        expect(screen.queryByRole('dialog', { name: 'Votre avis' })).toBeNull();
    });

    it("s'affiche quand la notif d'installation est exclue (app installée) et le seuil atteint", () => {
        render(<FeedbackPromptHint observationCount={10} installMode="pending" isStandalone={true} />);
        advancePastDelay();
        expect(screen.getByRole('dialog', { name: 'Votre avis' })).toBeTruthy();
    });

    it("ne s'affiche pas sous le seuil d'observations", () => {
        render(<FeedbackPromptHint observationCount={2} installMode="pending" isStandalone={true} />);
        advancePastDelay();
        expect(screen.queryByRole('dialog', { name: 'Votre avis' })).toBeNull();
    });

    it("ne s'affiche pas avant l'écoulement du délai", () => {
        render(<FeedbackPromptHint observationCount={10} installMode="pending" isStandalone={true} />);
        act(() => { vi.advanceTimersByTime(DELAY_MS - 1); });
        expect(screen.queryByRole('dialog', { name: 'Votre avis' })).toBeNull();
    });
});
