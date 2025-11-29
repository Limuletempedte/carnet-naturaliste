import React, { useState } from 'react';
import { supabase } from '../../supabaseClient';

const Login: React.FC = () => {
    const [loading, setLoading] = useState(false);
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [isSignUp, setIsSignUp] = useState(false);
    const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);

    const handleAuth = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setMessage(null);

        try {
            if (isSignUp) {
                const { error } = await supabase.auth.signUp({
                    email,
                    password,
                });
                if (error) throw error;
                setMessage({ type: 'success', text: 'Inscription réussie ! Vérifiez vos emails pour confirmer.' });
            } else {
                const { error } = await supabase.auth.signInWithPassword({
                    email,
                    password,
                });
                if (error) throw error;
            }
        } catch (error: any) {
            setMessage({ type: 'error', text: error.message || 'Une erreur est survenue.' });
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="flex flex-col items-center justify-center min-h-screen bg-gradient-to-br from-nature-beige to-white dark:from-nature-dark-bg dark:to-nature-dark-surface p-4">
            <div className="w-full max-w-md bg-white/80 dark:bg-nature-dark-surface/80 backdrop-blur-xl rounded-2xl shadow-ios p-8 border border-white/20">
                <h1 className="text-3xl font-bold text-center mb-2 text-nature-dark dark:text-white">Carnet Naturaliste</h1>
                <p className="text-center text-gray-500 dark:text-gray-400 mb-8">
                    {isSignUp ? 'Créez votre compte' : 'Connectez-vous pour accéder à vos observations'}
                </p>

                {message && (
                    <div className={`mb-4 p-3 rounded-lg text-sm ${message.type === 'success' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                        {message.text}
                    </div>
                )}

                <form onSubmit={handleAuth} className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Email</label>
                        <input
                            type="email"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            required
                            className="w-full px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 focus:ring-2 focus:ring-nature-green focus:border-transparent bg-white dark:bg-nature-dark-bg dark:text-white transition-all"
                            placeholder="votre@email.com"
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Mot de passe</label>
                        <input
                            type="password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            required
                            className="w-full px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 focus:ring-2 focus:ring-nature-green focus:border-transparent bg-white dark:bg-nature-dark-bg dark:text-white transition-all"
                            placeholder="••••••••"
                        />
                    </div>

                    <button
                        type="submit"
                        disabled={loading}
                        className="w-full py-3 px-4 bg-nature-green hover:bg-nature-dark text-white font-semibold rounded-lg shadow-lg transform active:scale-95 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        {loading ? 'Chargement...' : (isSignUp ? "S'inscrire" : 'Se connecter')}
                    </button>
                </form>

                <div className="mt-6 text-center">
                    <button
                        onClick={() => setIsSignUp(!isSignUp)}
                        className="text-sm text-nature-green hover:underline"
                    >
                        {isSignUp ? 'Déjà un compte ? Se connecter' : "Pas encore de compte ? S'inscrire"}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default Login;
