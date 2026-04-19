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
