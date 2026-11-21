// Recherche du lieu d'une recherche en langage naturel, sur l'appareil :
// - « près de chez moi » : position actuelle de l'appareil (géolocalisation
//   du navigateur), gardée en mémoire le temps de la recherche, jamais
//   envoyée à l'assistant ni gardée dans le cache des phrases ;
// - lieu nommé (« près de Pessac ») : géocodage DIRECT par Nominatim
//   (OpenStreetMap), qui reçoit le nom du lieu tel qu'écrit.
// Rien n'est journalisé : ni la position, ni le lieu.

import type { NearResolution, SearchNear } from '../utils/aiSearchFilters';
import { searchAddress } from './locationService';

export const NEAR_GEOLOCATION_TIMEOUT_MS = 15_000;

/** Position actuelle de l'appareil ; jamais d'exception. */
export const locateDevice = (): Promise<NearResolution> => new Promise(resolve => {
    if (typeof navigator === 'undefined' || !('geolocation' in navigator) || !navigator.geolocation) {
        resolve({ status: 'unavailable' });
        return;
    }
    try {
        navigator.geolocation.getCurrentPosition(
            position => {
                const { latitude, longitude } = position.coords;
                resolve(Number.isFinite(latitude) && Number.isFinite(longitude)
                    ? { status: 'ok', lat: latitude, lon: longitude }
                    : { status: 'unavailable' });
            },
            error => resolve({ status: error?.code === 1 ? 'denied' : 'unavailable' }),
            { enableHighAccuracy: false, timeout: NEAR_GEOLOCATION_TIMEOUT_MS, maximumAge: 60_000 },
        );
    } catch {
        resolve({ status: 'unavailable' });
    }
});

/** Coordonnées d'un lieu nommé (premier résultat de Nominatim) ; jamais d'exception. */
export const geocodePlace = async (placeName: string): Promise<NearResolution> => {
    if (typeof navigator !== 'undefined' && !navigator.onLine) return { status: 'offline' };
    try {
        const results = await searchAddress(placeName);
        const first = results.find(result => Number.isFinite(result.lat) && Number.isFinite(result.lon));
        return first ? { status: 'ok', lat: first.lat, lon: first.lon } : { status: 'not_found' };
    } catch {
        return { status: 'error' };
    }
};

/** Cherche le lieu d'un critère « près de ». */
export const resolveNear = (near: SearchNear): Promise<NearResolution> =>
    near.kind === 'current_position' ? locateDevice() : geocodePlace(near.placeName ?? '');
