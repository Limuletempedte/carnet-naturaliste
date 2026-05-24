import { Observation } from '../../types';
import { isUuid } from '../../utils/uuidUtils';
import type { ObservationRow } from './storageTypes';

/** Convertit une ligne Supabase (snake_case) en Observation (camelCase). */
export const mapToObservation = (row: ObservationRow): Observation => ({
    id: row.id,
    speciesName: row.species_name,
    latinName: row.latin_name,
    taxonomicGroup: row.taxonomic_group,
    date: row.date,
    time: row.time,
    count: row.count,
    maleCount: row.male_count ?? undefined,
    femaleCount: row.female_count ?? undefined,
    unidentifiedCount: row.unidentified_count ?? undefined,
    location: row.location,
    gps: { lat: row.gps_lat, lon: row.gps_lon },
    municipality: row.municipality,
    department: row.department,
    country: row.country,
    altitude: row.altitude,
    comment: row.comment,
    status: row.status,
    atlasCode: row.atlas_code,
    protocol: row.protocol,
    sexe: row.sexe,
    age: row.age,
    observationCondition: row.observation_condition,
    comportement: row.comportement,
    weather: (row.weather_condition || 'Non renseigné') as Observation['weather'],
    photo: row.photo_url ?? undefined,
    wikipediaImage: row.wikipedia_image ?? undefined,
    sound: row.sound_url ?? undefined,
    createdAt: row.created_at ?? undefined,
    updatedAt: row.updated_at ?? undefined,
    habitat: (row.habitat ?? undefined) as Observation['habitat'],
    phenology: (row.phenology ?? undefined) as Observation['phenology'],
    observers: row.observers && row.observers.length > 0 ? row.observers : undefined,
});

/** Convertit une Observation en ligne Supabase (snake_case) prête à insérer/mettre à jour. */
export const mapToRow = (obs: Observation, userId: string): Record<string, unknown> => {
    const row: Record<string, unknown> = {
        user_id: userId,
        species_name: obs.speciesName,
        latin_name: obs.latinName,
        taxonomic_group: obs.taxonomicGroup,
        date: obs.date,
        time: obs.time,
        count: obs.count,
        male_count: obs.maleCount ?? null,
        female_count: obs.femaleCount ?? null,
        unidentified_count: obs.unidentifiedCount ?? null,
        location: obs.location,
        gps_lat: obs.gps.lat,
        gps_lon: obs.gps.lon,
        municipality: obs.municipality,
        department: obs.department,
        country: obs.country,
        altitude: obs.altitude,
        comment: obs.comment,
        status: obs.status,
        atlas_code: obs.atlasCode,
        protocol: obs.protocol,
        sexe: obs.sexe,
        age: obs.age,
        observation_condition: obs.observationCondition,
        comportement: obs.comportement,
        weather_condition: obs.weather || 'Non renseigné',
        photo_url: obs.photo,
        wikipedia_image: obs.wikipediaImage,
        sound_url: obs.sound,
        habitat: obs.habitat ?? null,
        phenology: obs.phenology ?? null,
        observers: obs.observers && obs.observers.length > 0 ? obs.observers : null
    };

    if (isUuid(obs.id)) {
        row.id = obs.id;
    }

    return row;
};
