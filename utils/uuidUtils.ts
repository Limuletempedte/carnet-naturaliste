export const isUuid = (value: unknown): value is string => {
    return typeof value === 'string' &&
        /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value.trim());
};

/**
 * CO-12 (Theme 09 Compatibilite) : wrapper avec fallback pour crypto.randomUUID().
 *
 * crypto.randomUUID() n'est disponible que dans :
 *   - contexte securise (HTTPS ou localhost)
 *   - Chrome 92+, Firefox 95+, Safari 15.2+
 *
 * Le fallback utilise crypto.getRandomValues() qui a un support beaucoup
 * plus large (Chrome 11+, Firefox 21+, Safari 5+) et reste compatible HTTP.
 */
export const generateUUID = (): string => {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
        try {
            return crypto.randomUUID();
        } catch {
            // Certains navigateurs lancent en contexte non securise — on tombe sur le fallback
        }
    }

    if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
        // RFC 4122 v4 via crypto.getRandomValues
        return '10000000-1000-4000-8000-100000000000'.replace(/[018]/g, (c) => {
            const n = Number(c);
            const random = crypto.getRandomValues(new Uint8Array(1))[0];
            return (n ^ (random & (15 >> (n / 4)))).toString(16);
        });
    }

    // Fallback ultime (tres vieux navigateurs sans Web Crypto) : Math.random
    // Note : non cryptographiquement sur, mais suffit pour des IDs uniques
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
        const r = (Math.random() * 16) | 0;
        const v = c === 'x' ? r : (r & 0x3) | 0x8;
        return v.toString(16);
    });
};
