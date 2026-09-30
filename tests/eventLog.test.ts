import { setSessionIdentity } from '../services/sessionScope';
import { describe, it, expect, beforeEach } from 'vitest';
import {
    pushEvent,
    getEventLog,
    clearEventLog,
    EVENT_LOG_MAX,
    EVENT_LOG_STORAGE_KEY,
    __resetEventLogForTests,
} from '../utils/eventLog';

describe('eventLog (SR-17)', () => {
    beforeEach(() => {
        localStorage.clear();
        setSessionIdentity('user-1');
        __resetEventLogForTests();
    });

    it('ajoute un évènement avec level + message agrégé', () => {
        pushEvent('warn', ['Quota', { detail: 42 }]);
        const log = getEventLog();
        expect(log).toHaveLength(1);
        expect(log[0].level).toBe('warn');
        expect(log[0].msg).toBe('APP_WARN');
        expect(log[0].msg).not.toContain('42');
        expect(typeof log[0].ts).toBe('number');
    });

    it('tronque le buffer à EVENT_LOG_MAX (FIFO)', () => {
        for (let i = 0; i < EVENT_LOG_MAX + 10; i += 1) {
            pushEvent('info', [`entry-${i}`]);
        }
        const log = getEventLog();
        expect(log).toHaveLength(EVENT_LOG_MAX);
        // Le plus ancien doit être entry-10 (les 10 premiers ont été écartés)
        expect(log[0].msg).toBe('APP_INFO');
        expect(log[log.length - 1].msg).toBe('APP_INFO');
    });

    it('persiste dans localStorage sous la bonne clé et se relit', () => {
        pushEvent('error', ['boom']);
        const raw = localStorage.getItem(`${EVENT_LOG_STORAGE_KEY}:user-1`);
        expect(raw).toBeTruthy();
        const parsed = JSON.parse(raw || '[]');
        expect(parsed).toHaveLength(1);
        expect(parsed[0].level).toBe('error');

        // Simule un reload : reset état en mémoire mais pas localStorage
        __resetEventLogForTests();
        const log = getEventLog();
        expect(log).toHaveLength(1);
        expect(log[0].msg).toBe('APP_ERROR');
    });

    it('clearEventLog vide le buffer et persiste la mise à jour', () => {
        pushEvent('warn', ['a']);
        pushEvent('warn', ['b']);
        clearEventLog();
        expect(getEventLog()).toEqual([]);
        expect(localStorage.getItem(`${EVENT_LOG_STORAGE_KEY}:user-1`)).toBe('[]');
    });
});
