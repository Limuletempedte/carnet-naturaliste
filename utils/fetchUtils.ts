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

export interface FetchWithRetryOptions {
    /** Number of additional attempts after the first. Default: 2 (= 3 total attempts). */
    retries?: number;
    /** Base backoff in ms. Exponential: backoffMs, backoffMs*2, backoffMs*4… Default: 300. */
    backoffMs?: number;
    /** Per-attempt timeout in ms. Default: 5000. */
    timeoutMs?: number;
    /** Caller's abort signal. If aborted, no retry — propagates AbortError immediately. */
    signal?: AbortSignal;
}

const isCallerAbort = (err: unknown, callerSignal?: AbortSignal): boolean => {
    return callerSignal?.aborted === true
        && err instanceof DOMException
        && err.name === 'AbortError';
};

const sleep = (ms: number, signal?: AbortSignal): Promise<void> => {
    return new Promise((resolve, reject) => {
        if (signal?.aborted) {
            reject(new DOMException('aborted', 'AbortError'));
            return;
        }
        const timerId = setTimeout(() => {
            signal?.removeEventListener('abort', onAbort);
            resolve();
        }, ms);
        const onAbort = () => {
            clearTimeout(timerId);
            reject(new DOMException('aborted', 'AbortError'));
        };
        signal?.addEventListener('abort', onAbort, { once: true });
    });
};

/**
 * Fetch with automatic retry on transient network errors (network failures, timeouts, 5xx).
 * - Does NOT retry on 4xx (client errors) — they're almost always permanent.
 * - Does NOT retry if the caller's `signal` is aborted — propagates AbortError immediately.
 * - Each attempt has its own `timeoutMs` deadline.
 * - Uses exponential backoff between attempts.
 *
 * Returns the last Response (which may be 4xx). Throws the last error if all attempts failed
 * with an exception (network/timeout).
 */
export const fetchWithRetry = async (
    url: string,
    init: Omit<RequestInit, 'signal'> = {},
    options: FetchWithRetryOptions = {}
): Promise<Response> => {
    const {
        retries = 2,
        backoffMs = 300,
        timeoutMs = 5000,
        signal: callerSignal
    } = options;

    let lastError: unknown = null;
    let lastResponse: Response | null = null;

    for (let attempt = 0; attempt <= retries; attempt += 1) {
        if (callerSignal?.aborted) {
            throw new DOMException('aborted', 'AbortError');
        }

        try {
            const timeoutSignal = AbortSignal.timeout(timeoutMs);
            const signal = callerSignal
                ? AbortSignal.any([callerSignal, timeoutSignal])
                : timeoutSignal;

            const response = await fetch(url, { ...init, signal });

            // Ne retry QUE sur 5xx explicite (transient server error).
            // Tout le reste (2xx/3xx/4xx ou status absent comme dans les mocks) retourne tel quel —
            // 4xx = erreur permanente cliente (404, 400…), un retry n'aide pas.
            if (typeof response.status !== 'number' || response.status < 500) {
                return response;
            }

            // 5xx : transient server error, retry if attempts remain.
            lastResponse = response;
            lastError = new Error(`HTTP ${response.status} ${response.statusText}`);
        } catch (err) {
            // Caller-initiated abort stops everything immediately.
            if (isCallerAbort(err, callerSignal)) {
                throw err;
            }
            // Timeout or network error → retry.
            lastError = err;
        }

        // Backoff before next attempt (if any).
        if (attempt < retries) {
            const delay = backoffMs * Math.pow(2, attempt);
            try {
                await sleep(delay, callerSignal);
            } catch {
                // Caller aborted during backoff.
                throw new DOMException('aborted', 'AbortError');
            }
        }
    }

    // All attempts failed. Return the last 5xx response if we have one, else throw.
    if (lastResponse) return lastResponse;
    throw lastError ?? new Error('fetchWithRetry: all attempts failed');
};
