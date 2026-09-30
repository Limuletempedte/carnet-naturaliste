/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

interface ImportMetaEnv {
    /** Clé publique du widget Turnstile ; jamais la clé secrète. */
    readonly VITE_TURNSTILE_SITE_KEY?: string;
    readonly VITE_SUPABASE_URL?: string;
    readonly VITE_SUPABASE_ANON_KEY?: string;
    /** DSN Sentry — optionnelle : sans elle, le suivi d'erreurs est inactif. */
    readonly VITE_SENTRY_DSN?: string;
}

interface ImportMeta {
    readonly env: ImportMetaEnv;
}
