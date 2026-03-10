const MAX_PERSISTED_DATA_URL_LENGTH = 250_000;

const isStableRemoteUrl = (value: string): boolean => {
    try {
        const url = new URL(value, window.location.origin);
        return url.protocol === 'http:' || url.protocol === 'https:';
    } catch {
        return false;
    }
};

const isPersistableDataUrl = (value: string): boolean => {
    return value.startsWith('data:') && value.length <= MAX_PERSISTED_DATA_URL_LENGTH;
};

export interface SanitizationResult {
    value: string | undefined;
    stripped: boolean;
}

export const sanitizeCachedMediaValueWithTracking = (value?: string): SanitizationResult => {
    if (!value) return { value: undefined, stripped: false };
    if (value.startsWith('blob:')) return { value: undefined, stripped: true };
    if (isStableRemoteUrl(value) || isPersistableDataUrl(value)) {
        return { value, stripped: false };
    }
    return { value: undefined, stripped: true };
};

export const sanitizeCachedMediaValue = (value?: string): string | undefined => {
    return sanitizeCachedMediaValueWithTracking(value).value;
};
