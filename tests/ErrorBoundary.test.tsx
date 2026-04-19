import { render, screen, fireEvent } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import ErrorBoundary from '../components/ErrorBoundary';

const ThrowingChild = ({ shouldThrow }: { shouldThrow: boolean }) => {
    if (shouldThrow) throw new Error('Test crash');
    return <p>OK</p>;
};

describe('ErrorBoundary', () => {
    beforeEach(() => {
        vi.spyOn(console, 'error').mockImplementation(() => {});
    });

    it('renders children when no error', () => {
        render(
            <ErrorBoundary>
                <p>Hello</p>
            </ErrorBoundary>
        );
        expect(screen.getByText('Hello')).toBeTruthy();
    });

    it('renders fallback UI when child throws', () => {
        render(
            <ErrorBoundary fallbackLabel="le composant">
                <ThrowingChild shouldThrow={true} />
            </ErrorBoundary>
        );
        expect(screen.getByText('Erreur dans le composant')).toBeTruthy();
        expect(screen.getByText('Test crash')).toBeTruthy();
        expect(screen.getByText('Retour')).toBeTruthy();
        expect(screen.getByText('Recharger la page')).toBeTruthy();
    });

    it('calls onReset when Retour is clicked', () => {
        const onReset = vi.fn();
        render(
            <ErrorBoundary fallbackLabel="test" onReset={onReset}>
                <ThrowingChild shouldThrow={true} />
            </ErrorBoundary>
        );

        expect(screen.getByText('Erreur dans test')).toBeTruthy();
        fireEvent.click(screen.getByText('Retour'));
        expect(onReset).toHaveBeenCalledOnce();
    });

    it('uses default label when fallbackLabel is not provided', () => {
        render(
            <ErrorBoundary>
                <ThrowingChild shouldThrow={true} />
            </ErrorBoundary>
        );
        expect(screen.getByText('Erreur dans cette section')).toBeTruthy();
    });
});
