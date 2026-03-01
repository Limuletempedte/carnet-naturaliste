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

export const sanitizeCachedMediaValue = (value?: string): string | undefined => {
    if (!value) return undefined;
    if (value.startsWith('blob:')) return undefined;
    if (isStableRemoteUrl(value) || isPersistableDataUrl(value)) {
        return value;
    }
    return undefined;
};
