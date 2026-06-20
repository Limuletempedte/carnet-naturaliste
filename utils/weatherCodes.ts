import { WeatherCondition } from '../types';

// Traduit un code météo WMO (renvoyé par Open-Meteo, champ `weather_code`) vers les
// conditions météo de l'app. Référence : https://open-meteo.com/en/docs
// (« WMO Weather interpretation codes »).
// Les conditions « Venteux » et « Gel » n'ont pas de code WMO dédié (le vent est une
// mesure séparée) → on les laisse au choix manuel en renvoyant null si non mappable.
export const mapWmoCodeToWeather = (code: number): WeatherCondition | null => {
    switch (code) {
        case 0: // Ciel dégagé
        case 1: // Principalement dégagé
            return WeatherCondition.SUNNY;
        case 2: // Partiellement nuageux
            return WeatherCondition.PARTLY_CLOUDY;
        case 3: // Couvert
            return WeatherCondition.CLOUDY;
        case 45: // Brouillard
        case 48: // Brouillard givrant
            return WeatherCondition.FOG;
        case 51: // Bruine légère
        case 53: // Bruine modérée
        case 55: // Bruine dense
        case 56: // Bruine verglaçante légère
        case 57: // Bruine verglaçante dense
        case 61: // Pluie faible
        case 80: // Averses de pluie faibles
            return WeatherCondition.LIGHT_RAIN;
        case 63: // Pluie modérée
        case 66: // Pluie verglaçante légère
        case 81: // Averses de pluie modérées
            return WeatherCondition.RAIN;
        case 65: // Pluie forte
        case 67: // Pluie verglaçante forte
        case 82: // Averses de pluie violentes
            return WeatherCondition.HEAVY_RAIN;
        case 71: // Neige faible
        case 73: // Neige modérée
        case 75: // Neige forte
        case 77: // Grains de neige
        case 85: // Averses de neige faibles
        case 86: // Averses de neige fortes
            return WeatherCondition.SNOW;
        case 95: // Orage
        case 96: // Orage avec grêle légère
        case 99: // Orage avec grêle forte
            return WeatherCondition.STORM;
        default:
            return null;
    }
};
