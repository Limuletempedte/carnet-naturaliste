import { Status } from '../types';

const SENSITIVE_STATUSES: ReadonlySet<Status> = new Set([
    Status.VU,
    Status.EN,
    Status.CR,
    Status.EW,
]);

export const isSensitiveSpecies = (status: Status): boolean =>
    SENSITIVE_STATUSES.has(status);

export const obfuscateCoordinate = (value: number | null | undefined): number | null =>
    value != null ? Math.round(value * 10) / 10 : null;
