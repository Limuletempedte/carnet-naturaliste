import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import UserProfile from '../components/Auth/UserProfile';

const signOutMock = vi.fn(async () => { });
const getOfflineQueueSnapshotMock = vi.fn(() => [] as unknown[]);

vi.mock('../contexts/AuthContext', () => ({
    useAuth: () => ({ user: { id: 'u1', email: 'test@example.com' }, signOut: signOutMock }),
}));

vi.mock('../services/storageService', () => ({
    getOfflineQueueSnapshot: () => getOfflineQueueSnapshotMock(),
}));

describe('UserProfile — déconnexion et file offline (H7)', () => {
    beforeEach(() => {
        signOutMock.mockClear();
        getOfflineQueueSnapshotMock.mockReturnValue([]);
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    const openAndClickSignOut = () => {
        fireEvent.click(screen.getByRole('button', { name: 'Menu utilisateur' }));
        fireEvent.click(screen.getByRole('menuitem', { name: 'Se déconnecter' }));
    };

    it('se déconnecte sans confirmation quand la file offline est vide', async () => {
        render(<UserProfile />);
        openAndClickSignOut();
        expect(signOutMock).toHaveBeenCalledTimes(1);
    });

    it('annule la déconnexion si l\'utilisateur refuse la confirmation (file non vide)', () => {
        getOfflineQueueSnapshotMock.mockReturnValue([{ id: 'a' }, { id: 'b' }]);
        const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);

        render(<UserProfile />);
        openAndClickSignOut();

        expect(confirmSpy).toHaveBeenCalledTimes(1);
        expect(confirmSpy.mock.calls[0][0]).toContain('2 observation');
        expect(signOutMock).not.toHaveBeenCalled();
    });

    it('se déconnecte si l\'utilisateur accepte malgré la file non vide', async () => {
        getOfflineQueueSnapshotMock.mockReturnValue([{ id: 'a' }]);
        vi.spyOn(window, 'confirm').mockReturnValue(true);

        render(<UserProfile />);
        openAndClickSignOut();

        expect(signOutMock).toHaveBeenCalledTimes(1);
    });
});

describe("UserProfile — entrée « Aide à l'identification (IA) »", () => {
    it("ouvre la fenêtre de l'assistant et ferme le menu", () => {
        const onOpenAiAssistant = vi.fn();
        render(<UserProfile onOpenAiAssistant={onOpenAiAssistant} />);
        fireEvent.click(screen.getByRole('button', { name: 'Menu utilisateur' }));
        fireEvent.click(screen.getByRole('menuitem', { name: "Aide à l'identification (IA)" }));
        expect(onOpenAiAssistant).toHaveBeenCalledTimes(1);
        expect(screen.queryByRole('menu')).toBeNull();
    });

    it("n'affiche pas l'entrée sans gestionnaire", () => {
        render(<UserProfile />);
        fireEvent.click(screen.getByRole('button', { name: 'Menu utilisateur' }));
        expect(screen.queryByRole('menuitem', { name: "Aide à l'identification (IA)" })).toBeNull();
    });
});
