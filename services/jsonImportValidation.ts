import {
    Observation,
    TaxonomicGroup,
    Status,
    Protocol,
    Sexe,
    Age,
    ObservationCondition,
    Comportement
} from '../types';
import { ImportError, ImportResult, ImportWarning } from './excelImportService';
import { isIsoDateString } from '../utils/dateUtils';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

const isRecord = (value: unknown): value is Record<string, unknown> => {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
};

const asString = (value: unknown): string | null => {
    return typeof value === 'string' ? value : null;
};

const asOptionalString = (value: unknown): string | undefined => {
    if (value === undefined || value === null || value === '') return undefined;
    return typeof value === 'string' ? value : undefined;
};

const asNumberOrNull = (value: unknown): number | null | undefined => {
    if (value === null) return null;
    if (value === undefined) return undefined;
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    return undefined;
};

const pushError = (errors: ImportError[], row: number, field: string, message: string, original: unknown) => {
    errors.push({
        row,
        field,
        message,
        original: original === undefined ? '' : String(original)
    });
};

const pushWarning = (warnings: ImportWarning[], row: number, field: string, message: string, original: unknown, applied: string) => {
    warnings.push({
        row,
        field,
        message,
        original: original === undefined ? '' : String(original),
        applied
    });
};

const ensureEnum = <T extends string>(
    value: unknown,
    enumObj: Record<string, T>,
    row: number,
    field: string,
    errors: ImportError[]
): T | null => {
    const str = asString(value);
    if (!str) {
        pushError(errors, row, field, 'Valeur manquante ou non texte', value);
        return null;
    }
    if (!Object.values(enumObj).includes(str as T)) {
        pushError(errors, row, field, 'Valeur non supportée', str);
        return null;
    }
    return str as T;
};

const buildObservationFromRow = (
    rawRow: unknown,
    rowNum: number,
    seenIds: Set<string>,
    warnings: ImportWarning[],
    errors: ImportError[]
): Observation | null => {
    if (!isRecord(rawRow)) {
        pushError(errors, rowNum, 'Ligne', 'Objet JSON invalide', rawRow);
        return null;
    }

    const speciesName = asString(rawRow.speciesName);
    if (!speciesName || speciesName.trim() === '') {
        pushError(errors, rowNum, 'speciesName', 'Nom d’espèce obligatoire', rawRow.speciesName);
        return null;
    }

    const date = asString(rawRow.date);
    if (!date || !isIsoDateString(date)) {
        pushError(errors, rowNum, 'date', 'Date invalide (attendu YYYY-MM-DD)', rawRow.date);
        return null;
    }

    const time = asString(rawRow.time);
    if (!time || !TIME_RE.test(time)) {
        pushError(errors, rowNum, 'time', 'Heure invalide (attendu HH:mm)', rawRow.time);
        return null;
    }

    const count = rawRow.count;
    if (typeof count !== 'number' || !Number.isFinite(count) || count < 1) {
        pushError(errors, rowNum, 'count', 'Nombre invalide (attendu nombre >= 1)', rawRow.count);
        return null;
    }

    if (!isRecord(rawRow.gps)) {
        pushError(errors, rowNum, 'gps', 'Objet gps manquant ou invalide', rawRow.gps);
        return null;
    }

    const lat = asNumberOrNull(rawRow.gps.lat);
    const lon = asNumberOrNull(rawRow.gps.lon);
    if (lat === undefined || lon === undefined) {
        pushError(errors, rowNum, 'gps', 'gps.lat et gps.lon doivent être des nombres ou null', rawRow.gps);
        return null;
    }
    if (lat !== null && (lat < -90 || lat > 90)) {
        pushError(errors, rowNum, 'gps.lat', 'Latitude hors limites [-90, 90]', lat);
        return null;
    }
    if (lon !== null && (lon < -180 || lon > 180)) {
        pushError(errors, rowNum, 'gps.lon', 'Longitude hors limites [-180, 180]', lon);
        return null;
    }

    const taxonomicGroup = ensureEnum(rawRow.taxonomicGroup, TaxonomicGroup, rowNum, 'taxonomicGroup', errors);
    const status = ensureEnum(rawRow.status, Status, rowNum, 'status', errors);
    const protocol = ensureEnum(rawRow.protocol, Protocol, rowNum, 'protocol', errors);
    const sexe = ensureEnum(rawRow.sexe, Sexe, rowNum, 'sexe', errors);
    const age = ensureEnum(rawRow.age, Age, rowNum, 'age', errors);
    const observationCondition = ensureEnum(rawRow.observationCondition, ObservationCondition, rowNum, 'observationCondition', errors);
    const comportement = ensureEnum(rawRow.comportement, Comportement, rowNum, 'comportement', errors);

    if (!taxonomicGroup || !status || !protocol || !sexe || !age || !observationCondition || !comportement) {
        return null;
    }

    let id = asString(rawRow.id)?.trim() ?? '';
    if (!id) {
        id = crypto.randomUUID();
        pushWarning(warnings, rowNum, 'id', 'ID manquant, UUID généré', rawRow.id, id);
    } else if (!UUID_RE.test(id)) {
        const generated = crypto.randomUUID();
        pushWarning(warnings, rowNum, 'id', 'ID non UUID, UUID régénéré', id, generated);
        id = generated;
    }

    if (seenIds.has(id)) {
        const generated = crypto.randomUUID();
        pushWarning(warnings, rowNum, 'id', 'ID doublon, UUID régénéré', id, generated);
        id = generated;
    }
    seenIds.add(id);

    const altitude = asNumberOrNull(rawRow.altitude);
    if (altitude === undefined) {
        pushError(errors, rowNum, 'altitude', 'Altitude doit être un nombre ou null', rawRow.altitude);
        return null;
    }

    const location = asString(rawRow.location);
    const latinName = asString(rawRow.latinName);
    const municipality = asString(rawRow.municipality);
    const department = asString(rawRow.department);
    const country = asString(rawRow.country);
    const comment = asString(rawRow.comment);
    const atlasCode = asString(rawRow.atlasCode);

    if (
        location === null ||
        latinName === null ||
        municipality === null ||
        department === null ||
        country === null ||
        comment === null ||
        atlasCode === null
    ) {
        pushError(errors, rowNum, 'champs texte', 'Plusieurs champs texte obligatoires sont invalides', rawRow);
        return null;
    }

    const photo = asOptionalString(rawRow.photo);
    const sound = asOptionalString(rawRow.sound);
    const wikipediaImage = asOptionalString(rawRow.wikipediaImage);

    return {
        id,
        speciesName,
        latinName,
        taxonomicGroup,
        date,
        time,
        count,
        location,
        gps: { lat, lon },
        municipality,
        department,
        country,
        altitude,
        comment,
        status,
        atlasCode,
        protocol,
        sexe,
        age,
        observationCondition,
        comportement,
        photo,
        sound,
        wikipediaImage
    };
};

export const parseJsonImport = (rawJson: unknown): ImportResult => {
    if (!Array.isArray(rawJson)) {
        throw new Error('Le JSON doit contenir un tableau d’observations.');
    }

    const warnings: ImportWarning[] = [];
    const errors: ImportError[] = [];
    const seenIds = new Set<string>();
    const observations: Observation[] = [];

    rawJson.forEach((row, index) => {
        const rowNum = index + 1;
        const observation = buildObservationFromRow(row, rowNum, seenIds, warnings, errors);
        if (observation) {
            observations.push(observation);
        }
    });

    return {
        observations,
        report: {
            totalRows: rawJson.length,
            validRows: observations.length,
            warnings,
            errors,
            blockingErrors: [...errors],
            idCollisions: warnings.filter(w => w.field === 'id' && w.message.includes('doublon')).length
        }
    };
};
