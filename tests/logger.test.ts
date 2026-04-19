import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { logger } from '../utils/logger';

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
        expect(warnSpy).toHaveBeenCalledWith('hello', { id: 1 });
    });

    it('delegates error() to console.error', () => {
        const err = new Error('boom');
        logger.error('failed', err);
        expect(errorSpy).toHaveBeenCalledWith('failed', err);
    });

    it('debug() et info() s appellent en mode dev (DEV=true dans Vitest)', () => {
        // Vitest execute les tests en mode dev par defaut (import.meta.env.DEV = true)
        logger.debug('trace');
        logger.info('note');
        expect(debugSpy).toHaveBeenCalledWith('trace');
        expect(infoSpy).toHaveBeenCalledWith('note');
    });

    it('accepte plusieurs arguments variadiques', () => {
        logger.warn('a', 'b', 'c');
        expect(warnSpy).toHaveBeenCalledWith('a', 'b', 'c');
    });
});
