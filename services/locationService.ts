import { logger } from '../utils/logger';
import { WeatherCondition } from '../types';
import { mapWmoCodeToWeather } from '../utils/weatherCodes';

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

interface NominatimResult {
    lat: string;
    lon: string;
    display_name: string;
    address?: {
        village?: string;
        town?: string;
        city?: string;
        road?: string;
        postcode?: string;
        country?: string;
    };
}

const NOMINATIM_TIMEOUT_MS = 7000;
const NOMINATIM_MIN_INTERVAL_MS = 1000;
let lastNominatimCallMs = 0;

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

const throttleNominatim = async () => {
    const now = Date.now();
    const elapsed = now - lastNominatimCallMs;
    if (elapsed < NOMINATIM_MIN_INTERVAL_MS) {
        await sleep(NOMINATIM_MIN_INTERVAL_MS - elapsed);
    }
    lastNominatimCallMs = Date.now();
};

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
        // No manual removeEventListener needed — { once: true } auto-removes
    }
};

const fetchNominatimWithRetry = async (url: string, signal?: AbortSignal): Promise<Response> => {
    const maxAttempts = 2;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        await throttleNominatim();
        try {
            const response = await fetchJsonWithTimeout(
                url,
                {
                    headers: {
                        Accept: 'application/json',
                        'Accept-Language': 'fr',
                        'User-Agent': 'CarnetNaturaliste/5.2 (contact@carnet-naturaliste.fr)'
                    }
                },
                NOMINATIM_TIMEOUT_MS,
                signal
            );

            if (response.status === 429) {
                if (attempt < maxAttempts) {
                    const retryAfter = response.headers.get('Retry-After');
                    const retryMs = retryAfter && /^\d+$/.test(retryAfter)
                        ? Math.min(parseInt(retryAfter, 10) * 1000, 10000)
                        : 350 * attempt;
                    await sleep(retryMs);
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
        logger.error("Erreur lors de la récupération de l'altitude:", error);
        return null;
    }
};

/**
 * Récupère la condition météo (code WMO) pour une position et une date données via
 * Open-Meteo (même fournisseur que l'altitude, gratuit, sans clé). Couvre le jour même
 * et le passé récent (jusqu'à ~92 jours) ; renvoie null au-delà ou en cas d'échec.
 * `time` ("HH:MM") sert à choisir l'heure correspondante dans la série horaire.
 */
export const fetchWeather = async (
    lat: number,
    lon: number,
    date: string,
    time?: string
): Promise<WeatherCondition | null> => {
    if (!date) return null;
    try {
        const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&hourly=weather_code&start_date=${date}&end_date=${date}&timezone=auto`;
        const response = await fetchJsonWithTimeout(url, {}, 5000);
        const data = await response.json();
        const codes: unknown = data?.hourly?.weather_code;

        if (!Array.isArray(codes) || codes.length === 0) return null;

        // La série est horaire (00:00 → 23:00) → l'indice = l'heure de l'observation.
        const hour = time && /^\d{2}:/.test(time) ? parseInt(time.slice(0, 2), 10) : 12;
        const index = Math.min(Math.max(hour, 0), codes.length - 1);
        const code = codes[index];
        if (typeof code !== 'number') return null;

        return mapWmoCodeToWeather(code);
    } catch (error) {
        logger.error('Erreur lors de la récupération de la météo:', error);
        return null;
    }
};

export const searchAddress = async (query: string): Promise<SearchResult[]> => {
    if (!query || query.length < 3) return [];
    try {
        const response = await fetchNominatimWithRetry(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&addressdetails=1&limit=5`);
        const data = await response.json();

        return (data as NominatimResult[]).map((item) => ({
            lat: parseFloat(item.lat),
            lon: parseFloat(item.lon),
            displayName: item.display_name,
            address: {
                municipality: item.address?.village || item.address?.town || item.address?.city || '',
                location: item.address?.road || '',
                department: item.address?.postcode ? (item.address.postcode.startsWith('97') ? item.address.postcode.substring(0, 3) : item.address.postcode.substring(0, 2)) : '',
                country: item.address?.country || ''
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
