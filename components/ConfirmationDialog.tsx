
import React from 'react';

interface ConfirmationDialogProps {
    isOpen: boolean;
    onClose: () => void;
    onConfirm: () => void;
    title: string;
    message: string;
}

const ConfirmationDialog: React.FC<ConfirmationDialogProps> = ({ isOpen, onClose, onConfirm, title, message }) => {
    if (!isOpen) return null;

    const isDestructive = title.toLowerCase().includes('suppression') || title.toLowerCase().includes('delete');

    const buttonClass = "px-6 py-2 rounded-md shadow-sm font-semibold text-white transition-all duration-200 transform hover:scale-105";
    const primaryButtonClass = `${buttonClass} ${isDestructive ? 'bg-red-600 hover:bg-red-700' : 'bg-nature-green hover:bg-nature-dark'}`;
    const secondaryButtonClass = `${buttonClass} bg-gray-400 hover:bg-gray-500 text-gray-800`;

    return (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex justify-center items-center p-4">
            <div className="bg-white/80 backdrop-blur-md rounded-xl shadow-2xl p-8 w-full max-w-md transform transition-all">
                <h3 className="text-2xl font-serif font-bold text-nature-dark">{title}</h3>
                <p className="mt-4 text-gray-700">{message}</p>
                <div className="mt-8 flex justify-end space-x-4">
                    <button 
                        onClick={onClose} 
                        className={secondaryButtonClass}>
                        Annuler
                    </button>
                    <button 
                        onClick={() => {
                            onConfirm();
                            onClose();
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
