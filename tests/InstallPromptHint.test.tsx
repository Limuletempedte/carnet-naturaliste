import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import InstallPromptHint from '../components/InstallPromptHint';
import { getInstallHintState, setInstallHintState } from '../utils/installPromptState';

/**
 * Tests de non-régression de la bannière « Installer l'application » :
 * affichage conditionnel selon le navigateur + respect des règles anti-harcèlement.
 */

beforeEach(() => localStorage.clear());
afterEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
});

describe('InstallPromptHint', () => {
    it("ne s'affiche pas tant que le contexte est indéterminé (pending)", () => {
        render(<InstallPromptHint installMode="pending" isStandalone={false} onInstall={vi.fn()} />);
        expect(screen.queryByRole('dialog')).toBeNull();
    });

    it("ne s'affiche pas si l'app est déjà installée", () => {
        render(<InstallPromptHint installMode="prompt" isStandalone={true} onInstall={vi.fn()} />);
        expect(screen.queryByRole('dialog')).toBeNull();
    });

    it("ne s'affiche pas si l'utilisateur a déjà refusé", () => {
        setInstallHintState({ firstSeenAt: 1000, shownCount: 1, dismissed: true, installed: false });
        render(<InstallPromptHint installMode="prompt" isStandalone={false} onInstall={vi.fn()} />);
        expect(screen.queryByRole('dialog')).toBeNull();
    });

    it("affiche la bannière et incrémente le compteur en mode 'prompt'", () => {
        render(<InstallPromptHint installMode="prompt" isStandalone={false} onInstall={vi.fn()} />);
        expect(screen.getByRole('dialog', { name: "Installer l'application" })).toBeTruthy();
        expect(screen.getByText(/Accès plus rapide/)).toBeTruthy();
        expect(getInstallHintState().shownCount).toBe(1);
    });

    it("déclenche onInstall au clic sur « Installer »", () => {
        const onInstall = vi.fn();
        render(<InstallPromptHint installMode="prompt" isStandalone={false} onInstall={onInstall} />);
        fireEvent.click(screen.getByRole('button', { name: 'Installer' }));
        expect(onInstall).toHaveBeenCalledTimes(1);
    });

    it("ferme définitivement et persiste le refus au clic sur « Non merci »", () => {
        render(<InstallPromptHint installMode="prompt" isStandalone={false} onInstall={vi.fn()} />);
        fireEvent.click(screen.getByRole('button', { name: 'Non merci' }));
        expect(screen.queryByRole('dialog')).toBeNull();
        expect(getInstallHintState().dismissed).toBe(true);
    });

    it("affiche un message d'aide iOS sans bouton « Installer »", () => {
        render(<InstallPromptHint installMode="ios" isStandalone={false} onInstall={vi.fn()} />);
        expect(screen.getByText(/Partager/)).toBeTruthy();
        expect(screen.getByRole('button', { name: 'Compris' })).toBeTruthy();
        expect(screen.queryByRole('button', { name: 'Installer' })).toBeNull();
    });

    it('conseille un navigateur compatible en mode unsupported', () => {
        render(<InstallPromptHint installMode="unsupported" isStandalone={false} onInstall={vi.fn()} />);
        expect(screen.getByText(/Chrome, Edge/)).toBeTruthy();
        expect(screen.getByRole('button', { name: 'Compris' })).toBeTruthy();
    });
});
