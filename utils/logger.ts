/**
 * Service de logging centralise.
 *
 * - En dev (`import.meta.env.DEV`) : tous les niveaux (debug/info/warn/error)
 *   passent dans la console sous-jacente.
 * - En prod : seuls `warn` et `error` sont emis. `debug` et `info` sont no-op
 *   afin d'eviter de polluer la console utilisateur ou d'exposer des details
 *   d'implementation.
 *
 * Point d'extension : `logger.error` remonte aussi a Sentry via
 * `services/errorReportingService` (no-op si `VITE_SENTRY_DSN` est absente).
 * Pour changer de reporteur externe, modifier `logger.error` uniquement.
 */

import { pushEvent, safeLogMessage } from './eventLog';
import { reportError } from '../services/errorReportingService';

type Level = 'debug' | 'info' | 'warn' | 'error';

const LEVELS: Record<Level, number> = {
    debug: 0,
    info: 1,
    warn: 2,
    error: 3,
};

const MIN_LEVEL: Level = import.meta.env?.DEV ? 'debug' : 'warn';

const shouldLog = (level: Level): boolean => LEVELS[level] >= LEVELS[MIN_LEVEL];

export const logger = {
    debug: (...args: unknown[]): void => {
        if (shouldLog('debug')) {
             
            console.debug(safeLogMessage('info', args));
        }
    },
    info: (...args: unknown[]): void => {
        if (shouldLog('info')) {
             
            console.info(safeLogMessage('info', args));
        }
    },
    warn: (...args: unknown[]): void => {
        pushEvent('warn', args);
        if (shouldLog('warn')) {
             
            console.warn(safeLogMessage('warn', args));
        }
    },
    error: (...args: unknown[]): void => {
        pushEvent('error', args);
        reportError([safeLogMessage('error', args)]);
        if (shouldLog('error')) {

            console.error(safeLogMessage('error', args));
        }
    },
};
