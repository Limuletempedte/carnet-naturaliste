

export interface SearchResult {
    lat: number;
    lon: number;
    displayName: string;
    address?: {
        municipality?: string;
        location?: string;
        department?: string;
        country?: string;
    };
}

const NOMINATIM_TIMEOUT_MS = 7000;
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

const fetchJsonWithTimeout = async (
    url: string,
    options: RequestInit = {},
    timeoutMs = NOMINATIM_TIMEOUT_MS,
    externalSignal?: AbortSignal
) => {
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), timeoutMs);
    const abortListener = () => controller.abort();

    if (externalSignal) {
        externalSignal.addEventListener('abort', abortListener, { once: true });
    }

    try {
        const response = await fetch(url, { ...options, signal: controller.signal });
        return response;
    } finally {
        window.clearTimeout(timeoutId);
        if (externalSignal) {
            externalSignal.removeEventListener('abort', abortListener);
        }
    }
};

const fetchNominatimWithRetry = async (url: string, signal?: AbortSignal): Promise<Response> => {
    const maxAttempts = 2;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
            const response = await fetchJsonWithTimeout(
                url,
                {
                    headers: {
                        Accept: 'application/json',
                        'Accept-Language': 'fr'
                    }
                },
                NOMINATIM_TIMEOUT_MS,
                signal
            );

            if (response.status === 429) {
                if (attempt < maxAttempts) {
                    await sleep(350 * attempt);
                    continue;
                }
                throw new Error('NOMINATIM_RATE_LIMIT');
            }

            if (!response.ok) {
                throw new Error(`NOMINATIM_HTTP_${response.status}`);
            }

            return response;
        } catch (error) {
            const err = error as Error;
            const isAbort = err.name === 'AbortError';
            if (isAbort) throw err;
            if (attempt >= maxAttempts) throw err;
            await sleep(250 * attempt);
        }
    }

    throw new Error('NOMINATIM_UNKNOWN');
};

export const fetchAltitude = async (lat: number, lon: number): Promise<number | null> => {
    try {
        const response = await fetchJsonWithTimeout(`https://api.open-meteo.com/v1/elevation?latitude=${lat}&longitude=${lon}`, {}, 5000);
        const data = await response.json();

        if (data && data.elevation && data.elevation.length > 0) {
            return data.elevation[0];
        }
        return null;
    } catch (error) {
        console.error("Erreur lors de la récupération de l'altitude:", error);
        return null;
    }
};

export const searchAddress = async (query: string): Promise<SearchResult[]> => {
    if (!query || query.length < 3) return [];
    try {
        const response = await fetchNominatimWithRetry(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&addressdetails=1&limit=5`);
        const data = await response.json();

        return data.map((item: any) => ({
            lat: parseFloat(item.lat),
            lon: parseFloat(item.lon),
            displayName: item.display_name,
            address: {
                municipality: item.address.village || item.address.town || item.address.city || '',
                location: item.address.road || '',
                department: item.address.postcode ? (item.address.postcode.startsWith('97') ? item.address.postcode.substring(0, 3) : item.address.postcode.substring(0, 2)) : '',
                country: item.address.country || ''
            }
        }));
    } catch (error) {
        const err = error as Error;
        if (err.message === 'NOMINATIM_RATE_LIMIT') {
            throw new Error('Service de géocodage temporairement limité (trop de requêtes).');
        }
        if (err.name === 'AbortError') {
            throw new Error('La recherche a expiré. Réessayez.');
        }
        throw new Error("Impossible d'effectuer la recherche d'adresse.");
    }
};

export const reverseGeocode = async (lat: number, lon: number, signal?: AbortSignal): Promise<SearchResult | null> => {
    try {
        const response = await fetchNominatimWithRetry(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}&addressdetails=1`, signal);
        const data = await response.json();

        if (data && data.address) {
            return {
                lat: parseFloat(data.lat),
                lon: parseFloat(data.lon),
                displayName: data.display_name,
                address: {
                    municipality: data.address.village || data.address.town || data.address.city || '',
                    location: data.address.road || '',
                    department: data.address.postcode ? (data.address.postcode.startsWith('97') ? data.address.postcode.substring(0, 3) : data.address.postcode.substring(0, 2)) : '',
                    country: data.address.country || ''
                }
            };
        }
        return null;
    } catch (error) {
        if ((error as Error).name === 'AbortError') {
            return null;
        }
        const err = error as Error;
        if (err.message === 'NOMINATIM_RATE_LIMIT') {
            throw new Error('Service de géocodage temporairement limité (trop de requêtes).');
        }
        throw new Error('Impossible de récupérer les détails de localisation.');
    }
};
