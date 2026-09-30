/** Les comptes existants gardent leur mot de passe lors de la connexion. */
export const MIN_PASSWORD_LENGTH = 12;
export const CAPTCHA_MAX_AGE_MS = 5 * 60 * 1000;

// Clé publique du widget, limitée au domaine de production. Aucun secret ici.
export const TURNSTILE_SITE_KEY = import.meta.env.VITE_TURNSTILE_SITE_KEY
    ?? '0x4AAAAAAFJLBbQwPJsfDm3M';

export const isNewPasswordValid = (password: string): boolean =>
    Array.from(password).length >= MIN_PASSWORD_LENGTH;
