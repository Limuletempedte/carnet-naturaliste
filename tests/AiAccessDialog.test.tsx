import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { setSessionIdentity } from '../services/sessionScope';

const mocks = vi.hoisted(() => ({
    getAccessStatus: vi.fn(),
    requestAccess: vi.fn(),
    withdrawAccess: vi.fn(),
}));

vi.mock('../services/aiAssistService', async (importOriginal) => {
    const actual = await importOriginal<typeof import('../services/aiAssistService')>();
    return {
        ...actual,
        getAccessStatus: mocks.getAccessStatus,
        requestAccess: mocks.requestAccess,
        withdrawAccess: mocks.withdrawAccess,
    };
});

import AiAccessDialog from '../components/AiAccessDialog';
import { AiAssistError } from '../services/aiAssistService';

const renderDialog = (props: Partial<React.ComponentProps<typeof AiAccessDialog>> = {}) =>
    render(<AiAccessDialog isOpen onClose={vi.fn()} {...props} />);

beforeEach(() => {
    Object.values(mocks).forEach(mock => mock.mockReset());
    localStorage.clear();
    setSessionIdentity('user-1');
    mocks.requestAccess.mockResolvedValue(undefined);
    mocks.withdrawAccess.mockResolvedValue(undefined);
});

describe('AiAccessDialog', () => {
    it('affiche un texte de consentement complet', async () => {
        mocks.getAccessStatus.mockResolvedValue({ kind: 'none' });
        renderDialog();
        const text = (await screen.findByTestId('ai-consent-text')).textContent ?? '';
        // Ce qui est envoyé et ce qui ne l'est pas
        expect(text).toMatch(/Ce qui est envoyé/);
        expect(text).toMatch(/sans métadonnées EXIF ni position GPS/);
        expect(text).toMatch(/Ce qui n'est pas envoyé/);
        expect(text).toMatch(/Ni coordonnées GPS, ni commune/);
        // Destinataire, transfert, conservation
        expect(text).toMatch(/Anthropic Ireland Ltd/);
        expect(text).toMatch(/États-Unis/);
        expect(text).toMatch(/clauses contractuelles types/);
        expect(text).toMatch(/30 jours/);
        expect(text).toMatch(/2 ans/);
        expect(text).toMatch(/3 mois/);
        // Photo non rappelable, personnes, aide et non certitude
        expect(text).toMatch(/ne peut pas être rappelée/);
        expect(text).toMatch(/personnes sont reconnaissables/);
        expect(text).toMatch(/pas une certitude/);
        expect(text).toMatch(/C'est vous qui décidez/);
        expect(text).toMatch(/aucune décision n'est prise automatiquement/);
        // Quota, retrait, contact
        expect(text).toMatch(/20 analyses par mois/);
        expect(text).toMatch(/Retirer mon accord/);
        expect(text).toMatch(/carnetnaturaliste\.app@gmail\.com/);
    });

    it('exige la case de consentement avant de demander l’accès', async () => {
        mocks.getAccessStatus.mockResolvedValueOnce({ kind: 'none' }).mockResolvedValueOnce({ kind: 'pending', requestedAt: null });
        renderDialog();
        const button = await screen.findByRole('button', { name: "Demander l'accès" });
        expect((button as HTMLButtonElement).disabled).toBe(true);

        fireEvent.click(screen.getByRole('checkbox'));
        expect((button as HTMLButtonElement).disabled).toBe(false);
        fireEvent.click(button);

        await waitFor(() => expect(mocks.requestAccess).toHaveBeenCalledWith({ replaceExisting: false }, expect.objectContaining({ userId: 'user-1' })));
        expect(await screen.findByText(/Demande envoyée/)).toBeTruthy();
        expect(screen.getByText(/Prévenez le propriétaire par e-mail/)).toBeTruthy();
    });

    it('affiche l’attente de validation avec la consigne d’e-mail', async () => {
        mocks.getAccessStatus.mockResolvedValue({ kind: 'pending', requestedAt: '2026-11-05T10:00:00Z' });
        renderDialog();
        expect(await screen.findByText(/Demande en attente de validation/)).toBeTruthy();
        expect(screen.getByText(/Prévenez le propriétaire par e-mail/)).toBeTruthy();
        expect(screen.getByRole('button', { name: 'Retirer mon accord' })).toBeTruthy();
    });

    it('affiche les analyses restantes quand l’accès est actif', async () => {
        mocks.getAccessStatus.mockResolvedValue({ kind: 'approved', remaining: 12, monthlyQuota: 20 });
        renderDialog();
        expect((await screen.findByText(/Accès actif/)).textContent).toContain('12 analyses restantes ce mois-ci (sur 20)');
    });

    it('affiche le refus et la note du propriétaire en texte brut', async () => {
        mocks.getAccessStatus.mockResolvedValue({ kind: 'refused', note: '<b>Accès limité</b>' });
        renderDialog();
        expect(await screen.findByText("Votre demande n'a pas été acceptée.")).toBeTruthy();
        expect(screen.getByText('Message : <b>Accès limité</b>')).toBeTruthy();
    });

    it('affiche la révocation', async () => {
        mocks.getAccessStatus.mockResolvedValue({ kind: 'revoked', note: null });
        renderDialog();
        expect(await screen.findByText('Votre accès a été retiré.')).toBeTruthy();
    });

    it('propose de renouveler un consentement périmé', async () => {
        mocks.getAccessStatus.mockResolvedValueOnce({ kind: 'consent_outdated' }).mockResolvedValueOnce({ kind: 'pending', requestedAt: null });
        renderDialog();
        const button = await screen.findByRole('button', { name: 'Renouveler mon accord' });
        expect((button as HTMLButtonElement).disabled).toBe(true);
        fireEvent.click(screen.getByRole('checkbox'));
        fireEvent.click(button);
        await waitFor(() => expect(mocks.requestAccess).toHaveBeenCalledWith({ replaceExisting: true }, expect.anything()));
    });

    it('retire l’accord après confirmation', async () => {
        mocks.getAccessStatus.mockResolvedValueOnce({ kind: 'approved', remaining: 3, monthlyQuota: 20 }).mockResolvedValueOnce({ kind: 'none' });
        renderDialog();
        fireEvent.click(await screen.findByRole('button', { name: 'Retirer mon accord' }));
        expect(mocks.withdrawAccess).not.toHaveBeenCalled();
        fireEvent.click(screen.getByRole('button', { name: 'Confirmer le retrait' }));
        await waitFor(() => expect(mocks.withdrawAccess).toHaveBeenCalledTimes(1));
        expect(await screen.findByRole('button', { name: "Demander l'accès" })).toBeTruthy();
    });

    it('affiche un message clair si le statut est illisible', async () => {
        mocks.getAccessStatus.mockRejectedValue(new AiAssistError('offline'));
        renderDialog();
        expect((await screen.findByRole('alert')).textContent).toContain("n'est disponible qu'en ligne");
    });

    it('désactive les actions hors ligne', async () => {
        mocks.getAccessStatus.mockResolvedValue({ kind: 'none' });
        renderDialog({ isOffline: true });
        expect(await screen.findByText('Disponible en ligne uniquement.')).toBeTruthy();
        fireEvent.click(screen.getByRole('checkbox'));
        expect((screen.getByRole('button', { name: "Demander l'accès" }) as HTMLButtonElement).disabled).toBe(true);
    });
});
