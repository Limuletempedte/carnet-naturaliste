import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import AiNotePanel from '../components/AiNotePanel';
import type { NoteProposal } from '../utils/aiNoteMapping';

const proposals: NoteProposal[] = [
    { key: 'count', label: "Nombre d'individus", current: '1', proposed: '3', preChecked: true },
    { key: 'remainder', label: 'Commentaire (reste de la note)', current: 'vide', proposed: 'Nourrissage.', preChecked: true },
];

const renderPanel = (props: Partial<React.ComponentProps<typeof AiNotePanel>> = {}) => {
    const onApply = vi.fn();
    const onToggle = vi.fn();
    render(
        <AiNotePanel
            proposals={proposals}
            selection={new Set(['count'])}
            onToggle={onToggle}
            keepNote
            onKeepNoteChange={vi.fn()}
            noteAlreadyInComment={false}
            otherSpecies={[]}
            dropped={[]}
            onApply={onApply}
            onDiscard={vi.fn()}
            {...props}
        />,
    );
    return { onApply, onToggle };
};

describe('AiNotePanel', () => {
    it('montre la valeur actuelle et la valeur proposée, avec une case', () => {
        const { onToggle } = renderPanel();
        const box = screen.getByRole('checkbox', { name: /Nombre d'individus/ }) as HTMLInputElement;
        expect(box.checked).toBe(true);
        expect(screen.getByText('Actuel : 1')).toBeTruthy();
        fireEvent.click(box);
        expect(onToggle).toHaveBeenCalledWith('count');
    });

    it('masque le reste de la note quand la note entière est gardée (pas de doublon)', () => {
        renderPanel();
        expect(screen.queryByText('Nourrissage.')).toBeNull();
    });

    it('montre le reste de la note quand elle n’est pas gardée', () => {
        renderPanel({ keepNote: false });
        expect(screen.getByText('Nourrissage.')).toBeTruthy();
    });

    it('n’applique rien sans clic sur « Appliquer la sélection »', () => {
        const onKeepNoteChange = vi.fn();
        const { onApply, onToggle } = renderPanel({ onKeepNoteChange });
        fireEvent.click(screen.getByRole('checkbox', { name: /Nombre d'individus/ }));
        fireEvent.click(screen.getByRole('checkbox', { name: /Garder la note/ }));
        expect(onToggle).toHaveBeenCalledTimes(1);
        expect(onKeepNoteChange).toHaveBeenCalledWith(false);
        expect(onApply).not.toHaveBeenCalled();
        fireEvent.click(screen.getByRole('button', { name: 'Appliquer la sélection' }));
        expect(onApply).toHaveBeenCalledTimes(1);
    });

    it('désactive le bouton s’il n’y a rien à appliquer', () => {
        renderPanel({ selection: new Set(), keepNote: false });
        expect((screen.getByRole('button', { name: 'Appliquer la sélection' }) as HTMLButtonElement).disabled).toBe(true);
    });

    it('lit les valeurs une seule fois : elles sont dans le libellé, sans description en double', () => {
        renderPanel();
        const box = screen.getByRole('checkbox', { name: /Nombre d'individus/ });
        expect(box.getAttribute('aria-describedby')).toBeNull();
        expect(box.closest('label')?.textContent).toMatch(/Actuel : 1/);
    });

    it('pendant la vérification du nom : bouton occupé, « Annuler » proposé', () => {
        const onCancelApply = vi.fn();
        const { onApply } = renderPanel({ isApplying: true, onCancelApply });
        fireEvent.click(screen.getByRole('button', { name: 'Vérification du nom…' }));
        expect(onApply).not.toHaveBeenCalled();
        fireEvent.click(screen.getByRole('button', { name: 'Annuler' }));
        expect(onCancelApply).toHaveBeenCalled();
    });
});
