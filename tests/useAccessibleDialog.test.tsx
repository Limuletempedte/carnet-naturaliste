import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { useState } from 'react';
import { useAccessibleDialog } from '../hooks/useAccessibleDialog';

function TestDialog({ onClose, initialOpen = true }: { onClose: () => void; initialOpen?: boolean }) {
    const [isOpen, setIsOpen] = useState(initialOpen);
    const { dialogRef, dialogProps } = useAccessibleDialog({
        isOpen,
        onClose: () => { setIsOpen(false); onClose(); },
        titleId: 'test-dialog-title',
    });

    return (
        <>
            <button data-testid="trigger" onClick={() => setIsOpen(true)}>Open</button>
            {isOpen && (
                <div data-testid="backdrop">
                    <div ref={dialogRef} {...dialogProps} data-testid="dialog">
                        <h2 id="test-dialog-title">Test Dialog</h2>
                        <input data-testid="first-input" />
                        <button data-testid="close-btn" onClick={() => { setIsOpen(false); onClose(); }}>Close</button>
                    </div>
                </div>
            )}
        </>
    );
}

describe('useAccessibleDialog', () => {
    it('renders dialog with correct ARIA attributes', () => {
        const onClose = vi.fn();
        render(<TestDialog onClose={onClose} />);

        const dialog = screen.getByTestId('dialog');
        expect(dialog.getAttribute('role')).toBe('dialog');
        expect(dialog.getAttribute('aria-modal')).toBe('true');
        expect(dialog.getAttribute('aria-labelledby')).toBe('test-dialog-title');
    });

    it('closes dialog on Escape key', () => {
        const onClose = vi.fn();
        render(<TestDialog onClose={onClose} />);

        fireEvent.keyDown(document, { key: 'Escape' });
        expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('focuses first focusable element on open', () => {
        const onClose = vi.fn();
        render(<TestDialog onClose={onClose} />);

        const firstInput = screen.getByTestId('first-input');
        expect(document.activeElement).toBe(firstInput);
    });

    it('traps focus within dialog on Tab', () => {
        const onClose = vi.fn();
        render(<TestDialog onClose={onClose} />);

        const dialog = screen.getByTestId('dialog');
        const closeBtn = screen.getByTestId('close-btn');

        // Focus the last element
        closeBtn.focus();
        expect(document.activeElement).toBe(closeBtn);

        // Tab from last element should wrap to first
        fireEvent.keyDown(dialog, { key: 'Tab' });
        // Focus trap should have prevented default and moved focus to first element
        const firstInput = screen.getByTestId('first-input');
        expect(document.activeElement).toBe(firstInput);
    });

    it('restores focus to trigger on close', async () => {
        const onClose = vi.fn();
        const { rerender } = render(<TestDialog onClose={onClose} initialOpen={false} />);

        const trigger = screen.getByTestId('trigger');
        trigger.focus();
        expect(document.activeElement).toBe(trigger);

        // Open the dialog
        fireEvent.click(trigger);
        expect(screen.getByTestId('dialog')).toBeTruthy();

        // Close via button
        fireEvent.click(screen.getByTestId('close-btn'));
        rerender(<TestDialog onClose={onClose} initialOpen={false} />);

        // Trigger should have focus restored
        expect(document.activeElement).toBe(trigger);
    });
});
