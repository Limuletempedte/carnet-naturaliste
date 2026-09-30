import React, { useState, useEffect, useRef, useCallback, Suspense, lazy } from 'react';
import { supabase } from '../../supabaseClient';
import Turnstile from './Turnstile';
import { CAPTCHA_MAX_AGE_MS, MIN_PASSWORD_LENGTH, isNewPasswordValid } from '../../services/authPolicy';

// Chargement différé des pages légales (cohérent avec App.tsx) — évite que cet
// import statique n'annule le code-splitting lazy de LegalPages au niveau de l'app.
const PrivacyPolicy = lazy(() => import('../LegalPages').then(m => ({ default: m.PrivacyPolicy })));
const TermsOfService = lazy(() => import('../LegalPages').then(m => ({ default: m.TermsOfService })));
const MentionsLegales = lazy(() => import('../LegalPages').then(m => ({ default: m.MentionsLegales })));

const LegalFallback: React.FC = () => (
    <div className="p-8 text-center text-gray-500 dark:text-gray-400">Chargement…</div>
);

const mapSupabaseAuthError = (message: string): string => {
    const lower = message.toLowerCase();
    if (lower.includes('invalid login credentials')) return 'Email ou mot de passe incorrect.';
    if (lower.includes('email not confirmed')) return 'Veuillez confirmer votre email avant de vous connecter.';
    if (lower.includes('user already registered')) return 'Un compte existe déjà avec cet email.';
    if (lower.includes('password') && lower.includes('at least')) return `Le mot de passe doit contenir au moins ${MIN_PASSWORD_LENGTH} caractères.`;
    if (lower.includes('captcha')) return 'La vérification de sécurité a échoué. Veuillez la renouveler.';
    if (lower.includes('invalid email')) return 'Adresse email invalide.';
    if (lower.includes('rate limit') || lower.includes('too many')) return 'Trop de tentatives. Veuillez patienter quelques minutes.';
    return 'Une erreur est survenue. Veuillez réessayer.';
};

const Login: React.FC = () => {
    const [loading, setLoading] = useState(false);
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [isSignUp, setIsSignUp] = useState(false);
    const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);
    const [failedAttempts, setFailedAttempts] = useState(0);
    const [lockedUntil, setLockedUntil] = useState<number | null>(null);
    const [cooldownRemaining, setCooldownRemaining] = useState(0);
    const [acceptedTerms, setAcceptedTerms] = useState(false);
    const [legalView, setLegalView] = useState<'login' | 'privacy' | 'terms' | 'legal'>('login');
    const [forgotMode, setForgotMode] = useState(false);

    const [captchaAttempt, setCaptchaAttempt] = useState(0);
    const captchaScope = `${isSignUp}:${forgotMode}:${legalView}:${captchaAttempt}`;
    const captcha = useRef<{ token: string; scope: string; expiresAt: number } | null>(null);
    const [captchaReadyScope, setCaptchaReadyScope] = useState<string | null>(null);
    const onCaptchaToken = useCallback((token: string | null) => {
        captcha.current = token ? { token, scope: captchaScope, expiresAt: Date.now() + CAPTCHA_MAX_AGE_MS } : null;
        setCaptchaReadyScope(token ? captchaScope : null);
    }, [captchaScope]);
    const consumeCaptcha = (): string | null => {
        const current = captcha.current;
        captcha.current = null; // Usage unique, même en cas de double soumission synchrone.
        setCaptchaReadyScope(null);
        if (!current || current.scope !== captchaScope || current.expiresAt <= Date.now()) {
            setMessage({ type: 'error', text: 'Veuillez terminer la vérification de sécurité.' });
            return null;
        }
        return current.token;
    };
    const captchaWidget = <Turnstile key={captchaScope} onToken={onCaptchaToken} />;

    const handleForgotPassword = async (e: React.FormEvent) => {
        e.preventDefault();
        if (loading) return;
        const captchaToken = consumeCaptcha();
        if (!captchaToken) return;
        setLoading(true);
        setMessage(null);
        try {
            const { error } = await supabase.auth.resetPasswordForEmail(email, {
                redirectTo: window.location.origin,
                captchaToken,
            });
            if (error) throw error;
            // Message volontairement neutre : ne révèle pas si l'email existe.
            setMessage({ type: 'success', text: 'Si un compte existe pour cet email, un lien de réinitialisation vient d\'être envoyé.' });
        } catch (error: unknown) {
            const text = error instanceof Error ? error.message : String(error ?? '');
            setMessage({ type: 'error', text: mapSupabaseAuthError(text) });
        } finally {
            setLoading(false);
            setCaptchaAttempt(n => n + 1);
        }
    };

    useEffect(() => {
        if (!lockedUntil) return;
        const tick = () => {
            const remaining = Math.max(0, Math.ceil((lockedUntil - Date.now()) / 1000));
            setCooldownRemaining(remaining);
            if (remaining <= 0) {
                setLockedUntil(null);
                setCooldownRemaining(0);
            }
        };
        tick();
        const interval = setInterval(tick, 500);
        return () => clearInterval(interval);
    }, [lockedUntil]);

    const handleAuth = async (e: React.FormEvent) => {
        e.preventDefault();
        if (loading) return;
        if (lockedUntil && Date.now() < lockedUntil) return;
        if (isSignUp && !acceptedTerms) return;
        if (isSignUp && !isNewPasswordValid(password)) {
            setMessage({ type: 'error', text: `Le mot de passe doit contenir au moins ${MIN_PASSWORD_LENGTH} caractères.` });
            return;
        }
        const captchaToken = consumeCaptcha();
        if (!captchaToken) return;
        setLoading(true);
        setMessage(null);

        try {
            if (isSignUp) {
                const { error } = await supabase.auth.signUp({
                    email,
                    password,
                    options: {
                        emailRedirectTo: window.location.origin,
                        captchaToken,
                    },
                });
                if (error) throw error;
                setMessage({ type: 'success', text: 'Inscription réussie ! Vérifiez vos emails pour confirmer.' });
            } else {
                const { error } = await supabase.auth.signInWithPassword({
                    email,
                    password,
                    options: { captchaToken },
                });
                if (error) throw error;
                setFailedAttempts(0);
            }
        } catch (error: unknown) {
            if (!isSignUp) {
                const newAttempts = failedAttempts + 1;
                setFailedAttempts(newAttempts);
                if (newAttempts >= 3) {
                    const lockoutMs = Math.min(Math.pow(2, newAttempts - 3) * 5000, 120000);
                    setLockedUntil(Date.now() + lockoutMs);
                }
            }
            const message = error instanceof Error ? error.message : String(error ?? '');
            setMessage({ type: 'error', text: mapSupabaseAuthError(message) });
        } finally {
            setLoading(false);
            setCaptchaAttempt(n => n + 1);
        }
    };

    if (legalView === 'privacy') return <div className="min-h-screen bg-gradient-to-br from-nature-beige to-white dark:from-nature-dark-bg dark:to-nature-dark-surface"><Suspense fallback={<LegalFallback />}><PrivacyPolicy onBack={() => setLegalView('login')} /></Suspense></div>;
    if (legalView === 'terms') return <div className="min-h-screen bg-gradient-to-br from-nature-beige to-white dark:from-nature-dark-bg dark:to-nature-dark-surface"><Suspense fallback={<LegalFallback />}><TermsOfService onBack={() => setLegalView('login')} /></Suspense></div>;
    if (legalView === 'legal') return <div className="min-h-screen bg-gradient-to-br from-nature-beige to-white dark:from-nature-dark-bg dark:to-nature-dark-surface"><Suspense fallback={<LegalFallback />}><MentionsLegales onBack={() => setLegalView('login')} /></Suspense></div>;

    if (forgotMode) {
        return (
            <div className="flex flex-col items-center justify-center min-h-screen bg-gradient-to-br from-nature-beige to-white dark:from-nature-dark-bg dark:to-nature-dark-surface p-4">
                <div className="w-full max-w-md bg-white/80 dark:bg-nature-dark-surface/80 backdrop-blur-xl rounded-2xl shadow-ios p-8 border border-white/20">
                    <h1 className="text-2xl font-bold text-center mb-2 text-nature-dark dark:text-white">Mot de passe oublié</h1>
                    <p className="text-center text-gray-500 dark:text-gray-400 mb-6 text-sm">
                        Entrez votre email : nous vous enverrons un lien pour définir un nouveau mot de passe.
                    </p>

                    {message && (
                        <div role={message.type === 'error' ? 'alert' : 'status'} className={`mb-4 p-3 rounded-lg text-sm ${message.type === 'success' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                            {message.text}
                        </div>
                    )}

                    <form onSubmit={handleForgotPassword} className="space-y-4">
                        <div>
                            <label htmlFor="forgot-email" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Email</label>
                            <input
                                id="forgot-email"
                                type="email"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                required
                                autoComplete="email"
                                className="w-full px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 focus:ring-2 focus:ring-nature-green focus:border-transparent bg-white dark:bg-nature-dark-bg dark:text-white transition-all"
                                placeholder="votre@email.com"
                            />
                        </div>
                        {captchaWidget}
                        <button
                            type="submit"
                            disabled={loading || captchaReadyScope !== captchaScope}
                            className="w-full py-3 px-4 bg-nature-green hover:bg-nature-dark text-white font-semibold rounded-lg shadow-lg transform active:scale-95 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {loading ? 'Envoi…' : 'Envoyer le lien'}
                        </button>
                    </form>

                    <button
                        type="button" disabled={loading}
                        onClick={() => { setForgotMode(false); setMessage(null); }}
                        className="mt-4 w-full text-center text-sm text-gray-400 dark:text-gray-500 hover:text-nature-green transition-colors underline"
                    >
                        Retour à la connexion
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="flex flex-col items-center justify-center min-h-screen bg-gradient-to-br from-nature-beige to-white dark:from-nature-dark-bg dark:to-nature-dark-surface p-4">
            <div className="w-full max-w-md bg-white/80 dark:bg-nature-dark-surface/80 backdrop-blur-xl rounded-2xl shadow-ios p-8 border border-white/20">
                {/* EE-5 : logo de l'app au-dessus du titre */}
                <img src="/logo.svg" alt="" aria-hidden="true" className="w-16 h-16 mx-auto mb-3 rounded-2xl shadow-sm" />
                <h1 className="text-3xl font-bold text-center mb-2 text-nature-dark dark:text-white">Carnet Naturaliste</h1>
                <p className="text-center text-gray-500 dark:text-gray-400 mb-6">
                    {isSignUp ? 'Créez votre compte' : 'Connectez-vous pour accéder à vos observations'}
                </p>

                <div className="flex bg-gray-100 dark:bg-white/10 rounded-lg p-1 mb-6">
                    <button
                        type="button" disabled={loading}
                        onClick={() => { setIsSignUp(false); setMessage(null); setAcceptedTerms(false); }}
                        className={`flex-1 py-2 px-4 rounded-md text-sm font-medium transition-all ${!isSignUp ? 'bg-white dark:bg-nature-dark-bg shadow-sm text-nature-dark dark:text-white' : 'text-gray-500 dark:text-gray-400 hover:text-gray-700'}`}
                    >
                        Se connecter
                    </button>
                    <button
                        type="button" disabled={loading}
                        onClick={() => { setIsSignUp(true); setMessage(null); setAcceptedTerms(false); }}
                        className={`flex-1 py-2 px-4 rounded-md text-sm font-medium transition-all ${isSignUp ? 'bg-white dark:bg-nature-dark-bg shadow-sm text-nature-dark dark:text-white' : 'text-gray-500 dark:text-gray-400 hover:text-gray-700'}`}
                    >
                        S'inscrire
                    </button>
                </div>

                {message && (
                    <div role={message.type === 'error' ? 'alert' : 'status'} className={`mb-4 p-3 rounded-lg text-sm ${message.type === 'success' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                        {message.text}
                    </div>
                )}

                <form onSubmit={handleAuth} className="space-y-4">
                    <div>
                        <label htmlFor="login-email" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Email</label>
                        <input
                            id="login-email"
                            type="email"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            required
                            autoComplete="email"
                            className="w-full px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 focus:ring-2 focus:ring-nature-green focus:border-transparent bg-white dark:bg-nature-dark-bg dark:text-white transition-all"
                            placeholder="votre@email.com"
                        />
                    </div>
                    <div>
                        <label htmlFor="login-password" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Mot de passe</label>
                        <input
                            id="login-password"
                            type="password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            required
                            autoComplete={isSignUp ? 'new-password' : 'current-password'}
                            className="w-full px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 focus:ring-2 focus:ring-nature-green focus:border-transparent bg-white dark:bg-nature-dark-bg dark:text-white transition-all"
                            placeholder="••••••••"
                        />
                        {isSignUp ? (
                            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1.5 ml-1">Minimum {MIN_PASSWORD_LENGTH} caractères</p>
                        ) : (
                            <div className="text-right mt-1.5">
                                <button
                                    type="button" disabled={loading}
                                    onClick={() => { setForgotMode(true); setMessage(null); }}
                                    className="text-xs text-nature-green-text hover:underline font-medium"
                                >
                                    Mot de passe oublié ?
                                </button>
                            </div>
                        )}
                    </div>

                    {isSignUp && (
                        <label className="flex items-start gap-2 text-sm text-gray-700 dark:text-gray-300 cursor-pointer">
                            <input
                                type="checkbox"
                                checked={acceptedTerms}
                                onChange={(e) => setAcceptedTerms(e.target.checked)}
                                className="mt-0.5 rounded border-gray-300 text-nature-green focus:ring-nature-green"
                            />
                            <span>
                                J'accepte les{' '}
                                <button type="button" disabled={loading} onClick={() => setLegalView('terms')} className="text-nature-green-text hover:underline font-medium">CGU</button>
                                {' '}et la{' '}
                                <button type="button" disabled={loading} onClick={() => setLegalView('privacy')} className="text-nature-green-text hover:underline font-medium">Politique de confidentialité</button>
                            </span>
                        </label>
                    )}

                    {cooldownRemaining > 0 && (
                        <div role="alert" className="mb-2 p-3 rounded-lg text-sm bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300">
                            Trop de tentatives. Réessayez dans {cooldownRemaining}s.
                        </div>
                    )}

                    {captchaWidget}
                    <button
                        type="submit"
                        disabled={loading || captchaReadyScope !== captchaScope || cooldownRemaining > 0 || (isSignUp && !acceptedTerms)}
                        className="w-full py-3 px-4 bg-nature-green hover:bg-nature-dark text-white font-semibold rounded-lg shadow-lg transform active:scale-95 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        {loading ? 'Chargement...' : (isSignUp ? "S'inscrire" : 'Se connecter')}
                    </button>
                </form>

                <p className="mt-6 text-center text-xs text-gray-400 dark:text-gray-500">
                    {isSignUp ? 'Déjà un compte ? Utilisez l\'onglet "Se connecter"' : 'Pas de compte ? Utilisez l\'onglet "S\'inscrire"'}
                </p>

                <div className="mt-4 text-center text-xs text-gray-400 dark:text-gray-500 space-x-2">
                    <button type="button" disabled={loading} onClick={() => setLegalView('privacy')} className="hover:text-nature-green transition-colors underline">Confidentialite</button>
                    <span>|</span>
                    <button type="button" disabled={loading} onClick={() => setLegalView('terms')} className="hover:text-nature-green transition-colors underline">CGU</button>
                    <span>|</span>
                    <button type="button" disabled={loading} onClick={() => setLegalView('legal')} className="hover:text-nature-green transition-colors underline">Mentions legales</button>
                </div>
            </div>
        </div>
    );
};

export default Login;
