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
    blockingErrors: ImportError[];
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

const MAX_IMPORT_ROWS = 10_000;

const isNonEmptyCell = (value: unknown): boolean => {
    if (value === null || value === undefined) return false;
    return String(value).trim() !== '';
};

const normalizeHeader = (value: string): string => {
    return normalize(value.replace(/[_-]+/g, ' '));
};

const toText = (value: unknown): string => {
    if (value === null || value === undefined) return '';
    return String(value).trim();
};

const parseFlexibleNumber = (value: unknown): number | null => {
    if (value === null || value === undefined) return null;
    if (typeof value === 'number') return Number.isFinite(value) ? value : null;

    const raw = String(value).trim();
    if (!raw) return null;

    const normalized = raw.replace(/\s+/g, '').replace(',', '.');
    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : null;
};

const HEADER_ALIASES: Record<string, string[]> = {
    id: ['ID', 'Id', 'identifiant'],
    speciesName: ["Nom de l'espèce", 'Nom espece', 'Espèce', 'Espece', 'Species', 'Species Name'],
    latinName: ['Nom latin', 'Latin', 'Latin name'],
    taxonomicGroup: ['Groupe taxonomique', 'Groupe', 'Taxon', 'Taxonomic group'],
    date: ['Date', "Date d'observation", 'Observation date'],
    time: ['Heure', 'Horaire', 'Time'],
    count: ['Nombre', 'Nb', 'Effectif', 'Count'],
    location: ['Lieu-dit', 'Lieu dit', 'Lieu', 'Site', 'Localite', 'Localité'],
    lat: ['Latitude', 'Lat'],
    lon: ['Longitude', 'Lon', 'Lng'],
    municipality: ['Commune', 'Ville', 'Municipalité', 'Municipalite', 'Municipality'],
    department: ['Département', 'Departement', 'Dept', 'Department'],
    country: ['Pays', 'Country'],
    altitude: ['Altitude', 'Alt'],
    status: ['Statut', 'Status'],
    atlasCode: ['Code Atlas', 'Atlas', 'Atlas code'],
    protocol: ['Protocole', 'Protocol'],
    sexe: ['Sexe', 'Sex', 'Genre'],
    age: ['Age', 'Âge'],
    observationCondition: ["Condition d'observation", 'Condition observation', 'Condition'],
    comportement: ['Comportement', 'Comportement observé', 'Behavior', 'Behaviour'],
    comment: ['Commentaire', 'Commentaires', 'Comment', 'Notes', 'Note']
};

const buildNormalizedRow = (rawRow: Record<string, unknown>): Record<string, unknown> => {
    const row: Record<string, unknown> = {};
    Object.keys(rawRow).forEach(key => {
        row[normalizeHeader(key)] = rawRow[key];
    });
    return row;
};

const getRowValue = (row: Record<string, unknown>, aliases: string[]): unknown => {
    for (const alias of aliases) {
        const value = row[normalizeHeader(alias)];
        if (value !== undefined) return value;
    }
    return undefined;
};

const createBlockingResult = (
    message: string,
    original: string,
    totalRows = 0
): ImportResult => ({
    observations: [],
    report: {
        totalRows,
        validRows: 0,
        warnings: [],
        errors: [],
        blockingErrors: [{
            row: 0,
            field: 'Fichier',
            message,
            original
        }],
        idCollisions: 0
    }
});

// ─── Main Parse Function ────────────────────────────────────────────────────

export const parseExcel = async (file: File): Promise<ImportResult> => {
    return new Promise((resolve) => {
        const reader = new FileReader();

        reader.onload = (e) => {
            try {
                const data = e.target?.result;
                const workbook = XLSX.read(data, { type: 'array', cellDates: true });
                const sheetName = workbook.SheetNames[0];
                if (!sheetName) {
                    resolve(createBlockingResult('Aucune feuille trouvée dans le fichier Excel.', file.name));
                    return;
                }

                const worksheet = workbook.Sheets[sheetName];
                if (!worksheet) {
                    resolve(createBlockingResult('Feuille Excel introuvable ou illisible.', sheetName));
                    return;
                }

                const rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(worksheet, { defval: '' });
                const indexedRows = rawRows
                    .map((row, index) => ({ row, rowNum: index + 2 }))
                    .filter(({ row }) => Object.values(row).some(isNonEmptyCell));

                if (indexedRows.length === 0) {
                    resolve(createBlockingResult('Le fichier ne contient aucune ligne exploitable.', file.name));
                    return;
                }

                if (indexedRows.length > MAX_IMPORT_ROWS) {
                    resolve(createBlockingResult(
                        `Le fichier contient ${indexedRows.length} lignes (max: ${MAX_IMPORT_ROWS}).`,
                        file.name,
                        indexedRows.length
                    ));
                    return;
                }

                const warnings: ImportWarning[] = [];
                const errors: ImportError[] = [];
                let idCollisions = 0;

                // Track IDs already seen for per-line collision detection
                const seenIds = new Set<string>();

                const observations: Observation[] = indexedRows.map(({ row: rawRow, rowNum }) => {
                    const row = buildNormalizedRow(rawRow);

                    // ── ID handling (per-line collision) ──
                    const rawId = getRowValue(row, HEADER_ALIASES.id);
                    let id = toText(rawId);

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
                    const parsedCount = parseFlexibleNumber(getRowValue(row, HEADER_ALIASES.count));
                    const count = parsedCount === null ? 1 : Math.round(parsedCount);

                    const lat = parseFlexibleNumber(getRowValue(row, HEADER_ALIASES.lat));
                    const lon = parseFlexibleNumber(getRowValue(row, HEADER_ALIASES.lon));
                    const altitude = parseFlexibleNumber(getRowValue(row, HEADER_ALIASES.altitude));

                    // ── Enum mapping with warnings ──
                    const taxonomicGroup = mapTaxonomicGroup(getRowValue(row, HEADER_ALIASES.taxonomicGroup), rowNum, warnings);
                    const status = mapEnum(getRowValue(row, HEADER_ALIASES.status), Status, STATUS_SYNONYMS, Status.NE, 'Statut', rowNum, warnings);
                    const protocol = mapEnum(getRowValue(row, HEADER_ALIASES.protocol), Protocol, PROTOCOL_SYNONYMS, Protocol.OPPORTUNIST, 'Protocole', rowNum, warnings);
                    const sexe = mapEnum(getRowValue(row, HEADER_ALIASES.sexe), Sexe, SEXE_SYNONYMS, Sexe.UNKNOWN, 'Sexe', rowNum, warnings);
                    const age = mapEnum(getRowValue(row, HEADER_ALIASES.age), Age, AGE_SYNONYMS, Age.UNKNOWN, 'Age', rowNum, warnings);
                    const observationCondition = mapEnum(getRowValue(row, HEADER_ALIASES.observationCondition), ObservationCondition, {}, ObservationCondition.UNKNOWN, "Condition d'observation", rowNum, warnings);
                    const comportement = mapEnum(getRowValue(row, HEADER_ALIASES.comportement), Comportement, {}, Comportement.UNKNOWN, 'Comportement', rowNum, warnings);

                    // ── Validation ──
                    const speciesName = toText(getRowValue(row, HEADER_ALIASES.speciesName));
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
                        latinName: toText(getRowValue(row, HEADER_ALIASES.latinName)),
                        taxonomicGroup,
                        date: parseDate(getRowValue(row, HEADER_ALIASES.date), rowNum, warnings),
                        time: parseTime(getRowValue(row, HEADER_ALIASES.time)),
                        count: safeCount,
                        location: toText(getRowValue(row, HEADER_ALIASES.location)),
                        gps: { lat: safeLat, lon: safeLon },
                        municipality: toText(getRowValue(row, HEADER_ALIASES.municipality)),
                        department: toText(getRowValue(row, HEADER_ALIASES.department)),
                        country: toText(getRowValue(row, HEADER_ALIASES.country)) || 'France',
                        altitude,
                        status,
                        atlasCode: toText(getRowValue(row, HEADER_ALIASES.atlasCode)),
                        protocol,
                        sexe,
                        age,
                        observationCondition,
                        comportement,
                        comment: toText(getRowValue(row, HEADER_ALIASES.comment)),
                        photo: undefined,
                        sound: undefined,
                        wikipediaImage: undefined
                    };
                });

                resolve({
                    observations,
                    report: {
                        totalRows: indexedRows.length,
                        validRows: observations.length,
                        warnings,
                        errors,
                        blockingErrors: [],
                        idCollisions
                    }
                });
            } catch (error) {
                console.error("Excel parse error:", error);
                resolve(createBlockingResult(
                    "Impossible de lire le fichier Excel (format invalide ou fichier corrompu).",
                    error instanceof Error ? error.message : String(error)
                ));
            }
        };

        reader.onerror = () => {
            resolve(createBlockingResult("Impossible de lire le fichier Excel.", file.name));
        };
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
