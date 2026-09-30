/**
 * Validates that a URL string uses a safe protocol (http, https, or blob).
 * Prevents injection of javascript: or data: URLs into img src attributes.
 */
export const isSafeImageUrl = (value: string): boolean => {
    if (!value) return false;
    try {
        const url = new URL(value, window.location.origin);
        return ['http:', 'https:', 'blob:'].includes(url.protocol);
    } catch {
        return false;
    }
};

/** Sources publiques d'encyclopédie, séparées des références privées Supabase. */
export const isPublicEncyclopediaImage = (value: string): boolean => {
    try {
        const url = new URL(value);
        return url.protocol === 'https:' && !url.username && !url.password &&
            (url.hostname === 'upload.wikimedia.org' || url.hostname === 'inaturalist-open-data.s3.amazonaws.com'
                || url.hostname === 'inaturalist.org' || url.hostname.endsWith('.inaturalist.org'));
    } catch { return false; }
};
