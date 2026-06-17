import { render, screen, fireEvent } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

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

import Login from '../components/Auth/Login';
import { supabase } from '../supabaseClient';

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

    it('submit button is enabled when checkbox is checked in signup mode', () => {
        render(<Login />);
        fireEvent.click(screen.getByText("S'inscrire"));
        fireEvent.click(screen.getByRole('checkbox'));
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

    it('submit button is not disabled in login mode (no checkbox needed)', () => {
        render(<Login />);
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
        fireEvent.click(screen.getByText('Envoyer le lien'));

        expect(supabase.auth.resetPasswordForEmail).toHaveBeenCalledWith(
            'test@example.com',
            expect.objectContaining({ redirectTo: expect.any(String) })
        );
        expect(await screen.findByText(/un lien de réinitialisation/i)).toBeDefined();
    });

    it('les champs email et mot de passe ont des attributs autocomplete', () => {
        render(<Login />);
        expect(screen.getByLabelText('Email').getAttribute('autocomplete')).toBe('email');
        expect(screen.getByLabelText('Mot de passe').getAttribute('autocomplete')).toBe('current-password');
    });
});
