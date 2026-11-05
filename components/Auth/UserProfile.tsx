import React, { useState, useRef, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { getOfflineQueueSnapshot } from '../../services/storageService';
import { useLiquidGlassRefraction } from '../LiquidGlass';

interface UserProfileProps {
    onExportData?: () => void;
    onDeleteAccount?: () => void;
    /** Ouvre la fenêtre de l'assistant d'identification (accès, consentement). */
    onOpenAiAssistant?: () => void;
    /** Affiche l'item « Installer l'application » (mobile : prompt natif ou consigne iOS). */
    canInstallApp?: boolean;
    onInstall?: () => void;
}

const UserProfile: React.FC<UserProfileProps> = ({ onExportData, onDeleteAccount, onOpenAiAssistant, canInstallApp, onInstall }) => {
    const { user, signOut } = useAuth();
    const [isOpen, setIsOpen] = useState(false);
    const dropdownRef = useRef<HTMLDivElement>(null);
    // EE-4 : réfraction Liquid Glass sur le menu déroulant (Chromium uniquement).
    const menuGlassRef = useLiquidGlassRefraction<HTMLDivElement>();

    // Audit v2 (H7) : signOut purge la file offline scopée. Avertir avant toute
    // perte définitive d'observations saisies hors-ligne et non synchronisées.
    const handleSignOut = async () => {
        setIsOpen(false);
        let pendingCount = 0;
        try {
            pendingCount = getOfflineQueueSnapshot().length;
        } catch {
            pendingCount = 0;
        }
        if (pendingCount > 0) {
            const confirmed = window.confirm(
                `Vous avez ${pendingCount} observation(s) non synchronisée(s) qui seront ` +
                `définitivement perdues à la déconnexion.\n\n` +
                `Pour les conserver : annulez, reconnectez-vous à Internet, puis lancez la ` +
                `synchronisation depuis le centre de synchronisation avant de vous déconnecter.\n\n` +
                `Se déconnecter quand même ?`
            );
            if (!confirmed) return;
        }
        await signOut();
    };

    // Close dropdown when clicking outside or pressing Escape
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        };
        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape' && isOpen) {
                setIsOpen(false);
            }
        };

        document.addEventListener('mousedown', handleClickOutside);
        document.addEventListener('keydown', handleKeyDown);
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
            document.removeEventListener('keydown', handleKeyDown);
        };
    }, [isOpen]);

    if (!user) return null;

    const email = user.email || 'Utilisateur';
    const initial = email.charAt(0).toUpperCase();

    return (
        <div className="relative z-50" ref={dropdownRef}>
            <button
                onClick={() => setIsOpen(!isOpen)}
                aria-expanded={isOpen}
                aria-haspopup="menu"
                aria-label="Menu utilisateur"
                className="flex items-center gap-2 p-1.5 pr-4 rounded-full liquid-glass-clear liquid-glass-sheen hover:shadow-ios-hover active:scale-95 transition-all duration-300 group"
            >
                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-nature-green to-emerald-600 flex items-center justify-center text-white font-bold shadow-sm">
                    {initial}
                </div>
                <span className="text-sm font-medium text-nature-dark dark:text-white hidden md:block max-w-[150px] truncate">
                    {email.split('@')[0]}
                </span>
                <svg
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 20 20"
                    fill="currentColor"
                    className={`w-5 h-5 text-gray-400 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}
                >
                    <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clipRule="evenodd" />
                </svg>
            </button>

            {isOpen && (
                <div ref={menuGlassRef} role="menu" aria-label="Options du compte" className="absolute left-0 mt-2 w-64 liquid-glass liquid-glass-sheen rounded-2xl overflow-hidden animate-scaleIn origin-top-left">
                    <div className="p-4 border-b border-gray-100 dark:border-gray-700">
                        <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1">Connecté en tant que</p>
                        <p className="text-sm font-bold text-nature-dark dark:text-white truncate" title={email}>{email}</p>
                    </div>

                    <div className="p-2">
                        {onExportData && (
                            <button
                                role="menuitem"
                                onClick={() => { setIsOpen(false); onExportData(); }}
                                className="w-full flex items-center gap-3 px-3 py-2.5 text-sm font-medium text-nature-dark dark:text-white hover:bg-gray-100 dark:hover:bg-white/10 rounded-xl transition-colors"
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
                                </svg>
                                Exporter mes données
                            </button>
                        )}

                        {onOpenAiAssistant && (
                            <button
                                role="menuitem"
                                onClick={() => { setIsOpen(false); onOpenAiAssistant(); }}
                                className="w-full flex items-center gap-3 px-3 py-2.5 text-sm font-medium text-nature-dark dark:text-white hover:bg-gray-100 dark:hover:bg-white/10 rounded-xl transition-colors"
                            >
                                <svg aria-hidden="true" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09Z" />
                                </svg>
                                Aide à l'identification (IA)
                            </button>
                        )}

                        {canInstallApp && onInstall && (
                            <button
                                role="menuitem"
                                onClick={() => { setIsOpen(false); onInstall(); }}
                                className="w-full flex items-center gap-3 px-3 py-2.5 text-sm font-medium text-nature-dark dark:text-white hover:bg-gray-100 dark:hover:bg-white/10 rounded-xl transition-colors"
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 7.5h-.75A2.25 2.25 0 004.5 9.75v7.5a2.25 2.25 0 002.25 2.25h7.5a2.25 2.25 0 002.25-2.25v-7.5a2.25 2.25 0 00-2.25-2.25h-.75m-6 3 3 3m0 0 3-3m-3 3V3" />
                                </svg>
                                Installer l'application
                            </button>
                        )}

                        <button
                            role="menuitem"
                            onClick={handleSignOut}
                            className="w-full flex items-center gap-3 px-3 py-2.5 text-sm font-medium text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-xl transition-colors"
                        >
                            <svg aria-hidden="true" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15m3 0l3-3m0 0l-3-3m3 3H9" />
                            </svg>
                            Se déconnecter
                        </button>

                        {onDeleteAccount && (
                            <>
                                <div className="my-1 border-t border-gray-100 dark:border-gray-700" />
                                <button
                                    role="menuitem"
                                    onClick={() => { setIsOpen(false); onDeleteAccount(); }}
                                    className="w-full flex items-center gap-3 px-3 py-2.5 text-sm font-medium text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-xl transition-colors"
                                >
                                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                                    </svg>
                                    Supprimer mon compte
                                </button>
                            </>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};

export default UserProfile;
