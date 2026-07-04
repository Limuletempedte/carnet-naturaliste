
import React from 'react';
import { useAccessibleDialog } from '../hooks/useAccessibleDialog';
import { useLiquidGlassRefraction } from './LiquidGlass';

interface ConfirmationDialogProps {
    isOpen: boolean;
    onClose: () => void;
    onConfirm: () => void | Promise<void>;
    title: string;
    message: string;
    variant?: 'default' | 'destructive';
}

const ConfirmationDialog: React.FC<ConfirmationDialogProps> = ({ isOpen, onClose, onConfirm, title, message, variant }) => {
    const { dialogRef, dialogProps } = useAccessibleDialog({ isOpen, onClose, titleId: 'confirmation-dialog-title' });
    // EE-4 : réfraction Liquid Glass sur le panneau (Chromium uniquement).
    const glassRef = useLiquidGlassRefraction<HTMLDivElement>();

    if (!isOpen) return null;

    const isDestructive = variant === 'destructive' || title.toLowerCase().includes('suppression') || title.toLowerCase().includes('delete');

    const buttonClass = "px-6 py-2 rounded-md shadow-sm font-semibold text-white transition-all duration-200 transform hover:scale-105";
    const primaryButtonClass = `${buttonClass} ${isDestructive ? 'bg-red-600 hover:bg-red-700' : 'bg-nature-green hover:bg-nature-dark'}`;
    const secondaryButtonClass = `${buttonClass} bg-gray-400 hover:bg-gray-500 text-gray-800`;

    return (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex justify-center items-center p-4">
            <div
                ref={(node) => { dialogRef.current = node; glassRef(node); }}
                {...dialogProps}
                className="liquid-glass liquid-glass-sheen animate-scaleIn rounded-2xl p-8 w-full max-w-md transform transition-all"
            >
                <h3 id="confirmation-dialog-title" className="text-2xl font-serif font-bold text-nature-dark dark:text-white">{title}</h3>
                <p className="mt-4 text-gray-700 dark:text-gray-300">{message}</p>
                <div className="mt-8 flex justify-end space-x-4">
                    <button 
                        onClick={onClose} 
                        className={secondaryButtonClass}>
                        Annuler
                    </button>
                    <button
                        onClick={() => {
                            // Fermer le modal immédiatement pour que l'utilisateur
                            // voie le feedback de progression (toast, spinner, etc.)
                            // même si onConfirm() est long (ex. suppression en masse).
                            onClose();
                            Promise.resolve(onConfirm()).catch(() => {
                                // Erreur gérée par l'appelant
                            });
                        }}
                        className={primaryButtonClass}>
                        Confirmer
                    </button>
                </div>
            </div>
        </div>
    );
};

export default ConfirmationDialog;
