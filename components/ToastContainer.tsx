import React from 'react';
import { useLiquidGlassRefraction } from './LiquidGlass';
import { CheckCircleIcon, XCircleIcon, InfoIcon, WarningIcon, XMarkIcon } from './icons';

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

// EE-4 : tons translucides (verre) + variantes sombres (absentes jusqu'ici).
const toneClass: Record<ToastType, string> = {
    success: 'bg-emerald-100/70 border-emerald-300/60 text-emerald-900 dark:bg-emerald-900/50 dark:border-emerald-700/50 dark:text-emerald-100',
    error: 'bg-red-100/70 border-red-300/60 text-red-900 dark:bg-red-900/50 dark:border-red-700/50 dark:text-red-100',
    info: 'bg-blue-100/70 border-blue-300/60 text-blue-900 dark:bg-blue-900/50 dark:border-blue-700/50 dark:text-blue-100',
    warning: 'bg-amber-100/70 border-amber-300/60 text-amber-900 dark:bg-amber-900/50 dark:border-amber-700/50 dark:text-amber-100'
};

// 8b : icône de ton devant le message — remplace les emojis ⏳/⚠️ qui
// préfixaient les chaînes (le ton reste lisible sans dépendre de la couleur).
const toneIcon: Record<ToastType, React.ReactNode> = {
    success: <CheckCircleIcon className="w-5 h-5 shrink-0" />,
    error: <XCircleIcon className="w-5 h-5 shrink-0" />,
    info: <InfoIcon className="w-5 h-5 shrink-0" />,
    warning: <WarningIcon className="w-5 h-5 shrink-0" />
};

// Carte de notification individuelle — composant dédié pour que chaque toast
// ait sa propre réfraction Liquid Glass (un hook par élément).
const ToastCard: React.FC<{ toast: ToastItem; onDismiss: (id: string) => void }> = ({ toast, onDismiss }) => {
    const glassRef = useLiquidGlassRefraction<HTMLDivElement>({ scale: 40, bezelWidth: 12, blur: 4, saturate: 1.6 });
    return (
        <div
            ref={glassRef}
            role="alert"
            className={`border backdrop-blur-xl rounded-xl shadow-md px-4 py-3 animate-toastIn ${toneClass[toast.type]}`}
        >
            <div className="flex items-start justify-between gap-3">
                <span aria-hidden="true" className="mt-0.5">{toneIcon[toast.type]}</span>
                <p className="text-sm font-medium leading-snug break-words flex-1">{toast.message}</p>
                <button
                    type="button"
                    onClick={() => onDismiss(toast.id)}
                    className="text-current/80 hover:text-current"
                    aria-label="Fermer la notification"
                >
                    <XMarkIcon className="w-4 h-4" />
                </button>
            </div>
        </div>
    );
};

const ToastContainer: React.FC<ToastContainerProps> = ({ toasts, onDismiss }) => {
    if (toasts.length === 0) return null;

    return (
        <div className="fixed top-[max(1rem,env(safe-area-inset-top))] right-4 z-[100] w-[90vw] max-w-sm space-y-2" aria-live="polite" aria-relevant="additions">
            {toasts.map(toast => (
                <ToastCard key={toast.id} toast={toast} onDismiss={onDismiss} />
            ))}
        </div>
    );
};

export default ToastContainer;
