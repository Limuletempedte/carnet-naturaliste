import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import EmptyState from '../components/EmptyState';

// 8c : état vide illustré — mascotte oiseau du logo + badge de contexte.

describe('EmptyState — état vide illustré avec mascotte (EE-4, 8c)', () => {
    it('affiche le titre, l\'indice et les illustrations décoratives', () => {
        render(<EmptyState variant="photos" title="Aucune photo à afficher." hint="Modifiez vos filtres." />);

        expect(screen.getByText('Aucune photo à afficher.')).toBeTruthy();
        expect(screen.getByText('Modifiez vos filtres.')).toBeTruthy();
        // La mascotte (oiseau) et l'icône du badge sont purement décoratives.
        const svgs = screen.getByRole('status').querySelectorAll('svg[aria-hidden="true"]');
        expect(svgs.length).toBeGreaterThanOrEqual(2);
        expect(screen.getByTestId('empty-state-badge')).toBeTruthy();
    });

    it('reste valide sans indice et propage className', () => {
        render(<EmptyState variant="search" title="Aucune observation trouvée." className="pb-24" />);

        const root = screen.getByRole('status');
        expect(root.className).toContain('pb-24');
        expect(root.querySelectorAll('p')).toHaveLength(1); // pas d'indice → un seul paragraphe
    });
});
