import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { setSessionIdentity } from '../services/sessionScope';

const mocks = vi.hoisted(() => ({
    getAiOverview: vi.fn(),
    requestAccess: vi.fn(),
    withdrawAccess: vi.fn(),
    giveConsent: vi.fn(),
    withdrawConsent: vi.fn(),
}));

vi.mock('../services/aiAssistService', async (importOriginal) => {
    const actual = await importOriginal<typeof import('../services/aiAssistService')>();
    return {
        ...actual,
        getAiOverview: mocks.getAiOverview,
        requestAccess: mocks.requestAccess,
        withdrawAccess: mocks.withdrawAccess,
        giveConsent: mocks.giveConsent,
        withdrawConsent: mocks.withdrawConsent,
    };
});

import AiAccessDialog from '../components/AiAccessDialog';
import { AiAssistError, type AiAccessStatus, type AiOverview } from '../services/aiAssistService';

/** Vue d'ensemble simulée : accès donné, consentements et compteur facultatifs. */
const ov = (access: AiAccessStatus, extra: Partial<AiOverview> = {}): AiOverview => ({ access, consents: {}, usedByFeature: {}, ...extra });

const renderDialog = (props: Partial<React.ComponentProps<typeof AiAccessDialog>> = {}) =>
    render(<AiAccessDialog isOpen onClose={vi.fn()} {...props} />);

beforeEach(() => {
    Object.values(mocks).forEach(mock => mock.mockReset());
    localStorage.clear();
    setSessionIdentity('user-1');
    mocks.requestAccess.mockResolvedValue(undefined);
    mocks.withdrawAccess.mockResolvedValue(undefined);
    mocks.giveConsent.mockResolvedValue(undefined);
    mocks.withdrawConsent.mockResolvedValue(undefined);
});

describe('AiAccessDialog', () => {
    it('affiche un texte de consentement complet', async () => {
        mocks.getAiOverview.mockResolvedValue(ov({ kind: 'none' }));
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
        mocks.getAiOverview.mockResolvedValueOnce(ov({ kind: 'none' })).mockResolvedValueOnce(ov({ kind: 'pending', requestedAt: null }));
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
        mocks.getAiOverview.mockResolvedValue(ov({ kind: 'pending', requestedAt: '2026-11-05T10:00:00Z' }));
        renderDialog();
        expect(await screen.findByText(/Demande en attente de validation/)).toBeTruthy();
        expect(screen.getByText(/Prévenez le propriétaire par e-mail/)).toBeTruthy();
        expect(screen.getByRole('button', { name: 'Retirer mon accord' })).toBeTruthy();
    });

    it('affiche les analyses restantes quand l’accès est actif', async () => {
        mocks.getAiOverview.mockResolvedValue(ov({ kind: 'approved', remaining: 12, monthlyQuota: 20 }));
        renderDialog();
        expect((await screen.findByText(/Accès actif/)).textContent).toContain('12 utilisations restantes ce mois-ci (sur 20)');
    });

    it('affiche le refus et la note du propriétaire en texte brut', async () => {
        mocks.getAiOverview.mockResolvedValue(ov({ kind: 'refused', note: '<b>Accès limité</b>' }));
        renderDialog();
        expect(await screen.findByText("Votre demande n'a pas été acceptée.")).toBeTruthy();
        expect(screen.getByText('Message : <b>Accès limité</b>')).toBeTruthy();
    });

    it('affiche la révocation', async () => {
        mocks.getAiOverview.mockResolvedValue(ov({ kind: 'revoked', note: null }));
        renderDialog();
        expect(await screen.findByText('Votre accès a été retiré.')).toBeTruthy();
    });

    it('propose de renouveler un consentement périmé', async () => {
        mocks.getAiOverview.mockResolvedValueOnce(ov({ kind: 'consent_outdated' })).mockResolvedValueOnce(ov({ kind: 'pending', requestedAt: null }));
        renderDialog();
        const button = await screen.findByRole('button', { name: 'Renouveler mon accord' });
        expect((button as HTMLButtonElement).disabled).toBe(true);
        fireEvent.click(screen.getByRole('checkbox'));
        fireEvent.click(button);
        await waitFor(() => expect(mocks.requestAccess).toHaveBeenCalledWith({ replaceExisting: true }, expect.anything()));
    });

    it('retire l’accord après confirmation', async () => {
        mocks.getAiOverview.mockResolvedValueOnce(ov({ kind: 'approved', remaining: 3, monthlyQuota: 20 })).mockResolvedValueOnce(ov({ kind: 'none' }));
        renderDialog();
        fireEvent.click(await screen.findByRole('button', { name: 'Retirer mon accord' }));
        expect(mocks.withdrawAccess).not.toHaveBeenCalled();
        fireEvent.click(screen.getByRole('button', { name: 'Confirmer le retrait' }));
        await waitFor(() => expect(mocks.withdrawAccess).toHaveBeenCalledTimes(1));
        expect(await screen.findByRole('button', { name: "Demander l'accès" })).toBeTruthy();
    });

    it('affiche un message clair si le statut est illisible', async () => {
        mocks.getAiOverview.mockRejectedValue(new AiAssistError('offline'));
        renderDialog();
        expect((await screen.findByRole('alert')).textContent).toContain("n'est disponible qu'en ligne");
    });

    it('désactive les actions hors ligne', async () => {
        mocks.getAiOverview.mockResolvedValue(ov({ kind: 'none' }));
        renderDialog({ isOffline: true });
        expect(await screen.findByText('Disponible en ligne uniquement.')).toBeTruthy();
        fireEvent.click(screen.getByRole('checkbox'));
        expect((screen.getByRole('button', { name: "Demander l'accès" }) as HTMLButtonElement).disabled).toBe(true);
    });

    it('s’intitule « Assistant IA »', async () => {
        mocks.getAiOverview.mockResolvedValue(ov({ kind: 'none' }));
        renderDialog();
        expect(await screen.findByRole('heading', { name: 'Assistant IA' })).toBeTruthy();
    });

    it('détaille le compteur partagé par fonctionnalité', async () => {
        mocks.getAiOverview.mockResolvedValue(ov({ kind: 'approved', remaining: 15, monthlyQuota: 20 }, { usedByFeature: { identify: 3, summary: 2 } }));
        renderDialog();
        const counter = await screen.findByTestId('ai-counter');
        expect(counter.textContent).toContain('15 utilisations restantes');
        expect(counter.textContent).toContain('3 analyses photo, 2 bilans');
        expect(counter.textContent).toContain('repart le 1er du mois');
    });

    it('présente une carte par fonctionnalité', async () => {
        mocks.getAiOverview.mockResolvedValue(ov({ kind: 'approved', remaining: 20, monthlyQuota: 20 }));
        renderDialog();
        const photo = await screen.findByTestId('ai-feature-identify');
        expect(photo.textContent).toMatch(/Formulaire d'observation/);
        const summary = screen.getByTestId('ai-feature-summary');
        expect(summary.textContent).toMatch(/Onglet Stats/);
        expect(summary.textContent).toMatch(/Jamais de lieu/);
    });

    it('donne l’accord au bilan après la case cochée', async () => {
        mocks.getAiOverview
            .mockResolvedValueOnce(ov({ kind: 'approved', remaining: 20, monthlyQuota: 20 }))
            .mockResolvedValueOnce(ov({ kind: 'approved', remaining: 20, monthlyQuota: 20 }, { consents: { summary: '2026-11-v1' } }));
        renderDialog();
        const card = await screen.findByTestId('ai-feature-summary');
        expect(card.textContent).toMatch(/Ce qui n'est pas envoyé/);
        const give = screen.getByRole('button', { name: 'Donner mon accord' }) as HTMLButtonElement;
        expect(give.disabled).toBe(true);
        fireEvent.click(screen.getByRole('checkbox'));
        fireEvent.click(give);
        await waitFor(() => expect(mocks.giveConsent).toHaveBeenCalledWith('summary', expect.objectContaining({ userId: 'user-1' })));
        expect(await screen.findByText('Accord donné')).toBeTruthy();
    });

    it('retire l’accord au bilan sans toucher à l’accès', async () => {
        mocks.getAiOverview
            .mockResolvedValueOnce(ov({ kind: 'approved', remaining: 20, monthlyQuota: 20 }, { consents: { summary: '2026-11-v1' } }))
            .mockResolvedValueOnce(ov({ kind: 'approved', remaining: 20, monthlyQuota: 20 }));
        renderDialog();
        fireEvent.click(await screen.findByRole('button', { name: 'Retirer mon accord au bilan' }));
        await waitFor(() => expect(mocks.withdrawConsent).toHaveBeenCalledWith('summary', expect.anything()));
        expect(mocks.withdrawAccess).not.toHaveBeenCalled();
        expect(await screen.findByRole('button', { name: 'Donner mon accord' })).toBeTruthy();
    });

    it('signale un accord au bilan donné sous un ancien texte', async () => {
        mocks.getAiOverview.mockResolvedValue(ov({ kind: 'approved', remaining: 20, monthlyQuota: 20 }, { consents: { summary: '2025-01-v0' } }));
        renderDialog();
        expect(await screen.findByText(/Le texte a changé/)).toBeTruthy();
        expect(screen.queryByText('Accord donné')).toBeNull();
    });

    it('affiche hors ligne le dernier compteur connu avec sa date', async () => {
        const now = new Date();
        localStorage.setItem('ai-status-v1:user-1', JSON.stringify({ remaining: 7, monthlyQuota: 20, at: now.toISOString() }));
        mocks.getAiOverview.mockRejectedValue(new AiAssistError('offline'));
        renderDialog({ isOffline: true });
        const line = await screen.findByTestId('ai-cached-counter');
        expect(line.textContent).toContain('7 utilisations restantes sur 20');
        expect(line.textContent).toContain(`au ${now.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' })}`);
    });
});
