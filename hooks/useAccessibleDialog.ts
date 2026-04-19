import { useEffect, useRef, useCallback } from 'react';

interface UseAccessibleDialogOptions {
    isOpen: boolean;
    onClose: () => void;
    titleId: string;
}

const FOCUSABLE_SELECTOR = [
    'a[href]',
    'button:not([disabled])',
    'input:not([disabled])',
    'select:not([disabled])',
    'textarea:not([disabled])',
    '[tabindex]:not([tabindex="-1"])',
].join(', ');

export function useAccessibleDialog({ isOpen, onClose, titleId }: UseAccessibleDialogOptions) {
    const dialogRef = useRef<HTMLDivElement>(null);
    const triggerRef = useRef<Element | null>(null);
    const prevIsOpenRef = useRef(false);

    // Save trigger, focus first element, restore focus on close
    useEffect(() => {
        const wasOpen = prevIsOpenRef.current;
        prevIsOpenRef.current = isOpen;

        if (isOpen && !wasOpen) {
            // Dialog just opened: save trigger and focus first element
            triggerRef.current = document.activeElement;
            if (dialogRef.current) {
                const focusables = dialogRef.current.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR);
                if (focusables.length > 0) {
                    focusables[0].focus();
                } else {
                    dialogRef.current.focus();
                }
            }
        } else if (!isOpen && wasOpen) {
            // Dialog just closed: restore focus to trigger
            const trigger = triggerRef.current;
            if (trigger && trigger instanceof HTMLElement) {
                trigger.focus();
            }
            triggerRef.current = null;
        }
    }, [isOpen]);

    // Escape key handler
    useEffect(() => {
        if (!isOpen) return;
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                e.stopPropagation();
                onClose();
            }
        };
        document.addEventListener('keydown', handleKeyDown);
        return () => document.removeEventListener('keydown', handleKeyDown);
    }, [isOpen, onClose]);

    // Focus trap
    const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
        if (e.key !== 'Tab' || !dialogRef.current) return;

        const focusables = dialogRef.current.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR);
        if (focusables.length === 0) return;

        const first = focusables[0];
        const last = focusables[focusables.length - 1];

        if (e.shiftKey) {
            if (document.activeElement === first) {
                e.preventDefault();
                last.focus();
            }
        } else {
            if (document.activeElement === last) {
                e.preventDefault();
                first.focus();
            }
        }
    }, []);

    const dialogProps = {
        role: 'dialog' as const,
        'aria-modal': true as const,
        'aria-labelledby': titleId,
        onKeyDown: handleKeyDown,
        tabIndex: -1,
    };

    return { dialogRef, dialogProps };
}
