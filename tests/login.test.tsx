import type { User, Session } from '@supabase/supabase-js';
import { render, screen, fireEvent } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../supabaseClient', () => ({
    supabase: {
        auth: {
            signUp: vi.fn(),
            signInWithPassword: vi.fn(),
            resetPasswordForEmail: vi.fn().mockResolvedValue({ error: null }),
        },
    },
}));

vi.mock('../components/LegalPages', () => ({
    PrivacyPolicy: ({ onBack }: { onBack: () => void }) => <div data-testid="privacy"><button onClick={onBack}>Retour</button></div>,
    TermsOfService: ({ onBack }: { onBack: () => void }) => <div data-testid="terms"><button onClick={onBack}>Retour</button></div>,
    MentionsLegales: ({ onBack }: { onBack: () => void }) => <div data-testid="legal"><button onClick={onBack}>Retour</button></div>,
}));

vi.mock('../components/Auth/Turnstile', () => ({
    default: ({ onToken }: { onToken: (token: string | null) => void }) => <div>
        <button type="button" onClick={() => onToken('valid-test')}>Valider CAPTCHA</button>
        <button type="button" onClick={() => onToken(null)}>Expirer CAPTCHA</button>
    </div>,
}));

import Login from '../components/Auth/Login';
import { supabase } from '../supabaseClient';

beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(supabase.auth.signInWithPassword).mockResolvedValue({ data: { user: { id: 'test' } as User, session: {} as Session }, error: null });
    vi.mocked(supabase.auth.signUp).mockResolvedValue({ data: { user: null, session: null }, error: null });
});
const verifyCaptcha = () => fireEvent.click(screen.getByText('Valider CAPTCHA'));
const getSubmitButton = () => document.querySelector('button[type="submit"]') as HTMLButtonElement;

describe('Login — consent checkbox (VP-04)', () => {
    it('shows no checkbox in login mode', () => {
        render(<Login />);
        expect(screen.queryByRole('checkbox')).toBeNull();
    });

    it('shows checkbox in signup mode', () => {
        render(<Login />);
        fireEvent.click(screen.getByText("S'inscrire"));
        expect(screen.getByRole('checkbox')).toBeDefined();
    });

    it('submit button is disabled when checkbox is unchecked in signup mode', () => {
        render(<Login />);
        fireEvent.click(screen.getByText("S'inscrire"));
        expect(getSubmitButton().disabled).toBe(true);
    });

    it('submit button is enabled with consent and CAPTCHA in signup mode', () => {
        render(<Login />);
        fireEvent.click(screen.getByText("S'inscrire"));
        fireEvent.click(screen.getByRole('checkbox'));
        verifyCaptcha();
        expect(getSubmitButton().disabled).toBe(false);
    });

    it('resets checkbox when switching back to login mode', () => {
        render(<Login />);
        // Switch to signup and check the box
        fireEvent.click(screen.getByText("S'inscrire"));
        fireEvent.click(screen.getByRole('checkbox'));
        expect((screen.getByRole('checkbox') as HTMLInputElement).checked).toBe(true);

        // Switch to login — checkbox disappears
        fireEvent.click(screen.getByText('Se connecter'));
        expect(screen.queryByRole('checkbox')).toBeNull();

        // Switch back to signup — checkbox should be unchecked
        fireEvent.click(screen.getByText("S'inscrire"));
        expect((screen.getByRole('checkbox') as HTMLInputElement).checked).toBe(false);
    });

    it('submit button requires CAPTCHA in login mode', () => {
        render(<Login />);
        verifyCaptcha();
        expect(getSubmitButton().disabled).toBe(false);
    });

    it('displays CGU and Politique de confidentialité links in checkbox label', () => {
        render(<Login />);
        fireEvent.click(screen.getByText("S'inscrire"));
        const checkbox = screen.getByRole('checkbox');
        const label = checkbox.closest('label')!;
        expect(label.textContent).toContain('CGU');
        expect(label.textContent).toContain('Politique de confidentialité');
    });
});

describe('Login — mot de passe oublié (H13)', () => {
    it('affiche un lien « Mot de passe oublié ? » en mode connexion uniquement', () => {
        render(<Login />);
        expect(screen.getByText('Mot de passe oublié ?')).toBeDefined();
        fireEvent.click(screen.getByText("S'inscrire"));
        expect(screen.queryByText('Mot de passe oublié ?')).toBeNull();
    });

    it('envoie le lien de réinitialisation et affiche un message neutre', async () => {
        render(<Login />);
        fireEvent.click(screen.getByText('Mot de passe oublié ?'));
        fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'test@example.com' } });
        verifyCaptcha();
        fireEvent.click(screen.getByText('Envoyer le lien'));

        expect(supabase.auth.resetPasswordForEmail).toHaveBeenCalledWith(
            'test@example.com',
            expect.objectContaining({ redirectTo: expect.any(String), captchaToken: 'valid-test' })
        );
        expect(await screen.findByText(/un lien de réinitialisation/i)).toBeDefined();
    });

    it('les champs email et mot de passe ont des attributs autocomplete', () => {
        render(<Login />);
        expect(screen.getByLabelText('Email').getAttribute('autocomplete')).toBe('email');
        expect(screen.getByLabelText('Mot de passe').getAttribute('autocomplete')).toBe('current-password');
    });
});


describe('Login — sécurité des formulaires', () => {
    const fill = (password = 'ancien') => {
        fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'test@example.com' } });
        fireEvent.change(screen.getByLabelText('Mot de passe'), { target: { value: password } });
    };
    const submit = () => fireEvent.submit(document.querySelector('form')!);
    it('refuse une soumission forcée sans CAPTCHA et après expiration', () => {
        render(<Login />); fill(); submit();
        expect(supabase.auth.signInWithPassword).not.toHaveBeenCalled();
        verifyCaptcha(); fireEvent.click(screen.getByText('Expirer CAPTCHA')); submit();
        expect(supabase.auth.signInWithPassword).not.toHaveBeenCalled();
    });
    it('garde la connexion avec un ancien mot de passe court et consomme le jeton', async () => {
        render(<Login />); fill(); verifyCaptcha(); submit(); submit();
        expect(supabase.auth.signInWithPassword).toHaveBeenCalledTimes(1);
        expect(supabase.auth.signInWithPassword).toHaveBeenCalledWith({ email: 'test@example.com', password: 'ancien', options: { captchaToken: 'valid-test' } });
        await screen.findByText('Valider CAPTCHA');
        expect(getSubmitButton().disabled).toBe(true);
    });
    it('rejette 11 caractères à l’inscription et accepte 12', async () => {
        render(<Login />); fireEvent.click(screen.getByText("S'inscrire"));
        fireEvent.click(screen.getByRole('checkbox')); fill('12345678901'); verifyCaptcha(); submit();
        expect(supabase.auth.signUp).not.toHaveBeenCalled();
        expect(screen.getByRole('alert').textContent).toContain('12 caractères');
        fill('123456789012'); submit();
        expect(supabase.auth.signUp).toHaveBeenCalledWith(expect.objectContaining({ password: '123456789012', options: expect.objectContaining({ captchaToken: 'valid-test' }) }));
        await screen.findByText(/Inscription réussie/);
    });
    it('ne réutilise pas le CAPTCHA après un changement de formulaire', () => {
        render(<Login />); fill(); verifyCaptcha();
        fireEvent.click(screen.getByText('Mot de passe oublié ?')); submit();
        expect(supabase.auth.resetPasswordForEmail).not.toHaveBeenCalled();
        expect(getSubmitButton().disabled).toBe(true);
    });
    it('refuse aussi un jeton âgé de plus de cinq minutes quand le navigateur a suspendu ses timers', () => {
        const now = vi.spyOn(Date, 'now'); now.mockReturnValue(1000);
        render(<Login />); fill(); verifyCaptcha(); now.mockReturnValue(301001); submit();
        expect(supabase.auth.signInWithPassword).not.toHaveBeenCalled(); now.mockRestore();
    });
});
