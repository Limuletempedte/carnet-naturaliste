import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import JSZip from 'jszip';
import { Age, Comportement, ObservationCondition, Protocol, Sexe, Status, TaxonomicGroup } from '../types';

// ── Mocks ─────────────────────────────────────────────────────────────────────

const saveAsMock = vi.fn();
vi.mock('file-saver', () => ({ saveAs: saveAsMock }));

// html2canvas renvoie un canvas minimal (1×1) suffisant pour piloter le service
vi.mock('html2canvas', () => ({
    default: vi.fn(async () => {
        const c = document.createElement('canvas');
        c.width = 1;
        c.height = 1;
        return c;
    })
}));

// jsPDF est mocké pour éviter toute dépendance à l'API Canvas réelle
const pdfBlobMock = new Blob(['fake-pdf'], { type: 'application/pdf' });
const jsPDFInstance = {
    internal: { pageSize: { getWidth: () => 210, getHeight: () => 297 } },
    addImage: vi.fn(),
    addPage: vi.fn(),
    output: vi.fn(() => pdfBlobMock)
};
vi.mock('jspdf', () => ({ jsPDF: vi.fn(() => jsPDFInstance) }));

// ── Fixture ───────────────────────────────────────────────────────────────────

const makeObservation = () => ({
    id: 'abc-123',
    speciesName: 'Renard roux',
    latinName: 'Vulpes vulpes',
    taxonomicGroup: TaxonomicGroup.MAMMAL,
    date: '2026-03-10',
    time: '08:00',
    count: 2,
    location: 'Bois',
    gps: { lat: null, lon: null },
    municipality: 'Lille',
    department: '59',
    country: 'France',
    altitude: null,
    comment: '',
    status: Status.LC,
    atlasCode: '',
    protocol: Protocol.OPPORTUNIST,
    sexe: Sexe.UNKNOWN,
    age: Age.UNKNOWN,
    observationCondition: ObservationCondition.UNKNOWN,
    comportement: Comportement.UNKNOWN,
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('exportStatsBundle', () => {
    beforeEach(() => {
        saveAsMock.mockReset();
        jsPDFInstance.addImage.mockReset();
        jsPDFInstance.addPage.mockReset();
        // Fetch → 404 : les logos ne se chargent pas (fallback texte dans HTML)
        vi.stubGlobal('fetch', vi.fn(async () => new Response(null, { status: 404 })));
    });

    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it('génère un ZIP et appelle saveAs', async () => {
        const { exportStatsBundle } = await import('../services/statsExportService');
        const element = document.createElement('div');
        document.body.appendChild(element);

        await exportStatsBundle({
            observations: [makeObservation()],
            statsRootElement: element,
            isDarkMode: false,
            exportedAt: new Date('2026-03-12T10:00:00')
        });

        expect(saveAsMock).toHaveBeenCalledTimes(1);
        document.body.removeChild(element);
    });

    it('le ZIP contient exactement les 4 fichiers requis', async () => {
        const { exportStatsBundle } = await import('../services/statsExportService');
        const element = document.createElement('div');
        document.body.appendChild(element);

        await exportStatsBundle({
            observations: [makeObservation()],
            statsRootElement: element,
            isDarkMode: false,
            exportedAt: new Date('2026-03-12T10:00:00')
        });

        const blob = saveAsMock.mock.calls[0][0] as Blob;
        const zip = await JSZip.loadAsync(blob);
        const fileNames = Object.keys(zip.files);

        expect(fileNames).toContain('stats-report.pdf');
        expect(fileNames).toContain('stats-report.html');
        expect(fileNames).toContain('stats-data.json');
        expect(fileNames).toContain('manifest.json');
        expect(fileNames).toHaveLength(4);

        document.body.removeChild(element);
    });

    it('le nom de fichier respecte le format carnet-naturaliste-stats-YYYY-MM-DD.zip', async () => {
        const { exportStatsBundle } = await import('../services/statsExportService');
        const element = document.createElement('div');
        document.body.appendChild(element);

        const result = await exportStatsBundle({
            observations: [makeObservation()],
            statsRootElement: element,
            isDarkMode: false,
            exportedAt: new Date('2026-03-12T10:00:00')
        });

        expect(result.fileName).toMatch(/^carnet-naturaliste-stats-\d{4}-\d{2}-\d{2}\.zip$/);
        const savedFileName = saveAsMock.mock.calls[0][1] as string;
        expect(savedFileName).toBe(result.fileName);

        document.body.removeChild(element);
    });

    it('stats-data.json contient les données de l\'observation', async () => {
        const { exportStatsBundle } = await import('../services/statsExportService');
        const element = document.createElement('div');
        document.body.appendChild(element);

        await exportStatsBundle({
            observations: [makeObservation()],
            statsRootElement: element,
            isDarkMode: false,
            exportedAt: new Date('2026-03-12T10:00:00')
        });

        const blob = saveAsMock.mock.calls[0][0] as Blob;
        const zip = await JSZip.loadAsync(blob);
        const jsonText = await zip.files['stats-data.json'].async('string');
        const json = JSON.parse(jsonText) as { totalObservations: number; badges?: unknown };

        expect(json.totalObservations).toBe(1);
        expect(json.badges).toBeUndefined();

        document.body.removeChild(element);
    });

    it('manifest.json contient les métadonnées correctes', async () => {
        const { exportStatsBundle } = await import('../services/statsExportService');
        const element = document.createElement('div');
        document.body.appendChild(element);

        const exportedAt = new Date('2026-03-12T10:00:00Z');

        await exportStatsBundle({
            observations: [makeObservation()],
            statsRootElement: element,
            isDarkMode: false,
            exportedAt
        });

        const blob = saveAsMock.mock.calls[0][0] as Blob;
        const zip = await JSZip.loadAsync(blob);
        const manifestText = await zip.files['manifest.json'].async('string');
        const manifest = JSON.parse(manifestText) as {
            totalObservations: number;
            files: string[];
            generatedAt: string;
        };

        expect(manifest.totalObservations).toBe(1);
        expect(manifest.files).toEqual(['stats-report.pdf', 'stats-report.html', 'stats-data.json', 'manifest.json']);
        expect(manifest.generatedAt).toBe(exportedAt.toISOString());

        document.body.removeChild(element);
    });

    it('stats-report.html est un document HTML autonome avec les données', async () => {
        const { exportStatsBundle } = await import('../services/statsExportService');
        const element = document.createElement('div');
        document.body.appendChild(element);

        await exportStatsBundle({
            observations: [makeObservation()],
            statsRootElement: element,
            isDarkMode: false,
            exportedAt: new Date('2026-03-12T10:00:00')
        });

        const blob = saveAsMock.mock.calls[0][0] as Blob;
        const zip = await JSZip.loadAsync(blob);
        const html = await zip.files['stats-report.html'].async('string');

        expect(html).toContain('<!DOCTYPE html>');
        expect(html).toContain('<html lang="fr">');
        // Contient les données d'observation
        expect(html).toContain('1'); // totalObservations
        // Les badges sont exclus du périmètre export
        expect(html).not.toContain('Badges &amp; Succ');
        expect(html).not.toContain('badge-card');
        // Pas de ressources externes
        expect(html).not.toContain('https://fonts.googleapis');
        expect(html).not.toContain('cdn.jsdelivr');

        document.body.removeChild(element);
    });

    it('fallback logo : HTML généré sans img quand fetch échoue', async () => {
        const { exportStatsBundle } = await import('../services/statsExportService');
        const element = document.createElement('div');
        document.body.appendChild(element);

        // Une observation avec un taxon ayant un logo → fetch → 404 → fallback
        await exportStatsBundle({
            observations: [{
                ...makeObservation(),
                taxonomicGroup: TaxonomicGroup.BIRD,
                speciesName: 'Mésange bleue'
            }],
            statsRootElement: element,
            isDarkMode: false,
            exportedAt: new Date('2026-03-12T10:00:00')
        });

        const blob = saveAsMock.mock.calls[0][0] as Blob;
        const zip = await JSZip.loadAsync(blob);
        const html = await zip.files['stats-report.html'].async('string');

        // Le logo ne peut pas être chargé → pas de data URL dans le src
        expect(html).not.toContain('data:image/png;base64');
        // Mais la carte est quand même présente (fallback placeholder)
        expect(html).toContain('taxon-logo-placeholder');

        document.body.removeChild(element);
    });
});
