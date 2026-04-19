import { Observation, Sexe, Age, Comportement } from '../types';
import { isSensitiveSpecies, obfuscateCoordinate } from '../utils/gpsPrivacy';
import { escapeCsvCell } from '../utils/csvUtils';

export type ObservationExportType = 'json' | 'excel' | 'pdf' | 'darwincore' | 'geojson';

const obfuscateSensitiveObservations = (observations: Observation[]): Observation[] =>
    observations.map(obs => {
        if (!isSensitiveSpecies(obs.status)) return obs;
        return {
            ...obs,
            gps: {
                lat: obfuscateCoordinate(obs.gps.lat),
                lon: obfuscateCoordinate(obs.gps.lon),
            },
        };
    });

const exportJson = (exportData: Observation[]) => {
    const safeData = obfuscateSensitiveObservations(exportData);
    const blob = new Blob([JSON.stringify(safeData, null, 2)], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', 'observations.json');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
};

const exportExcel = async (exportData: Observation[]) => {
    const ExcelJS = await import('exceljs');
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Observations');

    worksheet.columns = [
        { header: 'ID', key: 'id', width: 36 },
        { header: "Nom de l'espèce", key: 'speciesName', width: 25 },
        { header: 'Nom latin', key: 'latinName', width: 25 },
        { header: 'Groupe taxonomique', key: 'taxonomicGroup', width: 20 },
        { header: 'Date', key: 'date', width: 12 },
        { header: 'Heure', key: 'time', width: 8 },
        { header: 'Nombre', key: 'count', width: 10 },
        { header: 'Mâles', key: 'maleCount', width: 10 },
        { header: 'Femelles', key: 'femaleCount', width: 10 },
        { header: 'Non identifiés', key: 'unidentifiedCount', width: 14 },
        { header: 'Lieu-dit', key: 'location', width: 20 },
        { header: 'Latitude', key: 'lat', width: 12 },
        { header: 'Longitude', key: 'lon', width: 12 },
        { header: 'Commune', key: 'municipality', width: 15 },
        { header: 'Département', key: 'department', width: 15 },
        { header: 'Pays', key: 'country', width: 12 },
        { header: 'Altitude', key: 'altitude', width: 10 },
        { header: 'Statut', key: 'status', width: 10 },
        { header: 'Code Atlas', key: 'atlasCode', width: 12 },
        { header: 'Protocole', key: 'protocol', width: 15 },
        { header: 'Sexe', key: 'sexe', width: 15 },
        { header: 'Age', key: 'age', width: 12 },
        { header: "Condition d'observation", key: 'observationCondition', width: 20 },
        { header: 'Comportement', key: 'comportement', width: 18 },
        { header: 'Conditions météo', key: 'weather', width: 18 },
        { header: 'Habitat', key: 'habitat', width: 20 },
        { header: 'Phénologie', key: 'phenology', width: 18 },
        { header: 'Observateurs', key: 'observers', width: 25 },
        { header: 'Commentaire', key: 'comment', width: 30 },
    ];

    exportData.forEach(obs => {
        worksheet.addRow({
            id: obs.id,
            speciesName: obs.speciesName,
            latinName: obs.latinName,
            taxonomicGroup: obs.taxonomicGroup,
            date: obs.date,
            time: obs.time,
            count: obs.count,
            maleCount: obs.maleCount ?? '',
            femaleCount: obs.femaleCount ?? '',
            unidentifiedCount: obs.unidentifiedCount ?? '',
            location: obs.location,
            lat: isSensitiveSpecies(obs.status) ? (obfuscateCoordinate(obs.gps.lat) ?? '') : (obs.gps.lat ?? ''),
            lon: isSensitiveSpecies(obs.status) ? (obfuscateCoordinate(obs.gps.lon) ?? '') : (obs.gps.lon ?? ''),
            municipality: obs.municipality,
            department: obs.department,
            country: obs.country,
            altitude: obs.altitude ?? '',
            status: obs.status,
            atlasCode: obs.atlasCode,
            protocol: obs.protocol,
            sexe: obs.sexe,
            age: obs.age,
            observationCondition: obs.observationCondition,
            comportement: obs.comportement,
            weather: obs.weather,
            habitat: obs.habitat ?? '',
            phenology: obs.phenology ?? '',
            observers: obs.observers ? obs.observers.join(' | ') : '',
            comment: obs.comment,
        });
    });

    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'export_observations.xlsx';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
};

const exportPdf = async (exportData: Observation[]) => {
    const { default: jsPDF } = await import('jspdf');
    const pdf = new jsPDF('p', 'mm', 'a4');
    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
    const left = 10;
    const right = pageWidth - 10;
    let y = 12;

    pdf.setFontSize(16);
    pdf.text('Carnet naturaliste - Observations', left, y);
    y += 8;
    pdf.setFontSize(10);
    pdf.text(`Nombre d'observations: ${exportData.length}`, left, y);
    y += 8;

    const formatCountBreakdown = (obs: Observation): string => {
        const hasBreakdown = obs.maleCount !== undefined || obs.femaleCount !== undefined || obs.unidentifiedCount !== undefined;
        if (!hasBreakdown) return 'n/a';
        return `M:${obs.maleCount ?? 0} F:${obs.femaleCount ?? 0} NI:${obs.unidentifiedCount ?? 0}`;
    };

    exportData.forEach((obs, index) => {
        const lines = pdf.splitTextToSize(
            [
                `${index + 1}. ${obs.speciesName} (${obs.latinName || 'Nom latin non renseigné'})`,
                `Date: ${obs.date} ${obs.time || ''} | Nombre: ${obs.count} | Détail: ${formatCountBreakdown(obs)} | Groupe: ${obs.taxonomicGroup}`,
                `Lieu: ${obs.location || 'Lieu non renseigné'} ${obs.municipality ? `(${obs.municipality})` : ''}`,
                `Météo: ${obs.weather || 'Non renseigné'} | Commentaire: ${obs.comment || 'Aucun'}`
            ].join('\n'),
            right - left
        );

        const blockHeight = lines.length * 5 + 3;
        if (y + blockHeight > pageHeight - 10) {
            pdf.addPage();
            y = 12;
        }

        pdf.text(lines, left, y);
        y += blockHeight;
    });

    pdf.save('carnet-naturaliste-observations.pdf');
};

// ---- Darwin Core export (VP-11) ----
// Mapping best-effort des enums français Carnet Naturaliste vers les
// vocabulaires DwC anglais courts. Les champs libres (comment, location,
// speciesName vernaculaire) restent en français — DwC tolère toutes langues.

const SEX_MAP: Record<string, string> = {
    [Sexe.MALE]: 'male',
    [Sexe.FEMALE]: 'female',
    [Sexe.UNKNOWN]: '',
};

const LIFE_STAGE_MAP: Record<string, string> = {
    [Age.CHICK_NON_FLYING]: 'juvenile',
    [Age.CHICK_FLYING]: 'juvenile',
    [Age.IMMATURE]: 'immature',
    [Age.FIRST_YEAR]: 'immature',
    [Age.SECOND_YEAR]: 'immature',
    [Age.THIRD_YEAR]: 'immature',
    [Age.FOURTH_YEAR]: 'adult',
    [Age.FIFTH_YEAR]: 'adult',
    [Age.ADULT]: 'adult',
    [Age.UNKNOWN]: '',
};

const BEHAVIOR_MAP: Record<string, string> = {
    [Comportement.ACTIVE_MIGRATION]: 'active migration',
    [Comportement.HUNTING]: 'hunting',
    [Comportement.ROOST]: 'roosting',
    [Comportement.IN_TRANSIT]: 'in transit',
    [Comportement.UNKNOWN]: '',
};

const COUNTRY_CODE_MAP: Record<string, string> = {
    France: 'FR',
    Belgique: 'BE',
    Suisse: 'CH',
    Luxembourg: 'LU',
    Canada: 'CA',
    Allemagne: 'DE',
    Espagne: 'ES',
    Italie: 'IT',
    Portugal: 'PT',
    'Royaume-Uni': 'GB',
    'Royaume Uni': 'GB',
    'États-Unis': 'US',
    'Etats-Unis': 'US',
};

const DWC_HEADERS = [
    'occurrenceID',
    'basisOfRecord',
    'scientificName',
    'vernacularName',
    'eventDate',
    'decimalLatitude',
    'decimalLongitude',
    'geodeticDatum',
    'coordinateUncertaintyInMeters',
    'countryCode',
    'locality',
    'municipality',
    'minimumElevationInMeters',
    'individualCount',
    'sex',
    'lifeStage',
    'behavior',
    'samplingProtocol',
    'habitat',
    'reproductiveCondition',
    'recordedBy',
    'occurrenceRemarks',
] as const;

const formatEventDate = (obs: Observation): string => {
    if (!obs.date) return '';
    if (obs.time) return `${obs.date}T${obs.time}`;
    return obs.date;
};

const buildDwcRow = (obs: Observation): Record<typeof DWC_HEADERS[number], string | number> => {
    const sensitive = isSensitiveSpecies(obs.status);
    const lat = sensitive ? obfuscateCoordinate(obs.gps.lat) : obs.gps.lat;
    const lon = sensitive ? obfuscateCoordinate(obs.gps.lon) : obs.gps.lon;
    const uncertainty = sensitive ? 10000 : '';

    return {
        occurrenceID: obs.id,
        basisOfRecord: 'HumanObservation',
        scientificName: obs.latinName || '',
        vernacularName: obs.speciesName || '',
        eventDate: formatEventDate(obs),
        decimalLatitude: lat ?? '',
        decimalLongitude: lon ?? '',
        geodeticDatum: lat != null && lon != null ? 'WGS84' : '',
        coordinateUncertaintyInMeters: uncertainty,
        countryCode: COUNTRY_CODE_MAP[obs.country] ?? '',
        locality: obs.location || '',
        municipality: obs.municipality || '',
        minimumElevationInMeters: obs.altitude ?? '',
        individualCount: obs.count,
        sex: SEX_MAP[obs.sexe] ?? '',
        lifeStage: LIFE_STAGE_MAP[obs.age] ?? '',
        behavior: BEHAVIOR_MAP[obs.comportement] ?? '',
        samplingProtocol: obs.protocol,
        habitat: obs.habitat ?? '',
        reproductiveCondition: obs.phenology ?? '',
        recordedBy: obs.observers ? obs.observers.join(' | ') : '',
        occurrenceRemarks: obs.comment || '',
    };
};

export const buildDarwinCoreCsv = (observations: Observation[]): string => {
    const lines: string[] = [];
    lines.push(DWC_HEADERS.map(h => escapeCsvCell(h)).join(','));
    observations.forEach(obs => {
        const row = buildDwcRow(obs);
        lines.push(DWC_HEADERS.map(h => escapeCsvCell(row[h])).join(','));
    });
    return lines.join('\n');
};

const exportDarwinCore = (exportData: Observation[]) => {
    const csv = buildDarwinCoreCsv(exportData);
    const BOM = '\uFEFF';
    const blob = new Blob([BOM + csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', 'observations_darwincore.csv');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
};

// ---- GeoJSON export (VP-14) ----

export interface GeoJsonFeatureCollection {
    type: 'FeatureCollection';
    features: Array<{
        type: 'Feature';
        geometry: { type: 'Point'; coordinates: [number, number] };
        properties: Record<string, unknown>;
    }>;
}

export const buildGeoJson = (observations: Observation[]): GeoJsonFeatureCollection => {
    const safeObservations = obfuscateSensitiveObservations(observations);
    const features = safeObservations
        .filter(obs => obs.gps.lat != null && obs.gps.lon != null)
        .map(obs => {
            const { gps: _gps, ...rest } = obs;
            return {
                type: 'Feature' as const,
                geometry: {
                    type: 'Point' as const,
                    coordinates: [obs.gps.lon as number, obs.gps.lat as number] as [number, number],
                },
                properties: rest,
            };
        });
    return { type: 'FeatureCollection', features };
};

const exportGeoJson = (exportData: Observation[]) => {
    const collection = buildGeoJson(exportData);
    const blob = new Blob([JSON.stringify(collection, null, 2)], { type: 'application/geo+json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', 'observations.geojson');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
};

export const runObservationExport = async (type: ObservationExportType, exportData: Observation[]) => {
    if (type === 'json') {
        exportJson(exportData);
        return;
    }

    if (type === 'excel') {
        await exportExcel(exportData);
        return;
    }

    if (type === 'darwincore') {
        exportDarwinCore(exportData);
        return;
    }

    if (type === 'geojson') {
        exportGeoJson(exportData);
        return;
    }

    await exportPdf(exportData);
};
