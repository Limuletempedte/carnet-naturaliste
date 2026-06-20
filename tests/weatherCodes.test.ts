import { describe, expect, it } from 'vitest';
import { mapWmoCodeToWeather } from '../utils/weatherCodes';
import { WeatherCondition } from '../types';

describe('mapWmoCodeToWeather', () => {
    it('mappe ciel dégagé et couverture nuageuse', () => {
        expect(mapWmoCodeToWeather(0)).toBe(WeatherCondition.SUNNY);
        expect(mapWmoCodeToWeather(1)).toBe(WeatherCondition.SUNNY);
        expect(mapWmoCodeToWeather(2)).toBe(WeatherCondition.PARTLY_CLOUDY);
        expect(mapWmoCodeToWeather(3)).toBe(WeatherCondition.CLOUDY);
    });

    it('mappe brouillard', () => {
        expect(mapWmoCodeToWeather(45)).toBe(WeatherCondition.FOG);
        expect(mapWmoCodeToWeather(48)).toBe(WeatherCondition.FOG);
    });

    it('mappe les intensités de pluie (légère / modérée / forte)', () => {
        expect(mapWmoCodeToWeather(51)).toBe(WeatherCondition.LIGHT_RAIN);
        expect(mapWmoCodeToWeather(61)).toBe(WeatherCondition.LIGHT_RAIN);
        expect(mapWmoCodeToWeather(80)).toBe(WeatherCondition.LIGHT_RAIN);
        expect(mapWmoCodeToWeather(63)).toBe(WeatherCondition.RAIN);
        expect(mapWmoCodeToWeather(81)).toBe(WeatherCondition.RAIN);
        expect(mapWmoCodeToWeather(65)).toBe(WeatherCondition.HEAVY_RAIN);
        expect(mapWmoCodeToWeather(82)).toBe(WeatherCondition.HEAVY_RAIN);
    });

    it('mappe neige et orage', () => {
        expect(mapWmoCodeToWeather(71)).toBe(WeatherCondition.SNOW);
        expect(mapWmoCodeToWeather(77)).toBe(WeatherCondition.SNOW);
        expect(mapWmoCodeToWeather(85)).toBe(WeatherCondition.SNOW);
        expect(mapWmoCodeToWeather(95)).toBe(WeatherCondition.STORM);
        expect(mapWmoCodeToWeather(96)).toBe(WeatherCondition.STORM);
        expect(mapWmoCodeToWeather(99)).toBe(WeatherCondition.STORM);
    });

    it('renvoie null pour un code non mappable (vent/gel/inconnu)', () => {
        expect(mapWmoCodeToWeather(-1)).toBeNull();
        expect(mapWmoCodeToWeather(4)).toBeNull();
        expect(mapWmoCodeToWeather(123)).toBeNull();
    });
});
