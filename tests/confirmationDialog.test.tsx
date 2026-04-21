import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import ConfirmationDialog from '../components/ConfirmationDialog';

describe('ConfirmationDialog', () => {
    it('ne rend rien quand isOpen=false', () => {
        const { container } = render(
            <ConfirmationDialog
                isOpen={false}
                onClose={vi.fn()}
                onConfirm={vi.fn()}
                title="Supprimer"
                message="Es-tu sur ?"
            />
        );
        expect(container.firstChild).toBeNull();
    });

    it('appelle onClose au clic sur Annuler', () => {
        const onClose = vi.fn();
        const onConfirm = vi.fn();
        render(
            <ConfirmationDialog
                isOpen={true}
                onClose={onClose}
                onConfirm={onConfirm}
                title="Supprimer"
                message="Es-tu sur ?"
            />
        );
        fireEvent.click(screen.getByRole('button', { name: /Annuler/i }));
        expect(onClose).toHaveBeenCalledTimes(1);
        expect(onConfirm).not.toHaveBeenCalled();
    });

    it('appelle onClose immédiatement puis onConfirm au clic sur Confirmer', async () => {
        const onClose = vi.fn();
        const onConfirm = vi.fn().mockResolvedValue(undefined);
        render(
            <ConfirmationDialog
                isOpen={true}
                onClose={onClose}
                onConfirm={onConfirm}
                title="Confirmer l action"
                message="Continuer ?"
            />
        );
        fireEvent.click(screen.getByRole('button', { name: /Confirmer/i }));

        // onClose doit être synchrone — le modal disparaît avant que onConfirm
        // résolve, pour que l'utilisateur voie le feedback pendant l'opération longue
        expect(onClose).toHaveBeenCalledTimes(1);

        await waitFor(() => {
            expect(onConfirm).toHaveBeenCalledTimes(1);
        });
    });

    it('n attend pas la résolution de onConfirm pour fermer le modal (bulk delete)', async () => {
        const onClose = vi.fn();
        // Simule une opération longue : onConfirm met 100ms à résoudre
        let resolveConfirm: () => void = () => { };
        const onConfirm = vi.fn().mockReturnValue(new Promise<void>(resolve => {
            resolveConfirm = resolve;
        }));

        render(
            <ConfirmationDialog
                isOpen={true}
                onClose={onClose}
                onConfirm={onConfirm}
                title="Supprimer en masse"
                message="50 observations ?"
            />
        );
        fireEvent.click(screen.getByRole('button', { name: /Confirmer/i }));

        // onClose appelé synchroniquement, onConfirm lancé mais non résolu
        expect(onClose).toHaveBeenCalledTimes(1);
        expect(onConfirm).toHaveBeenCalledTimes(1);

        // Débloque l'opération ; le test ne doit pas hanger
        resolveConfirm();
        await waitFor(() => expect(onConfirm).toHaveBeenCalledTimes(1));
    });

    it('gère silencieusement une erreur lancée par onConfirm', async () => {
        const onClose = vi.fn();
        const onConfirm = vi.fn().mockRejectedValue(new Error('boom'));
        const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => { });

        render(
            <ConfirmationDialog
                isOpen={true}
                onClose={onClose}
                onConfirm={onConfirm}
                title="Action"
                message="Continuer ?"
            />
        );
        fireEvent.click(screen.getByRole('button', { name: /Confirmer/i }));

        // onClose appelé malgré l'échec (pas de modal coincée)
        expect(onClose).toHaveBeenCalledTimes(1);

        await waitFor(() => expect(onConfirm).toHaveBeenCalledTimes(1));

        // Le rejet est catché silencieusement — l'appelant gère l'erreur via ses propres toasts
        consoleErrorSpy.mockRestore();
    });
});
