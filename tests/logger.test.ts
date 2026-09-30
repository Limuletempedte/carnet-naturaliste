import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { logger } from '../utils/logger';
import { reportError } from '../services/errorReportingService';

vi.mock('../services/errorReportingService', () => ({
    reportError: vi.fn(),
}));

describe('logger', () => {
    let debugSpy: ReturnType<typeof vi.spyOn>;
    let infoSpy: ReturnType<typeof vi.spyOn>;
    let warnSpy: ReturnType<typeof vi.spyOn>;
    let errorSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
        debugSpy = vi.spyOn(console, 'debug').mockImplementation(() => {});
        infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {});
        warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
        errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    });

    afterEach(() => {
        debugSpy.mockRestore();
        infoSpy.mockRestore();
        warnSpy.mockRestore();
        errorSpy.mockRestore();
    });

    it('delegates warn() to console.warn', () => {
        logger.warn('hello', { id: 1 });
        expect(warnSpy).toHaveBeenCalledWith('APP_WARN');
    });

    it('delegates error() to console.error', () => {
        const err = new Error('boom');
        logger.error('failed', err);
        expect(errorSpy).toHaveBeenCalledWith('APP_ERROR');
    });

    it('error() remonte uniquement un code sans données privées au reporteur externe (Sentry)', () => {
        const err = new Error('boom');
        logger.error('failed', err);
        expect(vi.mocked(reportError)).toHaveBeenCalledWith(['APP_ERROR']);
    });

    it('debug() et info() s appellent en mode dev (DEV=true dans Vitest)', () => {
        // Vitest execute les tests en mode dev par defaut (import.meta.env.DEV = true)
        logger.debug('trace');
        logger.info('note');
        expect(debugSpy).toHaveBeenCalledWith('APP_INFO');
        expect(infoSpy).toHaveBeenCalledWith('APP_INFO');
    });

    it('accepte plusieurs arguments variadiques', () => {
        logger.warn('a', 'b', 'c');
        expect(warnSpy).toHaveBeenCalledWith('APP_WARN');
    });
});
