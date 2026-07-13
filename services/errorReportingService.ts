/**
 * Suivi des erreurs en production (Sentry).
 *
 * - Active uniquement si `VITE_SENTRY_DSN` est definie : sans DSN, toutes les
 *   fonctions sont des no-op et le SDK n'est jamais initialise.
 * - Erreurs uniquement : pas de tracing performance, pas de replay de session.
 *   Collecte minimale via `dataCollection` (pas de cookies, d'en-tetes, de
 *   corps de requetes ni de query params) ; aucune donnee d'observation.
 * - Les echecs de chargement de chunk apres un redeploiement (voir
 *   `utils/chunkLoadError.ts`) sont filtres : c'est du bruit transitoire deja
 *   gere cote UI par un toast.
 */

import * as Sentry from '@sentry/react';
import { isChunkLoadError } from '../utils/chunkLoadError';

const dsn: string | undefined = import.meta.env.VITE_SENTRY_DSN;

let initialized = false;

export const isErrorReportingEnabled = (): boolean => initialized;

export const initErrorReporting = (): void => {
    if (initialized || !dsn) return;

    Sentry.init({
        dsn,
        environment: import.meta.env.MODE,
        // Collecte minimale : rien d'autre que l'erreur elle-meme.
        dataCollection: {
            userInfo: false,
            cookies: false,
            httpHeaders: { request: false, response: false },
            httpBodies: [],
            queryParams: false,
        },
        tracesSampleRate: 0,
        // Retire le suivi de session (ping a chaque demarrage) : on ne veut
        // envoyer un evenement que lorsqu'une erreur survient reellement.
        integrations: (defaults) => defaults.filter((i) => i.name !== 'BrowserSession'),
        beforeSend(event, hint) {
            const original = hint?.originalException;
            if (original instanceof Error && isChunkLoadError(original)) {
                return null;
            }
            return event;
        },
    });

    initialized = true;
};

/**
 * Remonte une erreur a Sentry. Concu pour etre appele par `logger.error`
 * avec ses arguments bruts : la premiere instance d'Error est capturee comme
 * exception, les chaines servent de contexte.
 */
export const reportError = (args: unknown[]): void => {
    if (!initialized) return;

    const error = args.find((arg): arg is Error => arg instanceof Error);
    const message = args
        .filter((arg): arg is string => typeof arg === 'string')
        .join(' ');

    if (error) {
        if (isChunkLoadError(error)) return;
        Sentry.captureException(error, {
            extra: message ? { loggerMessage: message } : undefined,
        });
    } else if (message) {
        Sentry.captureMessage(message, 'error');
    }
};
