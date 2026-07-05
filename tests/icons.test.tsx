import type React from 'react';
import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import * as icons from '../components/icons';

// 8b : smoke test — chaque icône exportée rend un <svg> décoratif
// (aria-hidden) qui hérite sa couleur (currentColor) et sa taille (className).

const iconEntries = Object.entries(icons).filter(
    (entry): entry is [string, React.FC<icons.IconProps>] =>
        entry[0].endsWith('Icon') && typeof entry[1] === 'function'
);

describe('icons — bibliothèque SVG de l\'app (EE-4, 8b)', () => {
    it('exporte bien la bibliothèque attendue', () => {
        expect(iconEntries.length).toBeGreaterThanOrEqual(19);
    });

    it.each(iconEntries)('%s rend un svg décoratif', (_name, IconComponent) => {
        const { container } = render(<IconComponent className="w-6 h-6" />);

        const svg = container.querySelector('svg');
        expect(svg).not.toBeNull();
        expect(svg?.getAttribute('aria-hidden')).toBe('true');
        expect(svg?.getAttribute('stroke')).toBe('currentColor');
        expect(svg?.getAttribute('class')).toBe('w-6 h-6');
    });
});
