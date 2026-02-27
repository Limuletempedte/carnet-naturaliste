import * as XLSX from 'xlsx';
import { Observation, TaxonomicGroup, Status, Protocol, Sexe, Age, ObservationCondition, Comportement } from '../types';
import { dateToIsoLocal, isIsoDateString } from '../utils/dateUtils';

// ─── Import Report Types ────────────────────────────────────────────────────

export interface ImportWarning {
    row: number;
    field: string;
    message: string;
    original: string;
    applied: string;
}

export interface ImportError {
    row: number;
    field: string;
    message: string;
    original: string;
}

export interface ImportReport {
    totalRows: number;
    validRows: number;
    warnings: ImportWarning[];
    errors: ImportError[];
    idCollisions: number;
}

export interface ImportResult {
    observations: Observation[];
    report: ImportReport;
}

// ─── Normalize utility ──────────────────────────────────────────────────────

/** Strips accents, trims, lowercases, and compacts whitespace */
const normalize = (s: string | undefined | null): string =>
    (s ?? '').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ');

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const isUuid = (value: unknown): value is string => {
    return typeof value === 'string' && UUID_RE.test(value.trim());
};

const todayIso = (): string => dateToIsoLocal(new Date());

// ─── Main Parse Function ────────────────────────────────────────────────────

export const parseExcel = async (file: File): Promise<ImportResult> => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();

        reader.onload = (e) => {
            try {
                const data = e.target?.result;
                const workbook = XLSX.read(data, { type: 'array', cellDates: true });
                const sheetName = workbook.SheetNames[0];
                const worksheet = workbook.Sheets[sheetName];
                const jsonData = XLSX.utils.sheet_to_json(worksheet);

                // Guard: reject files that are too large
                const MAX_IMPORT_ROWS = 10_000;
                if (jsonData.length > MAX_IMPORT_ROWS) {
                    reject(new Error(`Le fichier contient ${jsonData.length} lignes (max: ${MAX_IMPORT_ROWS}).`));
                    return;
                }

                const warnings: ImportWarning[] = [];
                let idCollisions = 0;

                // Track IDs already seen for per-line collision detection
                const seenIds = new Set<string>();

                const observations: Observation[] = jsonData.map((rawRow: any, rowIndex: number) => {
                    const rowNum = rowIndex + 2; // +2 because row 1 is header, data starts at 2

                    // Normalize keys to handle potential trailing spaces
                    const row: any = {};
                    Object.keys(rawRow).forEach(key => {
                        row[key.trim()] = rawRow[key];
                    });

                    // ── ID handling (per-line collision) ──
                    let id = (row['ID'] && String(row['ID']).trim() !== '') ? String(row['ID']).trim() : '';

                    if (id !== '' && !isUuid(id)) {
                        warnings.push({ row: rowNum, field: 'ID', message: 'ID non UUID, nouveau UUID généré', original: id, applied: '(nouveau UUID)' });
                        id = '';
                    }

                    if (id === '' || seenIds.has(id)) {
                        if (id !== '' && seenIds.has(id)) {
                            idCollisions++;
                            warnings.push({ row: rowNum, field: 'ID', message: 'ID en doublon, nouveau UUID généré', original: id, applied: '(nouveau UUID)' });
                        }
                        id = crypto.randomUUID();
                    }
                    seenIds.add(id);

                    // ── Numeric parsing (zero-safe) ──
                    const parsedCount = parseInt(String(row["Nombre"] ?? ''), 10);
                    const count = Number.isNaN(parsedCount) ? 1 : parsedCount;

                    const parsedLat = parseFloat(String(row["Latitude"] ?? ''));
                    const lat = Number.isNaN(parsedLat) ? null : parsedLat;

                    const parsedLon = parseFloat(String(row["Longitude"] ?? ''));
                    const lon = Number.isNaN(parsedLon) ? null : parsedLon;

                    const parsedAlt = parseFloat(String(row["Altitude"] ?? ''));
                    const altitude = Number.isNaN(parsedAlt) ? null : parsedAlt;

                    // ── Enum mapping with warnings ──
                    const taxonomicGroup = mapTaxonomicGroup(row["Groupe taxonomique"], rowNum, warnings);
                    const status = mapEnum(row["Statut"], Status, STATUS_SYNONYMS, Status.NE, 'Statut', rowNum, warnings);
                    const protocol = mapEnum(row["Protocole"], Protocol, PROTOCOL_SYNONYMS, Protocol.OPPORTUNIST, 'Protocole', rowNum, warnings);
                    const sexe = mapEnum(row["Sexe"], Sexe, SEXE_SYNONYMS, Sexe.UNKNOWN, 'Sexe', rowNum, warnings);
                    const age = mapEnum(row["Age"], Age, AGE_SYNONYMS, Age.UNKNOWN, 'Age', rowNum, warnings);
                    const observationCondition = mapEnum(row["Condition d'observation"], ObservationCondition, {}, ObservationCondition.UNKNOWN, "Condition d'observation", rowNum, warnings);
                    const comportement = mapEnum(row["Comportement"], Comportement, {}, Comportement.UNKNOWN, 'Comportement', rowNum, warnings);

                    // ── Validation ──
                    const speciesName = row["Nom de l'espèce"] || '';
                    if (!speciesName) {
                        warnings.push({ row: rowNum, field: "Nom de l'espèce", message: "Nom d'espèce vide", original: '', applied: 'Espèce inconnue' });
                    }

                    const safeLat = lat !== null && (lat < -90 || lat > 90) ? null : lat;
                    const safeLon = lon !== null && (lon < -180 || lon > 180) ? null : lon;
                    const safeCount = count < 1 ? 1 : count;

                    if (lat !== safeLat) {
                        warnings.push({ row: rowNum, field: 'Latitude', message: 'Latitude hors limites [-90, 90], valeur annulée', original: String(lat), applied: 'null' });
                    }
                    if (lon !== safeLon) {
                        warnings.push({ row: rowNum, field: 'Longitude', message: 'Longitude hors limites [-180, 180], valeur annulée', original: String(lon), applied: 'null' });
                    }
                    if (count !== safeCount) {
                        warnings.push({ row: rowNum, field: 'Nombre', message: 'Nombre invalide (<1), fallback à 1', original: String(count), applied: '1' });
                    }

                    return {
                        id,
                        speciesName: speciesName || 'Espèce inconnue',
                        latinName: row["Nom latin"] || '',
                        taxonomicGroup,
                        date: parseDate(row["Date"], rowNum, warnings),
                        time: parseTime(row["Heure"]),
                        count: safeCount,
                        location: row["Lieu-dit"] || '',
                        gps: { lat: safeLat, lon: safeLon },
                        municipality: row["Commune"] || '',
                        department: row["Département"] || '',
                        country: row["Pays"] || 'France',
                        altitude,
                        status,
                        atlasCode: row["Code Atlas"] || '',
                        protocol,
                        sexe,
                        age,
                        observationCondition,
                        comportement,
                        comment: row["Commentaire"] || '',
                        photo: undefined,
                        sound: undefined,
                        wikipediaImage: undefined
                    };
                });

                resolve({
                    observations,
                    report: {
                        totalRows: jsonData.length,
                        validRows: observations.length,
                        warnings,
                        errors: [],
                        idCollisions
                    }
                });
            } catch (error) {
                console.error("Excel parse error:", error);
                reject(error);
            }
        };

        reader.onerror = (error) => reject(error);
        reader.readAsArrayBuffer(file);
    });
};

// ─── Generic Enum Mapper (accent/case insensitive + synonyms) ───────────────

function mapEnum<T extends string>(
    value: any,
    enumObj: Record<string, T>,
    synonyms: Record<string, T>,
    fallback: T,
    fieldName: string,
    rowNum: number,
    warnings: ImportWarning[]
): T {
    if (value === undefined || value === null || String(value).trim() === '') return fallback;

    const raw = String(value).trim();

    // 1. Exact match on enum values
    const enumValues = Object.values(enumObj);
    if (enumValues.includes(raw as T)) return raw as T;

    // 2. Normalized match on enum values
    const normalized = normalize(raw);
    for (const ev of enumValues) {
        if (normalize(ev) === normalized) return ev;
    }

    // 3. Synonym lookup
    if (synonyms[normalized]) return synonyms[normalized];

    // 4. Fallback with warning
    warnings.push({ row: rowNum, field: fieldName, message: `Valeur non reconnue, fallback appliqué`, original: raw, applied: fallback });
    return fallback;
}

// ─── Synonym Maps ───────────────────────────────────────────────────────────

const STATUS_SYNONYMS: Record<string, Status> = {
    'ne': Status.NE, 'dd': Status.DD, 'lc': Status.LC, 'nt': Status.NT,
    'vu': Status.VU, 'en': Status.EN, 'cr': Status.CR, 'ew': Status.EW, 'ex': Status.EX,
    'non evalue': Status.NE, 'donnees insuffisantes': Status.DD,
    'preoccupation mineure': Status.LC, 'quasi menace': Status.NT,
    'vulnerable': Status.VU, 'en danger': Status.EN,
    'en danger critique': Status.CR,
};

const SEXE_SYNONYMS: Record<string, Sexe> = {
    'm': Sexe.MALE, 'male': Sexe.MALE, 'masculin': Sexe.MALE,
    'f': Sexe.FEMALE, 'femelle': Sexe.FEMALE, 'feminin': Sexe.FEMALE,
    'inconnu': Sexe.UNKNOWN, 'ind': Sexe.UNKNOWN, 'indetermine': Sexe.UNKNOWN,
};

const AGE_SYNONYMS: Record<string, Age> = {
    'ad': Age.ADULT, 'adulte': Age.ADULT,
    'juv': Age.IMMATURE, 'juvenile': Age.IMMATURE,
    'imm': Age.IMMATURE, 'immature': Age.IMMATURE,
    'poussin': Age.CHICK_NON_FLYING,
    '1a': Age.FIRST_YEAR, '2a': Age.SECOND_YEAR, '3a': Age.THIRD_YEAR,
};

const PROTOCOL_SYNONYMS: Record<string, Protocol> = {
    'opportuniste': Protocol.OPPORTUNIST,
    'stoc': Protocol.STOC_EPS, 'stoc eps': Protocol.STOC_EPS,
    'epoc': Protocol.EPOC,
    'autre': Protocol.OTHER,
};

// ─── Taxonomic Group Mapper (complete for all 25 groups) ────────────────────

const TAXON_KEYWORDS: Array<{ keywords: string[]; group: TaxonomicGroup }> = [
    { keywords: ['chiroptere', 'chauve-souris', 'chauve souris'], group: TaxonomicGroup.CHIROPTERA },
    { keywords: ['mammifere marin', 'cetace', 'dauphin', 'baleine', 'phoque'], group: TaxonomicGroup.MARINE_MAMMAL },
    { keywords: ['mammifere'], group: TaxonomicGroup.MAMMAL },
    { keywords: ['oiseau', 'avifaune', 'passereau', 'rapace'], group: TaxonomicGroup.BIRD },
    { keywords: ['reptile', 'serpent', 'lezard', 'tortue', 'gecko'], group: TaxonomicGroup.REPTILE },
    { keywords: ['amphibien', 'grenouille', 'crapaud', 'triton', 'salamandre'], group: TaxonomicGroup.AMPHIBIAN },
    { keywords: ['odonate', 'libellule', 'demoiselle', 'anisoptere', 'zygoptere'], group: TaxonomicGroup.ODONATE },
    { keywords: ['papillon de nuit', 'heterocere', 'moth'], group: TaxonomicGroup.MOTH },
    { keywords: ['papillon', 'rhopalocere', 'lepidoptere', 'butterfly'], group: TaxonomicGroup.BUTTERFLY },
    { keywords: ['orthoptere', 'sauterelle', 'criquet', 'grillon'], group: TaxonomicGroup.ORTHOPTERA },
    { keywords: ['hymenoptere', 'abeille', 'guepe', 'fourmi', 'bourdon'], group: TaxonomicGroup.HYMENOPTERA },
    { keywords: ['mante', 'mante religieuse'], group: TaxonomicGroup.MANTIS },
    { keywords: ['cigale', 'cicadidae'], group: TaxonomicGroup.CICADA },
    { keywords: ['punaise', 'heteroptere'], group: TaxonomicGroup.HETEROPTERA },
    { keywords: ['coleoptere', 'scarabee', 'coccinelle', 'lucane', 'carabe'], group: TaxonomicGroup.COLEOPTERA },
    { keywords: ['nevroptere', 'neuroptere', 'chrysope', 'fourmilion'], group: TaxonomicGroup.NEUROPTERA },
    { keywords: ['diptere', 'mouche', 'moustique', 'syrphe', 'tipule'], group: TaxonomicGroup.DIPTERA },
    { keywords: ['phasme'], group: TaxonomicGroup.PHASMID },
    { keywords: ['araignee', 'arachnide', 'opilion', 'scorpion'], group: TaxonomicGroup.ARACHNID },
    { keywords: ['poisson', 'ichtyofaune'], group: TaxonomicGroup.FISH },
    { keywords: ['crustace', 'ecrevisse', 'crevette', 'crabe'], group: TaxonomicGroup.CRUSTACEAN },
    { keywords: ['orchidee', 'orchis', 'ophrys'], group: TaxonomicGroup.ORCHID },
    { keywords: ['botanique', 'plante', 'flore', 'arbre', 'arbuste', 'fleur', 'fougere'], group: TaxonomicGroup.BOTANY },
];

const mapTaxonomicGroup = (value: any, rowNum: number, warnings: ImportWarning[]): TaxonomicGroup => {
    if (value === undefined || value === null || String(value).trim() === '') {
        warnings.push({ row: rowNum, field: 'Groupe taxonomique', message: 'Groupe vide, fallback Autre', original: '', applied: TaxonomicGroup.OTHER });
        return TaxonomicGroup.OTHER;
    }

    const raw = String(value).trim();

    // 1. Exact match on enum values
    const exactEntry = Object.entries(TaxonomicGroup).find(([_, v]) => v === raw);
    if (exactEntry) return exactEntry[1] as TaxonomicGroup;

    // 2. Normalized match on enum values
    const normalized = normalize(raw);
    for (const [_, v] of Object.entries(TaxonomicGroup)) {
        if (normalize(v) === normalized) return v as TaxonomicGroup;
    }

    // 3. Keyword search (order matters — more specific groups first)
    for (const { keywords, group } of TAXON_KEYWORDS) {
        if (keywords.some(kw => normalized.includes(kw))) return group;
    }

    // 4. Fallback to OTHER with warning
    warnings.push({ row: rowNum, field: 'Groupe taxonomique', message: 'Groupe non reconnu, fallback Autre', original: raw, applied: TaxonomicGroup.OTHER });
    return TaxonomicGroup.OTHER;
};

// ─── Time Parser ────────────────────────────────────────────────────────────

const parseTime = (value: any): string => {
    if (!value && value !== 0) return '12:00';

    // Handle JS Date object (from cellDates: true)
    if (value instanceof Date) {
        const h = value.getHours().toString().padStart(2, '0');
        const m = value.getMinutes().toString().padStart(2, '0');
        return `${h}:${m}`;
    }

    // Handle Excel numeric time/datetime values.
    // Excel stores time as the fractional part of a day.
    if (typeof value === 'number') {
        const fraction = ((value % 1) + 1) % 1;
        const totalMinutes = Math.round(fraction * 24 * 60) % (24 * 60);
        const hours = Math.floor(totalMinutes / 60).toString().padStart(2, '0');
        const minutes = (totalMinutes % 60).toString().padStart(2, '0');
        return `${hours}:${minutes}`;
    }

    // Handle string time
    const str = String(value).trim();
    if (/^\d{1,2}:\d{2}$/.test(str)) return str;
    if (/^\d{1,2}[hH]\d{0,2}$/.test(str)) {
        const parts = str.split(/[hH]/);
        return `${parts[0].padStart(2, '0')}:${(parts[1] || '00').padStart(2, '0')}`;
    }

    return '12:00';
};

// ─── Date Parser ────────────────────────────────────────────────────────────

const isValidIsoDate = (value: string): boolean => {
    return isIsoDateString(value);
};

const parseDate = (excelDate: any, rowNum: number, warnings: ImportWarning[]): string => {
    if (!excelDate) return todayIso();

    // Handle JS Date object (from cellDates: true)
    if (excelDate instanceof Date) {
        if (Number.isNaN(excelDate.getTime())) {
            warnings.push({ row: rowNum, field: 'Date', message: 'Date invalide, fallback date du jour', original: String(excelDate), applied: todayIso() });
            return todayIso();
        }
        return dateToIsoLocal(excelDate);
    }

    // Handle Excel serial date (fallback)
    if (typeof excelDate === 'number') {
        const parsed = XLSX.SSF.parse_date_code(excelDate);
        if (!parsed || !parsed.y || !parsed.m || !parsed.d) {
            warnings.push({ row: rowNum, field: 'Date', message: 'Date invalide, fallback date du jour', original: String(excelDate), applied: todayIso() });
            return todayIso();
        }
        return `${parsed.y}-${String(parsed.m).padStart(2, '0')}-${String(parsed.d).padStart(2, '0')}`;
    }

    // Handle string date (DD/MM/YYYY or YYYY-MM-DD)
    if (typeof excelDate === 'string') {
        const raw = excelDate.trim();
        if (raw === '') return todayIso();

        if (excelDate.includes('/')) {
            const parts = raw.split('/');
            if (parts.length === 3) {
                // Assume DD/MM/YYYY
                const iso = `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
                if (isValidIsoDate(iso)) return iso;
                warnings.push({ row: rowNum, field: 'Date', message: 'Date invalide, fallback date du jour', original: raw, applied: todayIso() });
                return todayIso();
            }
        }
        if (isValidIsoDate(raw)) return raw;
        warnings.push({ row: rowNum, field: 'Date', message: 'Date invalide, fallback date du jour', original: raw, applied: todayIso() });
        return todayIso();
    }

    return todayIso();
};
