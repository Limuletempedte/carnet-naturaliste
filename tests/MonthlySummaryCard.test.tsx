import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { captureSessionContext, setSessionIdentity } from '../services/sessionScope';
import { TaxonomicGroup, type Observation } from '../types';

const mocks = vi.hoisted(() => ({
    getAiOverview: vi.fn(),
    giveConsent: vi.fn(),
    callAiText: vi.fn(),
}));

vi.mock('../services/aiAssistService', async (importOriginal) => {
    const actual = await importOriginal<typeof import('../services/aiAssistService')>();
    return { ...actual, getAiOverview: mocks.getAiOverview, giveConsent: mocks.giveConsent, callAiText: mocks.callAiText };
});
vi.mock('../services/storageService', () => ({ getOfflineQueueSnapshot: () => [] }));

import MonthlySummaryCard from '../components/MonthlySummaryCard';
import { AiAssistError, type AiOverview } from '../services/aiAssistService';
import { saveMonthlySummary } from '../services/monthlySummaryCache';
import { buildMonthlySummaryPayload, computeMonthlySummaryStats, summaryFingerprint } from '../utils/monthlySummaryStats';

const NOW = new Date(2026, 10, 13);

let counter = 0;
const obs = (speciesName: string, latinName: string, date: string, count = 1): Observation => ({
    id: `obs-${++counter}`, speciesName, latinName, taxonomicGroup: TaxonomicGroup.BIRD, date, time: '09:00', count,
    location: '', gps: { lat: null, lon: null }, municipality: '', department: '', country: 'France', altitude: null, comment: '',
} as Observation);

const DATA = [
    obs('Mésange charbonnière', 'Parus major', '2026-03-08', 2),
    obs('Rougegorge familier', 'Erithacus rubecula', '2026-10-03', 2),
    obs('Héron cendré', 'Ardea cinerea', '2026-10-25'),
    obs('Pinson des arbres', 'Fringilla coelebs', '2026-11-02'),
];

const approved = (consents: AiOverview['consents'] = { summary: '2026-11-v1' }): AiOverview => ({
    access: { kind: 'approved', remaining: 12, monthlyQuota: 20 }, consents, usedByFeature: {},
});

const renderCard = (props: Partial<React.ComponentProps<typeof MonthlySummaryCard>> = {}) =>
    render(<MonthlySummaryCard observations={DATA} now={NOW} onOpenAiAssistant={vi.fn()} {...props} />);

const writeButton = () => screen.getByRole('button', { name: /Rédiger le bilan|Régénérer le bilan/ }) as HTMLButtonElement;

beforeEach(() => {
    Object.values(mocks).forEach(mock => mock.mockReset());
    localStorage.clear();
    setSessionIdentity('user-1');
    mocks.getAiOverview.mockResolvedValue(approved());
    mocks.giveConsent.mockResolvedValue(undefined);
});

describe('MonthlySummaryCard', () => {
    it('ouvre sur le dernier mois complet et affiche ses chiffres', async () => {
        renderCard();
        expect((screen.getByLabelText('Mois') as HTMLSelectElement).value).toBe('2026-10');
        const card = screen.getByTestId('monthly-summary-card');
        expect(card.textContent).toContain('Rougegorge familier');
        expect(card.textContent).toContain('Nouvelles pour votre carnet');
        expect(screen.queryByText(/chiffres provisoires/)).toBeNull();
        // Compteur lu dès l'ouverture
        expect(await screen.findByText(/12 restantes/)).toBeTruthy();
    });

    it('marque le mois en cours comme provisoire', () => {
        renderCard();
        fireEvent.change(screen.getByLabelText('Mois'), { target: { value: '2026-11' } });
        expect(screen.getByText('Mois en cours : chiffres provisoires')).toBeTruthy();
    });

    it('ne propose pas de rédaction pour un mois vide', () => {
        renderCard();
        fireEvent.change(screen.getByLabelText('Mois'), { target: { value: '2026-07' } });
        expect(screen.getByText(/rien à résumer/)).toBeTruthy();
        expect(screen.queryByRole('button', { name: 'Rédiger le bilan' })).toBeNull();
    });

    it('demande l’accord au premier usage, puis rédige et conserve le bilan', async () => {
        mocks.getAiOverview.mockResolvedValueOnce(approved({})).mockResolvedValueOnce(approved({})).mockResolvedValue(approved());
        mocks.callAiText.mockResolvedValue({ result: { text: 'Un bel octobre.' }, remaining: 11 });
        renderCard();
        await screen.findByText(/12 restantes/);
        fireEvent.click(writeButton());
        expect(await screen.findByTestId('ai-consent-card-summary')).toBeTruthy();
        expect(mocks.callAiText).not.toHaveBeenCalled();

        fireEvent.click(screen.getByRole('checkbox'));
        fireEvent.click(screen.getByRole('button', { name: 'Accepter et rédiger' }));

        expect(await screen.findByText('Un bel octobre.')).toBeTruthy();
        expect(mocks.giveConsent).toHaveBeenCalledWith('summary', expect.objectContaining({ userId: 'user-1' }));
        const [feature, payload] = mocks.callAiText.mock.calls[0];
        expect(feature).toBe('summary');
        expect(payload.month).toBe('2026-10');
        expect(JSON.parse(localStorage.getItem('ai-monthly-summaries-v1:user-1') ?? '{}').entries['2026-10'].text).toBe('Un bel octobre.');
        expect(screen.getByText(/11 restantes/)).toBeTruthy();
        expect(screen.getByRole('button', { name: 'Régénérer le bilan' })).toBeTruthy();
    });

    it('affiche le texte tel quel, sans jamais l’interpréter comme du HTML', async () => {
        const hostile = '<img src=x onerror="window.__pwned=1"> **gras** [lien](https://exemple.test)';
        mocks.callAiText.mockResolvedValue({ result: { text: hostile }, remaining: 11 });
        renderCard();
        fireEvent.click(writeButton());
        const block = await screen.findByTestId('monthly-summary-text');
        expect(block.textContent).toContain(hostile);
        expect(block.querySelector('img')).toBeNull();
        expect(block.querySelector('a')).toBeNull();
        expect((window as unknown as { __pwned?: number }).__pwned).toBeUndefined();
    });

    it('lit un bilan conservé hors ligne, sans appel', () => {
        const payload = buildMonthlySummaryPayload(computeMonthlySummaryStats(DATA, '2026-10', NOW));
        saveMonthlySummary('2026-10', { text: 'Bilan gardé.', generatedAt: '2026-11-01T08:00:00Z', fingerprint: summaryFingerprint(payload), provisional: false }, captureSessionContext());
        renderCard({ isOffline: true });
        expect(screen.getByText('Bilan gardé.')).toBeTruthy();
        expect(writeButton().disabled).toBe(true);
        expect(screen.getByText('Disponible en ligne uniquement.')).toBeTruthy();
        expect(screen.queryByTestId('monthly-summary-changed')).toBeNull();
        expect(mocks.getAiOverview).not.toHaveBeenCalled();
    });

    it('signale des chiffres modifiés pour un mois terminé et propose de régénérer', () => {
        saveMonthlySummary('2026-10', { text: 'Ancien bilan.', generatedAt: '2026-11-01T08:00:00Z', fingerprint: 'autre-empreinte', provisional: false }, captureSessionContext());
        renderCard();
        expect(screen.getByTestId('monthly-summary-changed').textContent).toContain('Chiffres modifiés');
        expect(screen.getByRole('button', { name: 'Régénérer le bilan' })).toBeTruthy();
    });

    it('ne signale pas de chiffres modifiés pour le mois provisoire', () => {
        saveMonthlySummary('2026-11', { text: 'Novembre en cours.', generatedAt: '2026-11-05T08:00:00Z', fingerprint: 'autre-empreinte', provisional: true }, captureSessionContext());
        renderCard();
        fireEvent.change(screen.getByLabelText('Mois'), { target: { value: '2026-11' } });
        expect(screen.getByText('Novembre en cours.')).toBeTruthy();
        expect(screen.queryByTestId('monthly-summary-changed')).toBeNull();
    });

    it('oriente vers « Assistant IA » sans accès approuvé', async () => {
        mocks.getAiOverview.mockResolvedValue({ access: { kind: 'none' }, consents: {}, usedByFeature: {} });
        const onOpen = vi.fn();
        renderCard({ onOpenAiAssistant: onOpen });
        fireEvent.click(writeButton());
        fireEvent.click(await screen.findByRole('button', { name: 'Ouvrir « Assistant IA »' }));
        expect(onOpen).toHaveBeenCalled();
        expect(mocks.callAiText).not.toHaveBeenCalled();
    });

    it('affiche le message propre au bilan en cas d’erreur', async () => {
        mocks.callAiText.mockRejectedValue(new AiAssistError('feature_disabled', { feature: 'summary' }));
        renderCard();
        fireEvent.click(writeButton());
        expect((await screen.findByRole('alert')).textContent).toBe("La rédaction du bilan n'est pas encore ouverte. Réessayez plus tard.");
        expect(localStorage.getItem('ai-monthly-summaries-v1:user-1')).toBeNull();
    });

    it('redemande l’accord si le texte a changé côté serveur', async () => {
        mocks.callAiText.mockRejectedValue(new AiAssistError('consent_outdated', { feature: 'summary' }));
        renderCard();
        fireEvent.click(writeButton());
        await waitFor(() => expect(screen.getByTestId('ai-consent-card-summary')).toBeTruthy());
        expect(screen.getByText('Le texte de votre accord a changé')).toBeTruthy();
    });
});
