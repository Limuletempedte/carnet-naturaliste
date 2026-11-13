import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import AiConsentCard from '../components/AiConsentCard';

describe('AiConsentCard — bilan du mois', () => {
    it('reprend tous les points du consentement', () => {
        render(<AiConsentCard feature="summary" onAccept={vi.fn()} onCancel={vi.fn()} />);
        const text = screen.getByTestId('ai-summary-consent-text').textContent ?? '';
        // Ce qui est envoyé, et ce qui ne l'est pas
        expect(text).toMatch(/Ce qui est envoyé/);
        expect(text).toMatch(/15 espèces les plus observées/);
        expect(text).toMatch(/30 espèces/);
        expect(text).toMatch(/Ce qui n'est pas envoyé/);
        expect(text).toMatch(/Ni lieu, ni commune, ni coordonnées GPS, ni commentaire, ni observateur, ni date précise/);
        // Destinataire, transfert, conservation, entraînement (faits vérifiés de la phase 1)
        expect(text).toMatch(/Anthropic Ireland Ltd/);
        expect(text).toMatch(/États-Unis/);
        expect(text).toMatch(/clauses contractuelles types/);
        expect(text).toMatch(/30 jours/);
        expect(text).toMatch(/2 ans si un contrôle de sécurité/);
        expect(text).toMatch(/ne servent pas à entraîner/);
        // Aide, décision, quota, retrait
        expect(text).toMatch(/C'est une aide/);
        expect(text).toMatch(/c'est vous qui décidez/);
        expect(text).toMatch(/1 utilisation sur les 20 du mois/);
        expect(text).toMatch(/refus de l'assistant ou une réponse inexploitable compte aussi/);
        expect(text).toMatch(/Retirer mon accord au bilan/);
        expect(text).toMatch(/24 mois/);
    });

    it('exige la case avant d’accepter', () => {
        const onAccept = vi.fn();
        render(<AiConsentCard feature="summary" onAccept={onAccept} onCancel={vi.fn()} acceptLabel="Accepter et rédiger" />);
        const accept = screen.getByRole('button', { name: 'Accepter et rédiger' }) as HTMLButtonElement;
        expect(accept.disabled).toBe(true);
        fireEvent.click(screen.getByRole('checkbox'));
        expect(accept.disabled).toBe(false);
        fireEvent.click(accept);
        expect(onAccept).toHaveBeenCalledTimes(1);
    });

    it('propose le point central et l’annulation', () => {
        const onOpen = vi.fn();
        const onCancel = vi.fn();
        render(<AiConsentCard feature="summary" onAccept={vi.fn()} onCancel={onCancel} onOpenAssistant={onOpen} />);
        fireEvent.click(screen.getByRole('button', { name: "Tout savoir sur l'assistant" }));
        fireEvent.click(screen.getByRole('button', { name: 'Annuler' }));
        expect(onOpen).toHaveBeenCalled();
        expect(onCancel).toHaveBeenCalled();
    });

    it('hors ligne, l’acceptation est impossible', () => {
        render(<AiConsentCard feature="summary" onAccept={vi.fn()} onCancel={vi.fn()} isOffline />);
        fireEvent.click(screen.getByRole('checkbox'));
        expect((screen.getByRole('button', { name: 'Accepter' }) as HTMLButtonElement).disabled).toBe(true);
    });
});
