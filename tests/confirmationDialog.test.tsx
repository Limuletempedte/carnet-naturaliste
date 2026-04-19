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

    it('appelle onConfirm puis onClose au clic sur Confirmer', async () => {
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
        await waitFor(() => {
            expect(onConfirm).toHaveBeenCalledTimes(1);
            expect(onClose).toHaveBeenCalledTimes(1);
        });
    });
});
