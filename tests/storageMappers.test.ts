import { describe, it, expect } from 'vitest';
import { mapToObservation, mapToRow } from '../services/storage/storageMappers';
import type { ObservationRow } from '../services/storage/storageTypes';
import { getObservationLookupKey } from '../utils/observationFormHelpers';
import { TaxonomicGroup, Status, Protocol, Sexe } from '../types';

describe('Lignes serveur historiques avec champs facultatifs nuls', () => {
    const row = {
        id: 'fictif', species_name: 'Espèce fictive', taxonomic_group: TaxonomicGroup.BIRD,
        date: '2026-10-08', count: 1, latin_name: null, time: null, location: null,
        municipality: null, department: null, country: null, comment: null,
        atlas_code: null, gps_lat: null, gps_lon: null, altitude: null,
        status: null, protocol: null, sexe: null, age: null,
        observation_condition: null, comportement: null
    } as unknown as ObservationRow;

    it('permet la recherche et l’édition sans appeler trim sur null', () => {
        const obs = mapToObservation(row);
        expect(getObservationLookupKey(obs.speciesName, obs.latinName)).toBe('Espèce fictive');
        for (const key of ['latinName', 'time', 'location', 'municipality', 'department', 'country', 'comment', 'atlasCode'] as const) {
            expect(obs[key]).toBe('');
        }
        expect(obs.status).toBe(Status.NE);
        expect(obs.protocol).toBe(Protocol.OPPORTUNIST);
        expect(obs.sexe).toBe(Sexe.UNKNOWN);
        expect(obs.gps).toEqual({ lat: null, lon: null });
        expect(mapToRow(obs, 'compte-fictif').time).toBeNull();
    });

    it('conserve les textes et coordonnées zéro lorsqu’ils sont renseignés', () => {
        const obs = mapToObservation({ ...row, latin_name: 'Fictiva', gps_lat: 0, gps_lon: 0, altitude: 0 });
        expect(obs.latinName).toBe('Fictiva');
        expect(obs.gps).toEqual({ lat: 0, lon: 0 });
        expect(obs.altitude).toBe(0);
    });
});
