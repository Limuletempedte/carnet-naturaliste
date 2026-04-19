import { describe, it, expect, vi } from 'vitest';
import { render, act } from '@testing-library/react';
import { useStorageQuotaToasts } from '../hooks/useStorageQuotaToasts';

type PushToast = (type: 'info' | 'success' | 'warning' | 'error', message: string, durationMs?: number) => string;

function Harness({ pushToast }: { pushToast: PushToast }) {
    useStorageQuotaToasts(pushToast);
    return null;
}

describe('useStorageQuotaToasts', () => {
    it('affiche un toast warning sur storage-quota-exceeded', () => {
        const pushToast = vi.fn<PushToast>(() => 'id');
        render(<Harness pushToast={pushToast} />);

        act(() => { window.dispatchEvent(new CustomEvent('storage-quota-exceeded')); });

        expect(pushToast).toHaveBeenCalledWith('warning', expect.stringContaining('Espace de stockage'), expect.any(Number));
    });

    it('affiche un toast error persistant sur storage-corruption-detected (SR-09)', () => {
        const pushToast = vi.fn<PushToast>(() => 'id');
        render(<Harness pushToast={pushToast} />);

        act(() => {
            window.dispatchEvent(new CustomEvent('storage-corruption-detected', { detail: { scope: 'cache' } }));
        });

        expect(pushToast).toHaveBeenCalledWith('error', expect.stringContaining('corrompu'), 0);
    });

    it('affiche un toast warning sur supabase-recoverable-error (SR-08)', () => {
        const pushToast = vi.fn<PushToast>(() => 'id');
        render(<Harness pushToast={pushToast} />);

        act(() => {
            window.dispatchEvent(new CustomEvent('supabase-recoverable-error', { detail: { action: 'sauvegarde' } }));
        });

        expect(pushToast).toHaveBeenCalledWith('warning', expect.stringContaining('file d\'attente'), expect.any(Number));
    });

    it('affiche un toast warning sur schema-drift-detected (SR-13)', () => {
        const pushToast = vi.fn<PushToast>(() => 'id');
        render(<Harness pushToast={pushToast} />);

        act(() => {
            window.dispatchEvent(new CustomEvent('schema-drift-detected', { detail: { columns: ['weather_condition'] } }));
        });

        expect(pushToast).toHaveBeenCalledWith('warning', expect.stringContaining('Migration'), expect.any(Number));
    });

    it('affiche le nom du média sur media-stripped-offline', () => {
        const pushToast = vi.fn<PushToast>(() => 'id');
        render(<Harness pushToast={pushToast} />);

        act(() => {
            window.dispatchEvent(new CustomEvent('media-stripped-offline', { detail: { count: 3 } }));
        });

        expect(pushToast).toHaveBeenCalledWith('warning', expect.stringContaining('3 photo'), expect.any(Number));
    });
});
