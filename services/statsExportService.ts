import JSZip from 'jszip';
import { saveAs } from 'file-saver';
import { jsPDF } from 'jspdf';
import html2canvas from 'html2canvas';
import { Observation } from '../types';
import { buildStatsReportData, StatsReportData } from '../utils/statsReportData';
import { dateToIsoLocal } from '../utils/dateUtils';

export interface StatsExportOptions {
    observations: Observation[];
    statsRootElement: HTMLElement;
    isDarkMode: boolean;
    exportedAt?: Date;
}

export interface StatsExportResult {
    fileName: string;
}

type ExportStatsData = Omit<StatsReportData, 'badges'>;

const PDF_SECTION_SPACING_MM = 6;

function stripBadgesForExport(data: StatsReportData): ExportStatsData {
    const { badges: _unused, ...rest } = data;
    return rest;
}

function escHtml(value: string): string {
    return value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/\"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function chunkArray<T>(items: T[], chunkSize: number): T[][] {
    if (chunkSize <= 0) return [items];
    const chunks: T[][] = [];
    for (let i = 0; i < items.length; i += chunkSize) {
        chunks.push(items.slice(i, i + chunkSize));
    }
    return chunks;
}

async function fetchAsDataUrl(url: string): Promise<string | null> {
    try {
        const response = await fetch(url);
        if (!response.ok) return null;
        const blob = await response.blob();
        return await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result as string);
            reader.onerror = () => reject(new Error('FileReader error'));
            reader.readAsDataURL(blob);
        });
    } catch {
        return null;
    }
}

async function loadLogoDataUrls(cards: ExportStatsData['taxonSpeciesCards']): Promise<Map<string, string>> {
    const map = new Map<string, string>();
    await Promise.allSettled(
        cards
            .filter((card) => Boolean(card.logo))
            .map(async (card) => {
                const dataUrl = await fetchAsDataUrl(card.logo);
                if (dataUrl) map.set(card.logo, dataUrl);
            })
    );
    return map;
}

function buildMetricCardsHtml(data: ExportStatsData): string {
    const metrics = [
        {
            label: 'Total observations',
            value: data.totalObservations,
            note: 'Toutes les saisies enregistrées',
            accent: 'linear-gradient(90deg,#4C9A6A,#56B77A,#A8D7B6)'
        },
        {
            label: 'Espèces distinctes',
            value: data.uniqueSpecies,
            note: 'Dédupliquées par nom observé',
            accent: 'linear-gradient(90deg,#2F7CC1,#3F9AD6,#8DD7E8)'
        },
        {
            label: 'Groupes taxonomiques',
            value: data.uniqueGroups,
            note: 'Présents dans le carnet',
            accent: 'linear-gradient(90deg,#8F6CB3,#B07DB6,#E7B7D3)'
        }
    ];

    return `<div class="kpi-grid">${metrics.map((metric) => `
<article class="kpi-card">
  <span class="kpi-accent" style="background:${metric.accent}"></span>
  <div class="kpi-label">${escHtml(metric.label)}</div>
  <div class="kpi-value">${metric.value}</div>
  <div class="kpi-note">${escHtml(metric.note)}</div>
</article>`).join('')}
</div>`;
}

function buildTaxonCardsHtml(cards: ExportStatsData['taxonSpeciesCards'], logoDataUrls: Map<string, string>): string {
    return cards.map((card) => {
        const dataUrl = logoDataUrls.get(card.logo);
        const logoEl = dataUrl
            ? `<img src="${dataUrl}" alt="${escHtml(card.taxonomicGroup)}" class="taxon-logo" />`
            : '<div class="taxon-logo-placeholder"></div>';

        return `<article class="taxon-card">
  <div class="taxon-main">
    <div class="taxon-logo-wrap">${logoEl}</div>
    <div class="taxon-copy">
      <div class="taxon-name">${escHtml(card.taxonomicGroup)}</div>
      <div class="taxon-label">Espèces distinctes</div>
    </div>
  </div>
  <div class="taxon-metric">
    <div class="taxon-value">${card.speciesCount}</div>
    <div class="taxon-unit">${card.speciesCount === 1 ? 'espèce' : 'espèces'}</div>
  </div>
</article>`;
    }).join('');
}

function buildRankedGroupBarsHtml(data: ExportStatsData['rankedGroupData']): string {
    if (data.length === 0) return '<p class="no-data">Aucune donnée</p>';

    return `<div class="group-bars">${data.map((group) => {
        const barWidth = Math.max(group.percentage, group.value > 0 ? 6 : 0);
        const tooltip = escHtml(`${group.name}: ${group.value} observation(s) (${group.percentage.toFixed(1)}%)`);

        return `<article class="group-row" data-tooltip="${tooltip}">
  <div class="group-row-header">
    <div class="group-row-copy">
      <div class="group-row-name"><span class="legend-dot" style="background:${group.color}"></span><span>${escHtml(group.name)}</span></div>
      <div class="group-row-meta">${group.value} observation(s) • ${group.percentage.toFixed(1)}%</div>
    </div>
    <span class="group-row-value">${group.value}</span>
  </div>
  <div class="group-row-track"><div class="group-row-fill" style="width:${barWidth.toFixed(1)}%;background:${group.color}"></div></div>
</article>`;
    }).join('')}</div>`;
}

function buildTopSpeciesHtml(topSpecies: ExportStatsData['topSpecies']): string {
    const medalColors = ['#B8860B', '#8B8B91', '#C56A2A'];
    if (topSpecies.length === 0) return '<p class="no-data">Aucune espèce</p>';

    return `<ul class="top-species">${topSpecies.map((species, index) => {
        const color = medalColors[index] ?? '#4C9A6A';
        return `<li>
  <div class="top-species-main">
    <span class="species-rank" style="background:${color}">${index + 1}</span>
    <div class="species-copy">
      <span class="species-name">${escHtml(species.name)}</span>
      <span class="species-subtitle">Espèce la plus observée</span>
    </div>
  </div>
  <span class="species-count">${species.count} ind.</span>
</li>`;
    }).join('')}</ul>`;
}

function generateStatusPieSvg(statusData: ExportStatsData['statusData']): string {
    const total = statusData.reduce((sum, entry) => sum + entry.value, 0);
    if (total === 0 || statusData.length === 0) {
        return '<p class="no-data">Aucune donnée</p>';
    }

    const cx = 120;
    const cy = 120;
    const radius = 90;
    const innerRadius = 54;
    const size = 240;
    let currentAngle = -Math.PI / 2;

    const arcs = statusData.map((entry) => {
        const angle = (entry.value / total) * (Math.PI * 2);
        const start = currentAngle;
        const end = currentAngle + angle;
        currentAngle = end;

        const x1 = (cx + radius * Math.cos(start)).toFixed(2);
        const y1 = (cy + radius * Math.sin(start)).toFixed(2);
        const x2 = (cx + radius * Math.cos(end)).toFixed(2);
        const y2 = (cy + radius * Math.sin(end)).toFixed(2);
        const ix1 = (cx + innerRadius * Math.cos(start)).toFixed(2);
        const iy1 = (cy + innerRadius * Math.sin(start)).toFixed(2);
        const ix2 = (cx + innerRadius * Math.cos(end)).toFixed(2);
        const iy2 = (cy + innerRadius * Math.sin(end)).toFixed(2);
        const largeArc = angle > Math.PI ? 1 : 0;
        const tooltip = escHtml(`${entry.name}: ${entry.value} observation(s) (${entry.percentage.toFixed(1)}%)`);

        return `<path d="M ${ix1} ${iy1} L ${x1} ${y1} A ${radius} ${radius} 0 ${largeArc} 1 ${x2} ${y2} L ${ix2} ${iy2} A ${innerRadius} ${innerRadius} 0 ${largeArc} 0 ${ix1} ${iy1} Z" fill="${entry.color}" stroke="#fff" stroke-width="2" class="chart-slice" data-tooltip="${tooltip}"><title>${tooltip}</title></path>`;
    }).join('');

    return `<svg viewBox="0 0 ${size} ${size}" width="${size}" height="${size}" class="pie-svg">
${arcs}
<circle cx="${cx}" cy="${cy}" r="${innerRadius - 1}" fill="#fffaf3"></circle>
<text x="${cx}" y="${cy - 6}" text-anchor="middle" font-size="14" font-weight="700" fill="#7b7469">Total</text>
<text x="${cx}" y="${cy + 18}" text-anchor="middle" font-size="28" font-weight="800" fill="#1c1c1e">${total}</text>
</svg>`;
}

function buildStatusLegendHtml(statusData: ExportStatsData['statusData']): string {
    if (statusData.length === 0) return '<p class="no-data">Aucune donnée</p>';

    return statusData.map((entry) => `<div class="status-legend-item">
  <span class="legend-dot" style="background:${entry.color}"></span>
  <div class="status-legend-copy">
    <span class="status-name">${escHtml(entry.name)}</span>
    <span class="status-meta">${entry.value} observation(s) • ${entry.percentage.toFixed(1)}%</span>
  </div>
</div>`).join('');
}

function generateMonthlyBarSvg(data: Array<{ name: string; observations: number }>): string {
    const maxValue = Math.max(...data.map((entry) => entry.observations), 1);
    const width = 460;
    const height = 250;
    const marginTop = 14;
    const marginRight = 12;
    const marginBottom = 58;
    const marginLeft = 40;
    const chartWidth = width - marginLeft - marginRight;
    const chartHeight = height - marginTop - marginBottom;
    const step = chartWidth / data.length;
    const barWidth = step * 0.58;

    const gridVals = [0, Math.round(maxValue / 2), maxValue];
    const grid = gridVals.map((value) => {
        const y = marginTop + chartHeight - (value / maxValue) * chartHeight;
        return `<line x1="${marginLeft}" y1="${y.toFixed(2)}" x2="${(marginLeft + chartWidth).toFixed(2)}" y2="${y.toFixed(2)}" stroke="#ddd2c2" stroke-width="1" stroke-dasharray="4 6"></line><text x="${marginLeft - 8}" y="${(y + 4).toFixed(2)}" text-anchor="end" font-size="10" fill="#7b7469">${value}</text>`;
    }).join('');

    const bars = data.map((entry, index) => {
        const barHeight = entry.observations > 0 ? (entry.observations / maxValue) * chartHeight : 0;
        const x = marginLeft + index * step + ((step - barWidth) / 2);
        const y = marginTop + chartHeight - barHeight;
        const tooltip = escHtml(`${entry.name}: ${entry.observations} observation(s)`);

        return `<g class="bar-group"><rect x="${x.toFixed(2)}" y="${y.toFixed(2)}" width="${barWidth.toFixed(2)}" height="${Math.max(barHeight, 0).toFixed(2)}" fill="#4C9A6A" rx="8" class="chart-bar" data-tooltip="${tooltip}"><title>${tooltip}</title></rect><text x="${(x + (barWidth / 2)).toFixed(2)}" y="${(marginTop + chartHeight + 18).toFixed(2)}" text-anchor="middle" font-size="10" fill="#7b7469">${escHtml(entry.name)}</text></g>`;
    }).join('');

    return `<svg viewBox="0 0 ${width} ${height}" width="100%" height="${height}" class="bar-svg">${grid}${bars}<line x1="${marginLeft}" y1="${marginTop}" x2="${marginLeft}" y2="${marginTop + chartHeight}" stroke="#ddd2c2" stroke-width="1"></line><line x1="${marginLeft}" y1="${marginTop + chartHeight}" x2="${marginLeft + chartWidth}" y2="${marginTop + chartHeight}" stroke="#ddd2c2" stroke-width="1"></line></svg>`;
}

function buildPdfSectionsHtml(data: ExportStatsData, logoDataUrls: Map<string, string>, exportedAt: Date): string {
    const dateLabel = exportedAt.toLocaleDateString('fr-FR', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });

    const taxonSections = chunkArray(data.taxonSpeciesCards, 8).map((chunk, index) => `<section class="pdf-section"><div class="section-heading"><h2>Espèces observées par taxon${index > 0 ? ' (suite)' : ''}</h2><p>Nombre d'espèces distinctes par grand groupe.</p></div><div class="taxon-grid">${buildTaxonCardsHtml(chunk, logoDataUrls)}</div></section>`).join('');

    return `<section class="pdf-section pdf-header"><p class="eyebrow">Rapport PDF statique</p><h1>Rapport Statistiques Naturaliste</h1><p class="meta">Généré le ${escHtml(dateLabel)} • ${data.totalObservations} observation(s)</p></section>
<section class="pdf-section">${buildMetricCardsHtml(data)}</section>
${taxonSections}
<section class="pdf-section chart-split"><article class="chart-card"><div class="section-heading"><h2>Répartition par groupe</h2><p>Classement des groupes les plus représentés.</p></div>${buildRankedGroupBarsHtml(data.rankedGroupData)}</article><article class="chart-card"><div class="section-heading"><h2>Activité mensuelle</h2><p>Volume d'observations sur l'année.</p></div>${generateMonthlyBarSvg(data.activityData)}</article></section>
<section class="pdf-section chart-split"><article class="chart-card"><div class="section-heading"><h2>Top 5 espèces</h2><p>Classement par nombre d'individus observés.</p></div>${buildTopSpeciesHtml(data.topSpecies)}</article><article class="chart-card"><div class="section-heading"><h2>Statut de protection</h2><p>Répartition des statuts présents dans le carnet.</p></div><div class="status-layout">${generateStatusPieSvg(data.statusData)}<div class="status-legend">${buildStatusLegendHtml(data.statusData)}</div></div></article></section>`;
}

function createPdfSandbox(html: string): { sandbox: HTMLDivElement; sections: HTMLElement[] } {
    const css = `
*{box-sizing:border-box}
body{margin:0}
.pdf-root{width:1080px;background:#fffaf3;color:#1c1c1e;font-family:Inter,Arial,sans-serif;padding:28px}
.pdf-section{margin:0 0 22px 0;padding:20px;border:1px solid #e5d8c4;border-radius:28px;background:linear-gradient(180deg,#fffdf8 0%,#fbf6ee 100%)}
.pdf-header{padding:0 0 18px 0;border-radius:0;border:0;border-bottom:2px solid #d9cbb7;background:transparent}
.eyebrow{margin:0 0 8px 0;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.18em;color:#8e7b62}
.pdf-header h1{margin:0;font-size:34px;line-height:1.1;font-family:Georgia,'Times New Roman',serif}
.meta{margin:12px 0 0 0;font-size:14px;color:#6f6659}
.section-heading{margin-bottom:16px}.section-heading h2{margin:0;font-size:28px;line-height:1.1;font-family:Georgia,'Times New Roman',serif}.section-heading p{margin:8px 0 0 0;font-size:13px;color:#6f6659}
.kpi-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:14px}
.kpi-card{position:relative;overflow:hidden;padding:20px;border-radius:24px;border:1px solid #e2d4bf;background:#fffdf8}
.kpi-accent{position:absolute;left:0;top:0;right:0;height:5px}
.kpi-label{font-size:11px;font-weight:700;letter-spacing:.18em;text-transform:uppercase;color:#7b7469}
.kpi-value{margin-top:14px;font-size:56px;line-height:1;font-weight:800}.kpi-note{margin-top:18px;font-size:13px;color:#756d62}
.taxon-grid{display:grid;grid-template-columns:repeat(2,1fr);gap:14px}
.taxon-card{display:flex;align-items:center;justify-content:space-between;gap:16px;padding:18px 20px;border-radius:24px;border:1px solid #e2d4bf;background:linear-gradient(135deg,#fbf7ef 0%,#fffdfc 45%,#f4eadd 100%)}
.taxon-main{display:flex;align-items:center;gap:14px;min-width:0}.taxon-logo-wrap{width:56px;height:56px;border-radius:20px;background:#efe2cf;border:1px solid #d6c4ab;display:flex;align-items:center;justify-content:center;flex-shrink:0}
.taxon-logo{width:34px;height:34px;object-fit:contain}.taxon-logo-placeholder{width:32px;height:32px;border-radius:10px;background:#d9cbb7}
.taxon-copy{min-width:0}.taxon-name{font-size:20px;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.taxon-label{margin-top:8px;font-size:11px;font-weight:700;letter-spacing:.16em;text-transform:uppercase;color:#927d61}
.taxon-metric{text-align:right;flex-shrink:0}.taxon-value{font-size:40px;line-height:1;font-weight:800}.taxon-unit{margin-top:4px;font-size:15px;font-weight:700;color:#6f6659}
.chart-split{display:grid;grid-template-columns:1fr 1fr;gap:16px}.chart-card{padding:20px;border-radius:24px;border:1px solid #e5d8c4;background:#fffdf9}
.group-bars{display:flex;flex-direction:column;gap:12px}.group-row{padding:14px;border-radius:20px;border:1px solid #e7dbc9;background:#fbf8f1}
.group-row-header{display:flex;align-items:flex-start;justify-content:space-between;gap:12px}.group-row-copy{min-width:0}
.group-row-name{display:flex;align-items:center;gap:10px;font-size:17px;font-weight:700}.group-row-meta{margin-top:7px;font-size:12px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:#8a775e}
.group-row-value{padding:6px 12px;border-radius:999px;border:1px solid #e7ddce;background:#fff;font-size:13px;font-weight:700;color:#5e5548}
.group-row-track{margin-top:14px;height:14px;border-radius:999px;overflow:hidden;background:#e9decf}.group-row-fill{height:100%;border-radius:999px}
.legend-dot{width:11px;height:11px;border-radius:999px;display:inline-block;flex-shrink:0}
.top-species{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:10px}
.top-species li{display:flex;align-items:center;justify-content:space-between;gap:14px;padding:14px 16px;border-radius:20px;border:1px solid #e4d7c5;background:#faf6ee}
.top-species-main{display:flex;align-items:center;gap:12px;min-width:0}.species-rank{width:34px;height:34px;border-radius:999px;display:flex;align-items:center;justify-content:center;color:#fff;font-size:13px;font-weight:700;flex-shrink:0}
.species-copy{min-width:0}.species-name{display:block;font-size:18px;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.species-subtitle{display:block;margin-top:4px;font-size:11px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:#8a775e}
.species-count{padding:8px 14px;border-radius:999px;border:1px solid #e6dccd;background:#fff;font-size:13px;font-weight:700;color:#5f5548;white-space:nowrap}
.status-layout{display:flex;flex-direction:column;align-items:center;gap:18px}.pie-svg{max-width:240px}
.status-legend{display:grid;grid-template-columns:1fr;gap:10px;width:100%}.status-legend-item{display:flex;align-items:flex-start;gap:10px;padding:12px 14px;border-radius:18px;border:1px solid #e4d7c5;background:#faf6ee}
.status-legend-copy{display:flex;flex-direction:column;gap:4px}.status-name{font-size:16px;font-weight:700}.status-meta{font-size:13px;color:#6f6659}
.no-data{margin:0;padding:20px 0;font-size:14px;color:#6f6659;text-align:center}
`;

    const sandbox = document.createElement('div');
    sandbox.style.position = 'fixed';
    sandbox.style.left = '-20000px';
    sandbox.style.top = '0';
    sandbox.style.pointerEvents = 'none';
    sandbox.style.zIndex = '-1';
    sandbox.innerHTML = `<style>${css}</style><div class="pdf-root">${html}</div>`;
    document.body.appendChild(sandbox);

    const sections = Array.from(sandbox.querySelectorAll<HTMLElement>('.pdf-section'));
    return { sandbox, sections };
}

async function generatePdfBlob(data: ExportStatsData, logoDataUrls: Map<string, string>, exportedAt: Date): Promise<Blob> {
    try {
        await document.fonts.ready;
    } catch {
        // no-op
    }

    await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));

    const html = buildPdfSectionsHtml(data, logoDataUrls, exportedAt);
    const { sandbox, sections } = createPdfSandbox(html);

    try {
        const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
        const pageWidth = pdf.internal.pageSize.getWidth();
        const pageHeight = pdf.internal.pageSize.getHeight();
        const margin = 10;
        const contentWidth = pageWidth - (margin * 2);
        const contentHeight = pageHeight - (margin * 2);
        let cursorY = margin;

        for (const section of sections) {
            const canvas = await html2canvas(section, {
                useCORS: true,
                allowTaint: false,
                scale: 2,
                logging: false,
                backgroundColor: '#fffaf3'
            });

            if (!canvas.width || !canvas.height) continue;

            const naturalHeight = canvas.height * (contentWidth / canvas.width);
            const oversized = naturalHeight > contentHeight;
            const drawHeight = oversized ? contentHeight : naturalHeight;
            const drawWidth = oversized ? contentWidth * (contentHeight / naturalHeight) : contentWidth;

            if (cursorY + drawHeight > pageHeight - margin) {
                pdf.addPage();
                cursorY = margin;
            }

            const x = margin + ((contentWidth - drawWidth) / 2);
            pdf.addImage(canvas, 'PNG', x, cursorY, drawWidth, drawHeight);
            cursorY += drawHeight + PDF_SECTION_SPACING_MM;
        }

        return pdf.output('blob') as Blob;
    } finally {
        sandbox.remove();
    }
}

function generateStandaloneHtml(data: ExportStatsData, logoDataUrls: Map<string, string>, exportedAt: Date): string {
    const dateLabel = exportedAt.toLocaleDateString('fr-FR', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });

    const taxonSection = data.taxonSpeciesCards.length > 0
        ? `<section class="section"><div class="section-heading"><h2>Espèces observées par taxon</h2><p>Nombre d'espèces distinctes observées par grand groupe.</p></div><div class="taxon-grid">${buildTaxonCardsHtml(data.taxonSpeciesCards, logoDataUrls)}</div></section>`
        : '';

    const css = `
*,*::before,*::after{box-sizing:border-box}
html,body{margin:0;padding:0}
body{font-family:Inter,system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:linear-gradient(180deg,#f7f2e8 0%,#f3ece1 100%);color:#1c1c1e;line-height:1.5;padding:32px 18px}
.container{max-width:1180px;margin:0 auto}
header{margin-bottom:26px;padding:0 0 18px 0;border-bottom:2px solid #dbcdb9}.eyebrow{margin:0 0 8px 0;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.18em;color:#8e7b62}
header h1{margin:0;font-size:2.4rem;line-height:1.08;font-family:Georgia,'Times New Roman',serif}.meta{margin-top:10px;font-size:.96rem;color:#6f6659}
.section{margin-bottom:24px;padding:22px;border-radius:30px;border:1px solid #e5d8c4;background:rgba(255,253,248,.92);box-shadow:0 14px 34px rgba(67,53,36,.08)}
.section-heading{margin-bottom:18px}.section-heading h2,.chart-card h2{margin:0;font-size:1.85rem;line-height:1.08;font-family:Georgia,'Times New Roman',serif}.section-heading p,.chart-card p.helper{margin:8px 0 0 0;font-size:.95rem;color:#6f6659}
.kpi-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:16px;margin-bottom:24px}.kpi-card{position:relative;overflow:hidden;padding:22px;border-radius:26px;border:1px solid #e2d4bf;background:linear-gradient(180deg,#fffdf8 0%,#fbf6ee 100%)}
.kpi-accent{position:absolute;left:0;top:0;right:0;height:5px}.kpi-label{font-size:.72rem;font-weight:700;letter-spacing:.2em;text-transform:uppercase;color:#7b7469}.kpi-value{margin-top:16px;font-size:3.6rem;line-height:1;font-weight:800}.kpi-note{margin-top:18px;font-size:.92rem;color:#756d62}
.taxon-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:14px}
.taxon-card{display:flex;align-items:center;justify-content:space-between;gap:16px;padding:18px 20px;border-radius:26px;border:1px solid #e2d4bf;background:linear-gradient(135deg,#fbf7ef 0%,#fffdfc 45%,#f4eadd 100%)}
.taxon-main{display:flex;align-items:center;gap:14px;min-width:0}.taxon-logo-wrap{width:58px;height:58px;border-radius:20px;background:#efe2cf;border:1px solid #d6c4ab;display:flex;align-items:center;justify-content:center;flex-shrink:0}
.taxon-logo{width:34px;height:34px;object-fit:contain}.taxon-logo-placeholder{width:32px;height:32px;border-radius:10px;background:#d9cbb7}.taxon-copy{min-width:0}
.taxon-name{font-size:1.1rem;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.taxon-label{margin-top:8px;font-size:.68rem;font-weight:700;letter-spacing:.18em;text-transform:uppercase;color:#927d61}
.taxon-metric{text-align:right;flex-shrink:0}.taxon-value{font-size:2.4rem;line-height:1;font-weight:800}.taxon-unit{margin-top:4px;font-size:.92rem;font-weight:700;color:#6f6659}
.charts-grid{display:grid;grid-template-columns:1fr 1fr;gap:18px}.chart-card{padding:22px;border-radius:30px;border:1px solid #e5d8c4;background:rgba(255,253,249,.94);box-shadow:0 14px 34px rgba(67,53,36,.08)}
.group-bars{display:flex;flex-direction:column;gap:12px}.group-row{padding:14px;border-radius:22px;border:1px solid #e7dbc9;background:#fbf8f1;cursor:pointer;transition:transform .15s ease, box-shadow .15s ease}.group-row:hover{transform:translateY(-1px);box-shadow:0 8px 18px rgba(67,53,36,.08)}
.group-row-header{display:flex;align-items:flex-start;justify-content:space-between;gap:12px}.group-row-copy{min-width:0}.group-row-name{display:flex;align-items:center;gap:10px;font-size:1rem;font-weight:700}.group-row-meta{margin-top:7px;font-size:.72rem;font-weight:700;letter-spacing:.16em;text-transform:uppercase;color:#8a775e}
.group-row-value{padding:6px 12px;border-radius:999px;border:1px solid #e7ddce;background:#fff;font-size:.82rem;font-weight:700;color:#5e5548}.group-row-track{margin-top:14px;height:14px;border-radius:999px;overflow:hidden;background:#e9decf}.group-row-fill{height:100%;border-radius:999px}
.legend-dot{width:11px;height:11px;border-radius:999px;display:inline-block;flex-shrink:0}
.pie-svg .chart-slice{cursor:pointer;transition:opacity .15s ease}.pie-svg .chart-slice:hover,.bar-svg .chart-bar:hover{opacity:.82}.bar-svg .chart-bar{cursor:pointer;transition:opacity .15s ease}
.top-species{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:10px}.top-species li{display:flex;align-items:center;justify-content:space-between;gap:14px;padding:14px 16px;border-radius:22px;border:1px solid #e4d7c5;background:#faf6ee}
.top-species-main{display:flex;align-items:center;gap:12px;min-width:0}.species-rank{width:34px;height:34px;border-radius:999px;display:flex;align-items:center;justify-content:center;color:#fff;font-size:.82rem;font-weight:700;flex-shrink:0}.species-copy{min-width:0}
.species-name{display:block;font-size:1.02rem;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.species-subtitle{display:block;margin-top:4px;font-size:.7rem;font-weight:700;letter-spacing:.16em;text-transform:uppercase;color:#8a775e}
.species-count{padding:8px 14px;border-radius:999px;border:1px solid #e6dccd;background:#fff;font-size:.82rem;font-weight:700;color:#5f5548;white-space:nowrap}
.status-layout{display:grid;grid-template-columns:minmax(0,1fr) 240px;gap:18px;align-items:center}.status-legend{display:grid;grid-template-columns:1fr;gap:10px}.status-legend-item{display:flex;align-items:flex-start;gap:10px;padding:12px 14px;border-radius:18px;border:1px solid #e4d7c5;background:#faf6ee}
.status-legend-copy{display:flex;flex-direction:column;gap:4px}.status-name{font-size:1rem;font-weight:700}.status-meta{font-size:.88rem;color:#6f6659}
.no-data{margin:0;padding:20px 0;font-size:.92rem;color:#6f6659;text-align:center}
.tt{position:fixed;background:rgba(17,24,39,.92);color:#fff;padding:7px 10px;border-radius:10px;font-size:12px;pointer-events:none;display:none;z-index:9999;max-width:240px;line-height:1.4;box-shadow:0 10px 30px rgba(0,0,0,.2)}
@media(max-width:1100px){.taxon-grid{grid-template-columns:repeat(2,1fr)}.charts-grid{grid-template-columns:1fr}.status-layout{grid-template-columns:1fr}}
@media(max-width:720px){body{padding:20px 14px}.kpi-grid{grid-template-columns:1fr}.taxon-grid{grid-template-columns:1fr}header h1{font-size:2rem}}
`;

    const tooltipScript = `
var tt=document.getElementById('tt');
document.querySelectorAll('[data-tooltip]').forEach(function(el){
  el.addEventListener('mouseenter',function(){tt.textContent=el.getAttribute('data-tooltip');tt.style.display='block';});
  el.addEventListener('mousemove',function(e){tt.style.left=(e.clientX+14)+'px';tt.style.top=(e.clientY-38)+'px';});
  el.addEventListener('mouseleave',function(){tt.style.display='none';});
});
`;

    return `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>Carnet Naturaliste - Rapport Stats</title>
<style>${css}</style>
</head>
<body>
<div class="container">
<header><p class="eyebrow">Rapport HTML interactif</p><h1>Rapport de Statistiques Naturaliste</h1><p class="meta">Généré le ${escHtml(dateLabel)} • ${data.totalObservations} observation(s)</p></header>
${buildMetricCardsHtml(data)}
${taxonSection}
<div class="charts-grid">
  <article class="chart-card"><h2>Répartition par groupe</h2><p class="helper">Classement des groupes les plus représentés.</p><div style="margin-top:18px">${buildRankedGroupBarsHtml(data.rankedGroupData)}</div></article>
  <article class="chart-card"><h2>Activité mensuelle</h2><p class="helper">Volume d'observations sur l'année.</p><div style="margin-top:18px">${generateMonthlyBarSvg(data.activityData)}</div></article>
  <article class="chart-card"><h2>Top 5 espèces</h2><p class="helper">Classement par nombre d'individus observés.</p><div style="margin-top:18px">${buildTopSpeciesHtml(data.topSpecies)}</div></article>
  <article class="chart-card"><h2>Statut de protection</h2><p class="helper">Répartition des statuts présents dans le carnet.</p><div class="status-layout" style="margin-top:18px"><div>${generateStatusPieSvg(data.statusData)}</div><div class="status-legend">${buildStatusLegendHtml(data.statusData)}</div></div></article>
</div>
</div>
<div class="tt" id="tt"></div>
<script>${tooltipScript}</script>
</body>
</html>`;
}

export async function exportStatsBundle(options: StatsExportOptions): Promise<StatsExportResult> {
    const { observations, exportedAt = new Date() } = options;

    const rawStatsData = buildStatsReportData(observations);
    const statsData = stripBadgesForExport(rawStatsData);
    const logoDataUrls = await loadLogoDataUrls(statsData.taxonSpeciesCards);

    const pdfBlob = await generatePdfBlob(statsData, logoDataUrls, exportedAt);
    const htmlContent = generateStandaloneHtml(statsData, logoDataUrls, exportedAt);

    const manifest = {
        generatedAt: exportedAt.toISOString(),
        totalObservations: statsData.totalObservations,
        uniqueSpecies: statsData.uniqueSpecies,
        uniqueGroups: statsData.uniqueGroups,
        files: ['stats-report.pdf', 'stats-report.html', 'stats-data.json', 'manifest.json']
    };

    const zip = new JSZip();
    zip.file('stats-report.pdf', pdfBlob);
    zip.file('stats-report.html', htmlContent);
    zip.file('stats-data.json', JSON.stringify(statsData, null, 2));
    zip.file('manifest.json', JSON.stringify(manifest, null, 2));

    const zipContent = await zip.generateAsync({
        type: 'blob',
        mimeType: 'application/zip',
        compression: 'DEFLATE',
        compressionOptions: { level: 6 }
    });

    const fileName = `carnet-naturaliste-stats-${dateToIsoLocal(exportedAt)}.zip`;
    saveAs(zipContent, fileName);

    return { fileName };
}
