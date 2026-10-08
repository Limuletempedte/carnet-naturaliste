import { isUuid, generateUUID } from '../utils/uuidUtils';
import { Observation, TaxonomicGroup, Status, Protocol, Sexe, Age, ObservationCondition, Comportement, WeatherCondition, Habitat, Phenology } from '../types';
import { dateToIsoLocal, isIsoDateString } from '../utils/dateUtils';
import { logger } from '../utils/logger';
import { preflightExcel } from './boundedZip';

// Lazy-loaded ExcelJS module (SE-13: replaced vulnerable xlsx with exceljs)
let _ExcelJS: typeof import('exceljs') | null = null;
const loadExcelJS = async () => {
    if (!_ExcelJS) _ExcelJS = await import('exceljs');
    return _ExcelJS;
};

/** Normalize ExcelJS cell value to a plain JS value */
const normalizeCellValue = (value: unknown): unknown => {
    if (value === null || value === undefined) return '';
    if (value instanceof Date) return value;
    if (typeof value === 'object' && value !== null) {
        if ('result' in value) return (value as { result: unknown }).result;
        if ('richText' in value) {
            return (value as { richText: Array<{ text: string }> }).richText
                .map(r => r.text).join('');
        }
    }
    return value;
};

/** Convert Excel serial date number to JS Date */
const excelSerialToDate = (serial: number): Date => {
    // Excel epoch: Jan 0, 1900 (with Lotus 1-2-3 leap year bug)
    return new Date(Date.UTC(1899, 11, 30) + serial * 86400000);
};

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

const todayIso = (): string => dateToIsoLocal(new Date());

const MAX_IMPORT_ROWS = 10_000;
const MAX_IMPORT_FILE_BYTES = 15 * 1024 * 1024;
const MAX_IMPORT_COLUMNS = 120;
const IMPORT_PARSE_TIMEOUT_MS = 30_000;
const DANGEROUS_OBJECT_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

const isNonEmptyCell = (value: unknown): boolean => {
    if (value === null || value === undefined) return false;
    return String(value).trim() !== '';
};

const normalizeHeader = (value: string): string => {
    return normalize(value.replace(/[_-]+/g, ' '));
};

const isDangerousObjectKey = (key: string): boolean => DANGEROUS_OBJECT_KEYS.has(key);

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
    maleCount: ['Mâles', 'Males', 'Male', 'Nb mâles', 'Nb males'],
    femaleCount: ['Femelles', 'Female', 'Nb femelles'],
    unidentifiedCount: ['Non identifiés', 'Non identifies', 'Non identifié', 'Non identifie', 'Nb non identifiés', 'Nb non identifies'],
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
    comment: ['Commentaire', 'Commentaires', 'Comment', 'Notes', 'Note'],
    weather: ['Conditions météo', 'Conditions meteo', 'Météo', 'Meteo', 'Weather'],
    // H12 : colonnes écrites par l'export mais absentes ici → un aller-retour
    // export→import les remettait à null en base (mode merge). Alias ajoutés.
    habitat: ['Habitat'],
    phenology: ['Phénologie', 'Phenologie', 'Phenology'],
    observers: ['Observateurs', 'Observers', 'Observateur']
};

const buildNormalizedRow = (rawRow: Record<string, unknown>): Record<string, unknown> => {
    const row = Object.create(null) as Record<string, unknown>;
    Object.keys(rawRow).forEach(key => {
        if (isDangerousObjectKey(key)) {
            return;
        }
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

const hasAnyAlias = (normalizedHeaders: Set<string>, aliases: string[]): boolean => {
    return aliases.some(alias => normalizedHeaders.has(normalizeHeader(alias)));
};

// ─── Main Parse Function ────────────────────────────────────────────────────

export const parseExcel = async (file: File): Promise<ImportResult> => {
    try { await preflightExcel(file); }
    catch (error) { return createBlockingResult(error instanceof Error ? error.message : 'Classeur refusé.', file.name); }
    const ExcelJS = await loadExcelJS();
    return new Promise((resolve) => {
        let settled = false;
        let timeoutId: ReturnType<typeof setTimeout> | null = null;
        const safeResolve = (result: ImportResult) => {
            if (settled) return;
            settled = true;
            if (timeoutId) {
                globalThis.clearTimeout(timeoutId);
            }
            resolve(result);
        };

        if (file.size > MAX_IMPORT_FILE_BYTES) {
            logger.warn(`[security][excel-import] Import bloqué: fichier trop volumineux (${file.size} bytes).`);
            safeResolve(createBlockingResult(
                `Le fichier dépasse la taille maximale autorisée (${Math.round(MAX_IMPORT_FILE_BYTES / (1024 * 1024))} Mo).`,
                `${file.name} (${file.size} bytes)`
            ));
            return;
        }

        const reader = new FileReader();

        timeoutId = globalThis.setTimeout(() => {
            logger.warn(`[security][excel-import] Import interrompu après ${IMPORT_PARSE_TIMEOUT_MS}ms.`);
            reader.abort();
            safeResolve(createBlockingResult(
                'Le parsing du fichier a expiré (timeout). Réduisez la taille du fichier ou découpez-le.',
                file.name
            ));
        }, IMPORT_PARSE_TIMEOUT_MS);

        reader.onload = async (e) => {
            try {
                const data = e.target?.result;
                if (!data || !(data instanceof ArrayBuffer)) {
                    safeResolve(createBlockingResult('Impossible de lire le fichier Excel.', file.name));
                    return;
                }

                const workbook = new ExcelJS.Workbook();
                await workbook.xlsx.load(data);

                const worksheet = workbook.worksheets[0];
                if (!worksheet || worksheet.rowCount === 0) {
                    safeResolve(createBlockingResult('Aucune feuille trouvée dans le fichier Excel.', file.name));
                    return;
                }

                // PE-13: ExcelJS's `getRow(r).getCell(c)` per-cell access scales so badly in
                // the browser that a ~380-row × 29-col file exceeds the 20 s timeout. Using
                // `getSheetValues()` once returns every cell in a single pass (~1 ms for the
                // same file) — same data, no blocking parse.
                // Shape: sheetValues[rowNum][colNum] (1-indexed, [0] is padding).
                const sheetValues = worksheet.getSheetValues() as Array<Array<unknown> | undefined>;

                const headerCells = sheetValues[1];
                const headers: string[] = [];
                if (headerCells) {
                    for (let col = 1; col < headerCells.length; col++) {
                        headers[col] = String(normalizeCellValue(headerCells[col]) ?? '').trim();
                    }
                }

                if (headers.length === 0) {
                    safeResolve(createBlockingResult('Feuille Excel introuvable ou illisible.', file.name));
                    return;
                }

                const rawRows: Record<string, unknown>[] = [];
                for (let rowIdx = 2; rowIdx < sheetValues.length; rowIdx++) {
                    const rowCells = sheetValues[rowIdx];
                    const record: Record<string, unknown> = {};
                    if (rowCells) {
                        for (let colIdx = 1; colIdx < headers.length; colIdx++) {
                            const header = headers[colIdx];
                            if (header) {
                                record[header] = normalizeCellValue(rowCells[colIdx]);
                            }
                        }
                    }
                    rawRows.push(record);
                }

                const rawHeaders = headers.filter(h => h !== '' && h !== undefined);

                if (rawHeaders.some(isDangerousObjectKey)) {
                    logger.warn('[security][excel-import] En-têtes potentiellement dangereux détectés, import rejeté.');
                    safeResolve(createBlockingResult(
                        'Le fichier contient des en-têtes non autorisés.',
                        rawHeaders.join(', ')
                    ));
                    return;
                }

                if (rawHeaders.length > MAX_IMPORT_COLUMNS) {
                    logger.warn(`[security][excel-import] Import bloqué: ${rawHeaders.length} colonnes détectées.`);
                    safeResolve(createBlockingResult(
                        `Le fichier contient trop de colonnes (${rawHeaders.length}, max: ${MAX_IMPORT_COLUMNS}).`,
                        file.name
                    ));
                    return;
                }

                const normalizedHeaders = new Set(rawHeaders.map(normalizeHeader));
                const hasSpeciesColumn = hasAnyAlias(normalizedHeaders, HEADER_ALIASES.speciesName);
                const hasDateColumn = hasAnyAlias(normalizedHeaders, HEADER_ALIASES.date);
                if (!hasSpeciesColumn || !hasDateColumn) {
                    logger.warn('[security][excel-import] Import bloqué: colonnes obligatoires manquantes.');
                    safeResolve(createBlockingResult(
                        "Colonnes obligatoires manquantes (au minimum: nom d'espèce et date).",
                        file.name
                    ));
                    return;
                }

                const indexedRows = rawRows
                    .map((row, index) => ({ row, rowNum: index + 2 }))
                    .filter(({ row }) => Object.values(row).some(isNonEmptyCell));

                if (indexedRows.length === 0) {
                    safeResolve(createBlockingResult('Le fichier ne contient aucune ligne exploitable.', file.name));
                    return;
                }

                if (indexedRows.length > MAX_IMPORT_ROWS) {
                    safeResolve(createBlockingResult(
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
                        id = generateUUID();
                    }
                    seenIds.add(id);

                    // ── Numeric parsing (zero-safe) ──
                    const parsedCount = parseFlexibleNumber(getRowValue(row, HEADER_ALIASES.count));
                    const count = parsedCount === null ? 1 : Math.round(parsedCount);
                    const parsedMaleCount = parseFlexibleNumber(getRowValue(row, HEADER_ALIASES.maleCount));
                    const parsedFemaleCount = parseFlexibleNumber(getRowValue(row, HEADER_ALIASES.femaleCount));
                    const parsedUnidentifiedCount = parseFlexibleNumber(getRowValue(row, HEADER_ALIASES.unidentifiedCount));
                    const maleCount = parsedMaleCount === null ? null : Math.round(parsedMaleCount);
                    const femaleCount = parsedFemaleCount === null ? null : Math.round(parsedFemaleCount);
                    const unidentifiedCount = parsedUnidentifiedCount === null ? null : Math.round(parsedUnidentifiedCount);

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
                    const weather = mapEnum(getRowValue(row, HEADER_ALIASES.weather), WeatherCondition, WEATHER_SYNONYMS, WeatherCondition.UNKNOWN, 'Conditions météo', rowNum, warnings);

                    // H12 : habitat / phénologie / observateurs (optionnels — undefined
                    // si absents ou non reconnus, comme l'import JSON, pour ne pas
                    // écraser des valeurs existantes).
                    const habitatRaw = toText(getRowValue(row, HEADER_ALIASES.habitat));
                    const habitat = (Object.values(Habitat) as string[]).includes(habitatRaw) ? (habitatRaw as Habitat) : undefined;
                    const phenologyRaw = toText(getRowValue(row, HEADER_ALIASES.phenology));
                    const phenology = (Object.values(Phenology) as string[]).includes(phenologyRaw) ? (phenologyRaw as Phenology) : undefined;
                    const observersText = toText(getRowValue(row, HEADER_ALIASES.observers));
                    const observersList = observersText
                        ? observersText.split('|').map(s => s.trim()).filter(s => s.length > 0)
                        : [];
                    const observers = observersList.length > 0 ? observersList : undefined;

                    // ── Validation ──
                    const speciesName = toText(getRowValue(row, HEADER_ALIASES.speciesName));
                    if (!speciesName) {
                        warnings.push({ row: rowNum, field: "Nom de l'espèce", message: "Nom d'espèce vide", original: '', applied: 'Espèce inconnue' });
                    }

                    const safeLat = lat !== null && (lat < -90 || lat > 90) ? null : lat;
                    const safeLon = lon !== null && (lon < -180 || lon > 180) ? null : lon;
                    const safeCount = count < 1 ? 1 : count;
                    const safeMaleCount = maleCount !== null && maleCount < 0 ? null : maleCount;
                    const safeFemaleCount = femaleCount !== null && femaleCount < 0 ? null : femaleCount;
                    const safeUnidentifiedCount = unidentifiedCount !== null && unidentifiedCount < 0 ? null : unidentifiedCount;
                    if (lat !== safeLat) {
                        warnings.push({ row: rowNum, field: 'Latitude', message: 'Latitude hors limites [-90, 90], valeur annulée', original: String(lat), applied: 'null' });
                    }
                    if (lon !== safeLon) {
                        warnings.push({ row: rowNum, field: 'Longitude', message: 'Longitude hors limites [-180, 180], valeur annulée', original: String(lon), applied: 'null' });
                    }
                    if (count !== safeCount) {
                        warnings.push({ row: rowNum, field: 'Nombre', message: 'Nombre invalide (<1), fallback à 1', original: String(count), applied: '1' });
                    }
                    if (maleCount !== safeMaleCount) {
                        warnings.push({ row: rowNum, field: 'Mâles', message: 'Nombre invalide (<0), valeur annulée', original: String(maleCount), applied: 'null' });
                    }
                    if (femaleCount !== safeFemaleCount) {
                        warnings.push({ row: rowNum, field: 'Femelles', message: 'Nombre invalide (<0), valeur annulée', original: String(femaleCount), applied: 'null' });
                    }
                    if (unidentifiedCount !== safeUnidentifiedCount) {
                        warnings.push({ row: rowNum, field: 'Non identifiés', message: 'Nombre invalide (<0), valeur annulée', original: String(unidentifiedCount), applied: 'null' });
                    }

                    const hasCountBreakdown = safeMaleCount !== null || safeFemaleCount !== null || safeUnidentifiedCount !== null;
                    const breakdownSum = (safeMaleCount ?? 0) + (safeFemaleCount ?? 0) + (safeUnidentifiedCount ?? 0);
                    const hasValidBreakdown = !hasCountBreakdown || breakdownSum === safeCount;

                    if (!hasValidBreakdown) {
                        warnings.push({
                            row: rowNum,
                            field: 'Répartition',
                            message: `Somme mâles(${safeMaleCount ?? 0})+femelles(${safeFemaleCount ?? 0})+indét.(${safeUnidentifiedCount ?? 0})=${breakdownSum} ≠ total(${safeCount}), répartition ignorée`,
                            original: `${safeMaleCount ?? ''}/${safeFemaleCount ?? ''}/${safeUnidentifiedCount ?? ''}`,
                            applied: '(répartition vidée)'
                        });
                    }

                    return {
                        id,
                        speciesName: speciesName || 'Espèce inconnue',
                        latinName: toText(getRowValue(row, HEADER_ALIASES.latinName)),
                        taxonomicGroup,
                        date: parseDate(getRowValue(row, HEADER_ALIASES.date), rowNum, warnings),
                        time: parseTime(getRowValue(row, HEADER_ALIASES.time), rowNum, warnings),
                        count: safeCount,
                        maleCount: hasValidBreakdown ? (safeMaleCount ?? undefined) : undefined,
                        femaleCount: hasValidBreakdown ? (safeFemaleCount ?? undefined) : undefined,
                        unidentifiedCount: hasValidBreakdown ? (safeUnidentifiedCount ?? undefined) : undefined,
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
                        weather,
                        comment: toText(getRowValue(row, HEADER_ALIASES.comment)),
                        habitat,
                        phenology,
                        observers,
                        photo: undefined,
                        sound: undefined,
                        wikipediaImage: undefined
                    };
                });

                safeResolve({
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
                logger.error("Excel parse error:", error);
                safeResolve(createBlockingResult(
                    "Impossible de lire le fichier Excel (format invalide ou fichier corrompu).",
                    error instanceof Error ? error.message : String(error)
                ));
            }
        };

        reader.onerror = () => {
            safeResolve(createBlockingResult("Impossible de lire le fichier Excel.", file.name));
        };
        reader.readAsArrayBuffer(file);
    });
};

// ─── Generic Enum Mapper (accent/case insensitive + synonyms) ───────────────

function mapEnum<T extends string>(
    value: unknown,
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
    // Les valeurs du fichier ne doivent pas lire le prototype (constructor, __proto__).
    if (Object.prototype.hasOwnProperty.call(synonyms, normalized)) return synonyms[normalized];

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

const WEATHER_SYNONYMS: Record<string, WeatherCondition> = {
    'ensoleille': WeatherCondition.SUNNY, 'soleil': WeatherCondition.SUNNY, 'sunny': WeatherCondition.SUNNY,
    'partiellement nuageux': WeatherCondition.PARTLY_CLOUDY, 'partly cloudy': WeatherCondition.PARTLY_CLOUDY,
    'couvert': WeatherCondition.CLOUDY, 'nuageux': WeatherCondition.CLOUDY, 'cloudy': WeatherCondition.CLOUDY,
    'pluie legere': WeatherCondition.LIGHT_RAIN, 'bruine': WeatherCondition.LIGHT_RAIN,
    'pluie': WeatherCondition.RAIN, 'rain': WeatherCondition.RAIN,
    'pluie forte': WeatherCondition.HEAVY_RAIN, 'averse': WeatherCondition.HEAVY_RAIN,
    'neige': WeatherCondition.SNOW, 'snow': WeatherCondition.SNOW,
    'brouillard': WeatherCondition.FOG, 'brume': WeatherCondition.FOG, 'fog': WeatherCondition.FOG,
    'venteux': WeatherCondition.WIND, 'vent': WeatherCondition.WIND, 'windy': WeatherCondition.WIND,
    'orage': WeatherCondition.STORM, 'storm': WeatherCondition.STORM,
    'gel': WeatherCondition.FROST, 'givre': WeatherCondition.FROST, 'frost': WeatherCondition.FROST,
};

const PROTOCOL_SYNONYMS: Record<string, Protocol> = {
    'opportuniste': Protocol.OPPORTUNIST,
    'stoc': Protocol.STOC_EPS, 'stoc eps': Protocol.STOC_EPS,
    'epoc': Protocol.EPOC,
    'autre': Protocol.OTHER,
};

// ─── Taxonomic Group Mapper (complete for app groups) ────────────────────────

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
    { keywords: ['fourmi', 'formicidae'], group: TaxonomicGroup.ANT },
    { keywords: ['hymenoptere', 'abeille', 'guepe', 'bourdon'], group: TaxonomicGroup.HYMENOPTERA },
    { keywords: ['mante', 'mante religieuse'], group: TaxonomicGroup.MANTIS },
    { keywords: ['cigale', 'cicadidae'], group: TaxonomicGroup.CICADA },
    { keywords: ['punaise', 'heteroptere'], group: TaxonomicGroup.HETEROPTERA },
    { keywords: ['coleoptere', 'scarabee', 'coccinelle', 'lucane', 'carabe'], group: TaxonomicGroup.COLEOPTERA },
    { keywords: ['nevroptere', 'neuroptere', 'chrysope', 'fourmilion'], group: TaxonomicGroup.NEUROPTERA },
    { keywords: ['diptere', 'mouche', 'moustique', 'syrphe', 'tipule'], group: TaxonomicGroup.DIPTERA },
    { keywords: ['phasme'], group: TaxonomicGroup.PHASMID },
    { keywords: ['dermaptere', 'dermatere', 'perce-oreille', 'forficule'], group: TaxonomicGroup.DERMAPTERA },
    { keywords: ['scorpion', 'scorpions'], group: TaxonomicGroup.SCORPION },
    { keywords: ['araignee', 'arachnide', 'opilion'], group: TaxonomicGroup.ARACHNID },
    { keywords: ['poisson', 'ichtyofaune'], group: TaxonomicGroup.FISH },
    { keywords: ['branchiopode', 'branchiopoda', 'daphnie', 'triops', 'artemie'], group: TaxonomicGroup.BRANCHIOPOD },
    { keywords: ['crustace', 'ecrevisse', 'crevette', 'crabe'], group: TaxonomicGroup.CRUSTACEAN },
    { keywords: ['gasteropode', 'gastropode', 'escargot', 'limace'], group: TaxonomicGroup.GASTROPOD },
    { keywords: ['bivalve', 'bivalvia', 'moule', 'huitre', 'coquille saint-jacques', 'palourde'], group: TaxonomicGroup.BIVALVE },
    { keywords: ['orchidee', 'orchis', 'ophrys'], group: TaxonomicGroup.ORCHID },
    { keywords: ['lichen', 'lichens', 'lichenise', 'lichenisee'], group: TaxonomicGroup.LICHEN },
    { keywords: ['champignon', 'champignons', 'mycologie', 'mycelium', 'fungi', 'basidiomycete', 'ascomycete'], group: TaxonomicGroup.MUSHROOM },
    { keywords: ['arbre', 'arbres', 'arboriculture', 'sylviculture', 'forestier'], group: TaxonomicGroup.TREE },
    { keywords: ['botanique', 'plante', 'flore', 'arbuste', 'fleur', 'fougere'], group: TaxonomicGroup.BOTANY },
];

const mapTaxonomicGroup = (value: unknown, rowNum: number, warnings: ImportWarning[]): TaxonomicGroup => {
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

const parseTime = (value: unknown, rowNum?: number, warnings?: ImportWarning[]): string => {
    // BUG-07 : heure absente -> '' (heure inconnue), comme l'import JSON. Ne pas
    // fabriquer « 12:00 » : une heure d'observation inventée est une donnée
    // scientifique fausse (phénologie, pics d'activité).
    if (!value && value !== 0) return '';

    // Handle JS Date object (from cellDates: true).
    // H11 : ExcelJS désérialise en Date basée UTC (epoch Date.UTC) — lire avec
    // getUTC* pour ne pas décaler l'heure selon le fuseau de l'utilisateur.
    if (value instanceof Date) {
        const h = value.getUTCHours().toString().padStart(2, '0');
        const m = value.getUTCMinutes().toString().padStart(2, '0');
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
    // HH:MM or HH:MM:SS (seconds dropped — the model stores minutes only)
    const colonMatch = str.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
    if (colonMatch) {
        return `${colonMatch[1].padStart(2, '0')}:${colonMatch[2]}`;
    }
    if (/^\d{1,2}[hH]\d{0,2}$/.test(str)) {
        const parts = str.split(/[hH]/);
        return `${parts[0].padStart(2, '0')}:${(parts[1] || '00').padStart(2, '0')}`;
    }

    // BUG-07 : format non reconnu -> heure inconnue ('') + avertissement, plutôt
    // qu'une heure fabriquée silencieusement.
    if (warnings && rowNum !== undefined) {
        warnings.push({ row: rowNum, field: 'Heure', message: 'Format d\'heure non reconnu, heure laissée vide', original: str, applied: '(vide)' });
    }
    return '';
};

// ─── Date Parser ────────────────────────────────────────────────────────────

const isValidIsoDate = (value: string): boolean => {
    return isIsoDateString(value);
};

const parseDate = (excelDate: unknown, rowNum: number, warnings: ImportWarning[]): string => {
    if (!excelDate) return todayIso();

    // Handle JS Date object (from cellDates: true).
    // H11 : ExcelJS désérialise en Date basée UTC — lire avec getUTC* (comme la
    // branche « serial » ci-dessous) pour ne pas décaler la date d'un jour selon
    // le fuseau (ex. UTC-4 : « 10/06/2026 » devenait « 09/06/2026 »).
    if (excelDate instanceof Date) {
        if (Number.isNaN(excelDate.getTime())) {
            warnings.push({ row: rowNum, field: 'Date', message: 'Date invalide, fallback date du jour', original: String(excelDate), applied: todayIso() });
            return todayIso();
        }
        return `${excelDate.getUTCFullYear()}-${String(excelDate.getUTCMonth() + 1).padStart(2, '0')}-${String(excelDate.getUTCDate()).padStart(2, '0')}`;
    }

    // Handle Excel serial date (fallback)
    if (typeof excelDate === 'number') {
        const jsDate = excelSerialToDate(excelDate);
        if (Number.isNaN(jsDate.getTime()) || jsDate.getUTCFullYear() < 1900) {
            warnings.push({ row: rowNum, field: 'Date', message: 'Date invalide, fallback date du jour', original: String(excelDate), applied: todayIso() });
            return todayIso();
        }
        return `${jsDate.getUTCFullYear()}-${String(jsDate.getUTCMonth() + 1).padStart(2, '0')}-${String(jsDate.getUTCDate()).padStart(2, '0')}`;
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
