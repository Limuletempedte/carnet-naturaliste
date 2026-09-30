import React, { useState } from 'react';
import { supabase } from '../../supabaseClient';
import { useAuth } from '../../contexts/AuthContext';

import { MIN_PASSWORD_LENGTH, isNewPasswordValid } from '../../services/authPolicy';

/**
 * Écran de définition d'un nouveau mot de passe (audit v2, H13).
 * Affiché par App.tsx quand l'événement Supabase PASSWORD_RECOVERY a été reçu
 * (l'utilisateur a cliqué sur le lien « mot de passe oublié » de son email) :
 * une session temporaire existe alors, et `updateUser` met à jour le mot de passe.
 */
const ResetPassword: React.FC = () => {
    const { clearPasswordRecovery, signOut } = useAuth();
    const [password, setPassword] = useState('');
    const [confirm, setConfirm] = useState('');
    const [loading, setLoading] = useState(false);
    const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (loading) return;
        if (!isNewPasswordValid(password)) {
            setMessage({ type: 'error', text: `Le mot de passe doit contenir au moins ${MIN_PASSWORD_LENGTH} caractères.` });
            return;
        }
        if (password !== confirm) {
            setMessage({ type: 'error', text: 'Les deux mots de passe ne correspondent pas.' });
            return;
        }
        setLoading(true);
        setMessage(null);
        try {
            const { error } = await supabase.auth.updateUser({ password });
            if (error) throw error;
            setMessage({ type: 'success', text: 'Mot de passe mis à jour. Redirection…' });
            // Laisse le message visible un court instant avant de basculer vers l'app.
            setTimeout(() => clearPasswordRecovery(), 1200);
        } catch (error: unknown) {
            const text = error instanceof Error ? error.message : 'Une erreur est survenue. Veuillez réessayer.';
            setMessage({ type: 'error', text });
        } finally {
            setLoading(false);
        }
    };

    const handleCancel = async () => {
        clearPasswordRecovery();
        await signOut();
    };

    return (
        <div className="flex flex-col items-center justify-center min-h-screen bg-gradient-to-br from-nature-beige to-white dark:from-nature-dark-bg dark:to-nature-dark-surface p-4">
            <div className="w-full max-w-md bg-white/80 dark:bg-nature-dark-surface/80 backdrop-blur-xl rounded-2xl shadow-ios p-8 border border-white/20">
                <h1 className="text-2xl font-bold text-center mb-2 text-nature-dark dark:text-white">Nouveau mot de passe</h1>
                <p className="text-center text-gray-500 dark:text-gray-400 mb-6 text-sm">
                    Choisissez un nouveau mot de passe pour votre compte.
                </p>

                {message && (
                    <div role={message.type === 'error' ? 'alert' : 'status'} className={`mb-4 p-3 rounded-lg text-sm ${message.type === 'success' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                        {message.text}
                    </div>
                )}

                <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                        <label htmlFor="reset-password" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Nouveau mot de passe</label>
                        <input
                            id="reset-password"
                            type="password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            required
                            autoComplete="new-password"
                            className="w-full px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 focus:ring-2 focus:ring-nature-green focus:border-transparent bg-white dark:bg-nature-dark-bg dark:text-white transition-all"
                            placeholder="••••••••"
                        />
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1.5 ml-1">Minimum {MIN_PASSWORD_LENGTH} caractères</p>
                    </div>
                    <div>
                        <label htmlFor="reset-password-confirm" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Confirmer le mot de passe</label>
                        <input
                            id="reset-password-confirm"
                            type="password"
                            value={confirm}
                            onChange={(e) => setConfirm(e.target.value)}
                            required
                            autoComplete="new-password"
                            className="w-full px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 focus:ring-2 focus:ring-nature-green focus:border-transparent bg-white dark:bg-nature-dark-bg dark:text-white transition-all"
                            placeholder="••••••••"
                        />
                    </div>
                    <button
                        type="submit"
                        disabled={loading}
                        className="w-full py-3 px-4 bg-nature-green hover:bg-nature-dark text-white font-semibold rounded-lg shadow-lg transform active:scale-95 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        {loading ? 'Mise à jour…' : 'Mettre à jour le mot de passe'}
                    </button>
                </form>

                <button
                    type="button"
                    onClick={handleCancel}
                    className="mt-4 w-full text-center text-sm text-gray-400 dark:text-gray-500 hover:text-nature-green transition-colors underline"
                >
                    Annuler et revenir à la connexion
                </button>
            </div>
        </div>
    );
};

export default ResetPassword;
