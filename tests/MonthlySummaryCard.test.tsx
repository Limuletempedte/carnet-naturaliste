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

    it('signale des chiffres modifiés pour un mois terminé, puis régénère et remplace le bilan', async () => {
        saveMonthlySummary('2026-10', { text: 'Ancien bilan.', generatedAt: '2026-11-01T08:00:00Z', fingerprint: 'autre-empreinte', provisional: false }, captureSessionContext());
        mocks.callAiText.mockResolvedValue({ result: { text: 'Nouveau bilan.' }, remaining: 11 });
        renderCard();
        expect(screen.getByTestId('monthly-summary-changed').textContent).toContain('Chiffres modifiés');
        fireEvent.click(screen.getByRole('button', { name: 'Régénérer le bilan' }));
        expect(await screen.findByText('Nouveau bilan.')).toBeTruthy();
        expect(screen.queryByText('Ancien bilan.')).toBeNull();
        expect(screen.queryByTestId('monthly-summary-changed')).toBeNull();
        expect(JSON.parse(localStorage.getItem('ai-monthly-summaries-v1:user-1') ?? '{}').entries['2026-10'].text).toBe('Nouveau bilan.');
    });

    it('signale un bilan rédigé avant la fin du mois', () => {
        const payload = buildMonthlySummaryPayload(computeMonthlySummaryStats(DATA, '2026-10', NOW));
        saveMonthlySummary('2026-10', { text: 'Octobre en cours.', generatedAt: '2026-10-20T08:00:00Z', fingerprint: summaryFingerprint(payload), provisional: true }, captureSessionContext(), NOW);
        renderCard();
        expect(screen.getByTestId('monthly-summary-before-end').textContent).toContain('avant la fin du mois');
        expect(screen.queryByTestId('monthly-summary-changed')).toBeNull();
    });

    it('un double clic ne lance qu’une seule rédaction', async () => {
        let release: (value: unknown) => void = () => undefined;
        mocks.callAiText.mockReturnValue(new Promise(resolve => { release = resolve; }));
        renderCard();
        const button = writeButton();
        fireEvent.click(button);
        fireEvent.click(button);
        fireEvent.click(button);
        // Pendant la vérification de l'accès, le mois ne peut plus changer.
        expect((screen.getByLabelText('Mois') as HTMLSelectElement).disabled).toBe(true);
        await waitFor(() => expect(mocks.callAiText).toHaveBeenCalledTimes(1));
        fireEvent.click(button);
        release({ result: { text: 'Un seul bilan.' }, remaining: 11 });
        expect(await screen.findByText('Un seul bilan.')).toBeTruthy();
        expect(mocks.callAiText).toHaveBeenCalledTimes(1);
    });

    it('« Annuler » pendant l’envoi de l’accord n’entraîne aucune rédaction', async () => {
        mocks.getAiOverview.mockResolvedValue(approved({}));
        let release: () => void = () => undefined;
        mocks.giveConsent.mockReturnValue(new Promise<void>(resolve => { release = resolve; }));
        renderCard();
        fireEvent.click(writeButton());
        await screen.findByTestId('ai-consent-card-summary');
        fireEvent.click(screen.getByRole('checkbox'));
        fireEvent.click(screen.getByRole('button', { name: 'Accepter et rédiger' }));
        expect((screen.getByLabelText('Mois') as HTMLSelectElement).disabled).toBe(true);
        fireEvent.click(screen.getByRole('button', { name: 'Annuler' }));
        release();
        await waitFor(() => expect(mocks.giveConsent).toHaveBeenCalled());
        await new Promise(resolve => setTimeout(resolve, 20));
        expect(mocks.callAiText).not.toHaveBeenCalled();
        expect(screen.queryByTestId('ai-consent-card-summary')).toBeNull();
        // Le focus revient sur le bouton IA.
        await waitFor(() => expect(document.activeElement).toBe(writeButton()));
    });

    it('annonce le résultat aux lecteurs d’écran', async () => {
        mocks.callAiText.mockResolvedValue({ result: { text: 'Un bel octobre.' }, remaining: 11 });
        renderCard();
        fireEvent.click(writeButton());
        await screen.findByText('Un bel octobre.');
        expect(screen.getByRole('status').textContent).toBe("Bilan d'octobre 2026 rédigé.");
    });

    it('affiche tous les chiffres envoyés : groupes et jusqu’à 15 espèces', () => {
        const many = Array.from({ length: 12 }, (_, i) => obs(`Espèce ${String(i).padStart(2, '0')}`, `Genus sp${i}`, '2026-10-04', 12 - i));
        const mushroom = { ...obs('Amanite tue-mouches', 'Amanita muscaria', '2026-10-18'), taxonomicGroup: TaxonomicGroup.MUSHROOM } as Observation;
        renderCard({ observations: [...many, mushroom] });
        const groups = screen.getByTestId('monthly-summary-groups').textContent ?? '';
        expect(groups).toContain('Oiseaux');
        expect(groups).toContain('12 obs. · 12 esp.');
        expect(groups).toContain('Champignons');
        const species = screen.getByTestId('monthly-summary-species');
        expect(species.querySelectorAll('li')).toHaveLength(5);
        fireEvent.click(screen.getByRole('button', { name: 'Voir les 13 espèces' }));
        expect(species.querySelectorAll('li')).toHaveLength(13);
    });

    it('n’affiche pas de compteur sans accès approuvé', async () => {
        localStorage.setItem('ai-status-v1:user-1', JSON.stringify({ remaining: 12, monthlyQuota: 20, at: new Date().toISOString() }));
        mocks.getAiOverview.mockResolvedValue({ access: { kind: 'revoked', note: null }, consents: {}, usedByFeature: {} });
        renderCard();
        await waitFor(() => expect(mocks.getAiOverview).toHaveBeenCalled());
        await waitFor(() => expect(screen.queryByText(/restantes/)).toBeNull());
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
