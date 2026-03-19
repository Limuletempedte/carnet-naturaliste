const DANGEROUS_CSV_PREFIX_RE = /^[\t\r=+\-@]/;

export const sanitizeCsvCellValue = (value: unknown): string => {
    const raw = String(value ?? '');
    const trimmedStart = raw.trimStart();
    if (trimmedStart && DANGEROUS_CSV_PREFIX_RE.test(trimmedStart)) {
        return `'${raw}`;
    }
    return raw;
};

export const escapeCsvCell = (value: unknown): string => {
    const safeValue = sanitizeCsvCellValue(value);
    return `"${safeValue.replace(/"/g, '""')}"`;
};
