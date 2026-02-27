import React from 'react';

export type ToastType = 'success' | 'error' | 'info' | 'warning';

export interface ToastItem {
    id: string;
    type: ToastType;
    message: string;
}

interface ToastContainerProps {
    toasts: ToastItem[];
    onDismiss: (id: string) => void;
}

const toneClass: Record<ToastType, string> = {
    success: 'bg-emerald-100 border-emerald-300 text-emerald-800',
    error: 'bg-red-100 border-red-300 text-red-800',
    info: 'bg-blue-100 border-blue-300 text-blue-800',
    warning: 'bg-amber-100 border-amber-300 text-amber-900'
};

const ToastContainer: React.FC<ToastContainerProps> = ({ toasts, onDismiss }) => {
    if (toasts.length === 0) return null;

    return (
        <div className="fixed top-4 right-4 z-[100] w-[90vw] max-w-sm space-y-2">
            {toasts.map(toast => (
                <div
                    key={toast.id}
                    className={`border backdrop-blur-md rounded-xl shadow-md px-4 py-3 ${toneClass[toast.type]}`}
                >
                    <div className="flex items-start justify-between gap-3">
                        <p className="text-sm font-medium leading-snug">{toast.message}</p>
                        <button
                            type="button"
                            onClick={() => onDismiss(toast.id)}
                            className="text-current/80 hover:text-current text-xs font-bold"
                            aria-label="Fermer la notification"
                        >
                            ✕
                        </button>
                    </div>
                </div>
            ))}
        </div>
    );
};

export default ToastContainer;
