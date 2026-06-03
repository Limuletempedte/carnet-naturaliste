import { asSupabaseError } from './storageHelpers';
import { logger } from '../../utils/logger';
import type { SupabaseLikeError } from './storageTypes';

/**
 * Tolérance à la dérive de schéma (SR-13) : détection des colonnes manquantes
 * (migration en attente) et retry de l'opération sans ces colonnes. Extrait de
 * `storageService`. Aucune dépendance à l'état mutable du module.
 */

const COUNT_BREAKDOWN_COLUMNS = ['male_count', 'female_count', 'unidentified_count'] as const;
const WEATHER_COLUMN = 'weather_condition';

const stripCountBreakdownColumns = (row: Record<string, unknown>): Record<string, unknown> => {
    const next = { ...row };
    for (const key of COUNT_BREAKDOWN_COLUMNS) {
        delete next[key];
    }
    return next;
};

const isMissingCountBreakdownColumnError = (error: unknown): boolean => {
    const err = asSupabaseError(error);
    const combined = `${err.message || ''} ${err.details || ''} ${err.hint || ''}`.toLowerCase();
    const code = String(err.code || '').toUpperCase();
    const mentionsCountColumn = COUNT_BREAKDOWN_COLUMNS.some(column => combined.includes(column));
    if (!mentionsCountColumn) return false;

    return (
        code === '42703' // undefined_column
        || code === 'PGRST204' // column missing in schema cache
        || combined.includes('does not exist')
        || combined.includes('schema cache')
        || combined.includes('could not find')
    );
};

const stripWeatherColumn = (row: Record<string, unknown>): Record<string, unknown> => {
    const next = { ...row };
    delete next[WEATHER_COLUMN];
    return next;
};

const isMissingWeatherColumnError = (error: unknown): boolean => {
    const err = asSupabaseError(error);
    const combined = `${err.message || ''} ${err.details || ''} ${err.hint || ''}`.toLowerCase();
    const code = String(err.code || '').toUpperCase();
    if (!combined.includes(WEATHER_COLUMN)) return false;
    return (
        code === '42703'
        || code === 'PGRST204'
        || combined.includes('does not exist')
        || combined.includes('schema cache')
        || combined.includes('could not find')
    );
};

export const isMissingColumnError = (error: unknown): boolean =>
    isMissingCountBreakdownColumnError(error) || isMissingWeatherColumnError(error);

const stripMissingColumns = (row: Record<string, unknown>, error: unknown): Record<string, unknown> => {
    let result = row;
    if (isMissingCountBreakdownColumnError(error)) result = stripCountBreakdownColumns(result);
    if (isMissingWeatherColumnError(error)) result = stripWeatherColumn(result);
    return result;
};

/**
 * Run a Supabase-like operation and retry once with the row stripped of columns
 * that the server complains are missing (PostgREST code 42703 / PGRST204).
 * Preserves the legacy fallback behaviour used when a migration is pending.
 */
export async function withColumnFallback<R extends { error: SupabaseLikeError | null }>(
    row: Record<string, unknown>,
    operation: (effectiveRow: Record<string, unknown>) => PromiseLike<R>
): Promise<R> {
    const first = await operation(row);
    if (first.error && isMissingColumnError(first.error)) {
        const strippedRow = stripMissingColumns(row, first.error);
        const strippedColumns = Object.keys(row).filter(k => !(k in strippedRow));
        // SR-13: schema drift visible — retry sans les colonnes manquantes
        logger.warn('[storageService] Migration de schéma manquante — retry sans colonnes:', strippedColumns.join(', '));
        window.dispatchEvent(new CustomEvent('schema-drift-detected', { detail: { columns: strippedColumns } }));
        return await operation(strippedRow);
    }
    return first;
}
