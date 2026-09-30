import { useEffect, useRef, useState } from 'react';
import { CAPTCHA_MAX_AGE_MS, TURNSTILE_SITE_KEY } from '../../services/authPolicy';
import { loadTurnstile, type TurnstileAPI } from '../../services/turnstileService';

interface Props {
    onToken: (token: string | null) => void;
}

export default function Turnstile({ onToken }: Props) {
    const container = useRef<HTMLDivElement>(null);
    const [attempt, setAttempt] = useState(0);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        let alive = true;
        let terminal = false;
        let api: TurnstileAPI | undefined;
        let widgetId: string | undefined;
        let expiry: number | undefined;
        onToken(null);
        const invalidate = () => {
            if (!alive) return;
            terminal = true;
            window.clearTimeout(expiry);
            onToken(null);
            setError('Vérification expirée ou indisponible. Veuillez réessayer.');
        };
        void loadTurnstile().then(loaded => {
            if (!alive || !container.current) return;
            api = loaded;
            widgetId = api.render(container.current, {
                sitekey: TURNSTILE_SITE_KEY, language: 'fr', size: 'flexible',
                retry: 'never', 'refresh-expired': 'manual', 'refresh-timeout': 'manual',
                'response-field': false,
                callback: token => {
                    if (!alive || terminal || !token) return;
                    window.clearTimeout(expiry);
                    onToken(token);
                    expiry = window.setTimeout(invalidate, CAPTCHA_MAX_AGE_MS);
                },
                'expired-callback': invalidate,
                'timeout-callback': invalidate,
                'error-callback': invalidate,
            });
        }).catch(invalidate);
        return () => {
            alive = false;
            window.clearTimeout(expiry);
            if (api && widgetId !== undefined) api.remove(widgetId);
            onToken(null);
        };
    }, [attempt, onToken]);

    return <div className="space-y-2">
        <div ref={container} aria-label="Vérification de sécurité" />
        {error && <div role="alert" className="text-sm text-red-700 dark:text-red-300">
            <p>{error}</p>
            <button type="button" className="underline" onClick={() => { setError(null); setAttempt(n => n + 1); }}>
                Réessayer la vérification
            </button>
        </div>}
        <p className="text-xs text-gray-500 dark:text-gray-400">
            Protection contre les robots par Cloudflare Turnstile.{' '}
            <a href="https://www.cloudflare.com/turnstile-privacy-policy/" target="_blank" rel="noopener noreferrer" className="underline">Confidentialité</a>
        </p>
    </div>;
}
