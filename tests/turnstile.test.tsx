import { StrictMode } from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { TurnstileAPI, TurnstileOptions } from '../services/turnstileService';

vi.mock('../services/turnstileService', () => ({ loadTurnstile: vi.fn() }));
import { loadTurnstile } from '../services/turnstileService';
import Turnstile from '../components/Auth/Turnstile';

let options: TurnstileOptions;
const api: TurnstileAPI = { render: vi.fn((_el, opts) => { options = opts; return 'widget'; }), remove: vi.fn() };
beforeEach(() => { vi.clearAllMocks(); vi.mocked(loadTurnstile).mockResolvedValue(api); });
afterEach(() => { cleanup(); vi.useRealTimers(); });

describe('Turnstile — cycle de vie', () => {
    it('invalide les jetons expirés et ignore un succès tardif jusqu’à la nouvelle tentative', async () => {
        const onToken = vi.fn();
        render(<Turnstile onToken={onToken} />);
        await act(async () => {});
        act(() => options.callback('valid-first'));
        expect(onToken).toHaveBeenLastCalledWith('valid-first');
        const previous = options;
        act(() => options['expired-callback']());
        act(() => previous.callback('stale'));
        expect(onToken).toHaveBeenLastCalledWith(null);
        fireEvent.click(screen.getByText('Réessayer la vérification'));
        await act(async () => {});
        act(() => previous.callback('stale-again'));
        expect(onToken).toHaveBeenLastCalledWith(null);
        act(() => options.callback('valid-new'));
        expect(onToken).toHaveBeenLastCalledWith('valid-new');
    });
    it.each(['error-callback', 'timeout-callback'] as const)('bloque après %s', async callback => {
        const onToken = vi.fn(); render(<Turnstile onToken={onToken} />);
        await act(async () => {});
        act(() => options.callback('valid'));
        act(() => options[callback]());
        expect(onToken).toHaveBeenLastCalledWith(null);
        expect(screen.getByRole('alert')).toBeDefined();
    });
    it('gère StrictMode et nettoie le widget, ses callbacks et son délai au démontage', async () => {
        vi.useFakeTimers();
        const onToken = vi.fn();
        const view = render(<StrictMode><Turnstile onToken={onToken} /></StrictMode>);
        await act(async () => {});
        expect(api.render).toHaveBeenCalledTimes(1);
        act(() => options.callback('valid'));
        view.unmount();
        expect(api.remove).toHaveBeenCalledWith('widget');
        expect(vi.getTimerCount()).toBe(0);
        act(() => options.callback('late'));
        expect(onToken).toHaveBeenLastCalledWith(null);
    });
    it('expire localement au bout de cinq minutes', async () => {
        vi.useFakeTimers(); const onToken = vi.fn(); render(<Turnstile onToken={onToken} />);
        await act(async () => {});
        act(() => options.callback('valid'));
        act(() => vi.advanceTimersByTime(300000));
        expect(onToken).toHaveBeenLastCalledWith(null);
    });
    it('rend le chargement réessayable sans accepter de jeton en cas d’échec réseau', async () => {
        vi.mocked(loadTurnstile).mockRejectedValueOnce(new Error('network'));
        const onToken = vi.fn(); render(<Turnstile onToken={onToken} />);
        await act(async () => {});
        expect(onToken).toHaveBeenLastCalledWith(null);
        fireEvent.click(screen.getByText('Réessayer la vérification'));
        await act(async () => {});
        act(() => options.callback('valid'));
        expect(onToken).toHaveBeenLastCalledWith('valid');
    });
});
