// Distance entre deux points GPS (formule de haversine), partagée par les
// filtres de la liste (`hooks/useObservationFilters.ts`) et la recherche en
// langage naturel (`utils/aiSearchFilters.ts`).

const EARTH_RADIUS_KM = 6371;
const toRadians = (value: number): number => value * (Math.PI / 180);

/** Distance en kilomètres sur la sphère terrestre (rayon moyen 6 371 km). */
export const distanceKm = (lat1: number, lon1: number, lat2: number, lon2: number): number => {
    const dLat = toRadians(lat2 - lat1);
    const dLon = toRadians(lon2 - lon1);
    const radLat1 = toRadians(lat1);
    const radLat2 = toRadians(lat2);

    const a = Math.sin(dLat / 2) ** 2
        + Math.cos(radLat1) * Math.cos(radLat2) * Math.sin(dLon / 2) ** 2;
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return EARTH_RADIUS_KM * c;
};
