import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
vi.mock('../supabaseClient', () => ({ supabase: { auth: { updateUser: vi.fn().mockResolvedValue({ error: null }) } } }));
const clearRecovery = vi.fn();
vi.mock('../contexts/AuthContext', () => ({ useAuth: () => ({ clearPasswordRecovery: clearRecovery, signOut: vi.fn() }) }));
import ResetPassword from '../components/Auth/ResetPassword';
import { supabase } from '../supabaseClient';
import { isNewPasswordValid } from '../services/authPolicy';

afterEach(() => { vi.clearAllMocks(); vi.useRealTimers(); });
describe('Réinitialisation — nouveau mot de passe', () => {
    it('refuse 11 caractères et accepte 12 sans retirer le parcours de récupération', async () => {
        vi.useFakeTimers(); render(<ResetPassword />);
        for (const password of ['12345678901', '123456789012']) {
            fireEvent.change(screen.getByLabelText('Nouveau mot de passe'), { target: { value: password } });
            fireEvent.change(screen.getByLabelText('Confirmer le mot de passe'), { target: { value: password } });
            await act(async () => { fireEvent.submit(document.querySelector('form')!); });
            if (password.length === 11) expect(supabase.auth.updateUser).not.toHaveBeenCalled();
        }
        expect(supabase.auth.updateUser).toHaveBeenCalledWith({ password: '123456789012' });
        act(() => vi.advanceTimersByTime(1200));
        expect(clearRecovery).toHaveBeenCalledOnce();
    });
    it('compte les caractères Unicode plutôt que les unités UTF-16', () => {
        expect(isNewPasswordValid('🌱'.repeat(6))).toBe(false);
        expect(isNewPasswordValid('🌱'.repeat(12))).toBe(true);
    });
});
