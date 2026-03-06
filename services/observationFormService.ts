import { Observation } from '../types';

export type ObservationFormData = Omit<Observation, 'id' | 'count'> & {
    count: number | '';
};

export const validateObservationForm = (formData: ObservationFormData): Record<string, string> => {
    const errors: Record<string, string> = {};
    const numericCount = Number(formData.count);

    if (!formData.speciesName) errors.speciesName = "Le nom de l'espèce est obligatoire.";
    if (!formData.date) errors.date = 'La date est obligatoire.';
    if (!Number.isInteger(numericCount) || numericCount < 1) errors.count = 'Le nombre doit être au moins 1.';
    if (formData.gps.lat !== null && (formData.gps.lat < -90 || formData.gps.lat > 90)) errors.lat = 'La latitude doit être entre -90 et 90.';
    if (formData.gps.lon !== null && (formData.gps.lon < -180 || formData.gps.lon > 180)) errors.lon = 'La longitude doit être entre -180 et 180.';

    return errors;
};

export const buildObservationFromForm = (
    formData: ObservationFormData,
    id: string,
    photoUrl?: string,
    soundUrl?: string
): Observation => ({
    id,
    ...formData,
    photo: photoUrl,
    sound: soundUrl,
    count: Number(formData.count),
    altitude: formData.altitude !== null ? Number(formData.altitude) : null,
    gps: {
        lat: formData.gps.lat !== null ? Number(formData.gps.lat) : null,
        lon: formData.gps.lon !== null ? Number(formData.gps.lon) : null
    },
    sexe: formData.sexe,
    age: formData.age,
    observationCondition: formData.observationCondition,
    comportement: formData.comportement
});
