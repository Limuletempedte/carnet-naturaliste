/**
 * Fetch a URL with a timeout enforced via AbortController.
 * If the fetch takes longer than `timeoutMs`, the request is aborted and an AbortError is thrown.
 */
export const fetchWithTimeout = async (
    url: string,
    timeoutMs: number,
    init?: RequestInit
): Promise<Response> => {
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), timeoutMs);
    try {
        return await fetch(url, { ...init, signal: controller.signal });
    } finally {
        window.clearTimeout(timeoutId);
    }
};
