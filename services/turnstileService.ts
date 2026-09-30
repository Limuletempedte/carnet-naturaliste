export interface TurnstileOptions {
    sitekey: string;
    language: string;
    size: 'flexible';
    retry: 'never';
    'refresh-expired': 'manual';
    'refresh-timeout': 'manual';
    'response-field': false;
    callback: (token: string) => void;
    'expired-callback': () => void;
    'timeout-callback': () => void;
    'error-callback': () => void;
}

export interface TurnstileAPI {
    render: (container: HTMLElement, options: TurnstileOptions) => string;
    remove: (widgetId: string) => void;
}

declare global {
    interface Window { turnstile?: TurnstileAPI }
}

let pending: Promise<TurnstileAPI> | undefined;

/** Chargement unique, borné et réessayable après un échec explicite. */
export function loadTurnstile(): Promise<TurnstileAPI> {
    if (window.turnstile) return Promise.resolve(window.turnstile);
    if (pending) return pending;
    pending = new Promise<TurnstileAPI>((resolve, reject) => {
        const script = document.createElement('script');
        script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
        script.async = true;
        let finished = false;
        const finish = (api?: TurnstileAPI) => {
            if (finished) return;
            finished = true;
            window.clearTimeout(timer);
            script.onload = null;
            script.onerror = null;
            if (api) resolve(api);
            else {
                script.remove();
                pending = undefined;
                reject(new Error('Vérification de sécurité indisponible.'));
            }
        };
        const timer = window.setTimeout(() => finish(), 15000);
        script.onload = () => finish(window.turnstile);
        script.onerror = () => finish();
        document.head.append(script);
    });
    return pending;
}
