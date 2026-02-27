const ISO_DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

const parseIsoDateParts = (value: string): { year: number; month: number; day: number } | null => {
    const match = ISO_DATE_RE.exec(value);
    if (!match) return null;

    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) {
        return null;
    }

    return { year, month, day };
};

const pad2 = (value: number): string => String(value).padStart(2, '0');

export const dateToIsoLocal = (date: Date): string => {
    const year = date.getFullYear();
    const month = pad2(date.getMonth() + 1);
    const day = pad2(date.getDate());
    return `${year}-${month}-${day}`;
};

export const isIsoDateString = (value: string): boolean => {
    const parsed = parseIsoDateParts(value);
    if (!parsed) return false;

    const date = new Date(parsed.year, parsed.month - 1, parsed.day);
    return (
        date.getFullYear() === parsed.year &&
        date.getMonth() === parsed.month - 1 &&
        date.getDate() === parsed.day
    );
};

export const compareIsoDate = (a: string, b: string): number => {
    if (a === b) return 0;
    return a < b ? -1 : 1;
};

export const isoToFrDisplay = (
    value: string,
    options: Intl.DateTimeFormatOptions = { year: 'numeric', month: 'long', day: 'numeric' }
): string => {
    const parsed = parseIsoDateParts(value);
    if (!parsed) return value;

    const date = new Date(parsed.year, parsed.month - 1, parsed.day);
    return date.toLocaleDateString('fr-FR', options);
};

export const getYearFromIsoDate = (value: string): string | null => {
    if (!isIsoDateString(value)) return null;
    return value.slice(0, 4);
};

export const getMonthIndexFromIsoDate = (value: string): number | null => {
    const parsed = parseIsoDateParts(value);
    if (!parsed || !isIsoDateString(value)) return null;
    return parsed.month - 1;
};
