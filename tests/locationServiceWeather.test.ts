import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchWeather } from '../services/locationService';
import { WeatherCondition } from '../types';

const hourlyCodes = (override: Record<number, number> = {}, fill = 0): number[] =>
    Array.from({ length: 24 }, (_, h) => (h in override ? override[h] : fill));

const stubFetchJson = (body: unknown, ok = true) => {
    const f = vi.fn().mockResolvedValue({ ok, status: ok ? 200 : 500, json: async () => body });
    vi.stubGlobal('fetch', f);
    return f;
};

describe('fetchWeather', () => {
    afterEach(() => {
        vi.unstubAllGlobals();
        vi.restoreAllMocks();
    });

    it('retourne la condition correspondant à l’heure de l’observation', async () => {
        stubFetchJson({ hourly: { weather_code: hourlyCodes({ 14: 3 }) } });
        expect(await fetchWeather(48.85, 2.35, '2026-06-20', '14:30')).toBe(WeatherCondition.CLOUDY);
    });

    it('utilise midi par défaut quand l’heure est absente', async () => {
        stubFetchJson({ hourly: { weather_code: hourlyCodes({ 12: 95 }) } });
        expect(await fetchWeather(48.85, 2.35, '2026-06-20')).toBe(WeatherCondition.STORM);
    });

    it('retourne null si la réponse ne contient pas de codes', async () => {
        stubFetchJson({ hourly: {} });
        expect(await fetchWeather(1, 2, '2026-06-20', '10:00')).toBeNull();
    });

    it('retourne null pour un code non mappable', async () => {
        stubFetchJson({ hourly: { weather_code: hourlyCodes({ 10: 4 }) } });
        expect(await fetchWeather(1, 2, '2026-06-20', '10:00')).toBeNull();
    });

    it('retourne null en cas d’erreur réseau', async () => {
        vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network')));
        expect(await fetchWeather(1, 2, '2026-06-20', '10:00')).toBeNull();
    });

    it('n’appelle pas l’API si la date est vide', async () => {
        const f = stubFetchJson({ hourly: { weather_code: hourlyCodes() } });
        expect(await fetchWeather(1, 2, '', '10:00')).toBeNull();
        expect(f).not.toHaveBeenCalled();
    });

    it('interroge Open-Meteo avec weather_code et la date de l’observation', async () => {
        const f = stubFetchJson({ hourly: { weather_code: hourlyCodes() } });
        await fetchWeather(48.85, 2.35, '2026-06-20', '08:00');
        const url = String(f.mock.calls[0][0]);
        expect(url).toContain('api.open-meteo.com/v1/forecast');
        expect(url).toContain('hourly=weather_code');
        expect(url).toContain('start_date=2026-06-20');
        expect(url).toContain('end_date=2026-06-20');
    });
});
