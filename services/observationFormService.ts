import { Observation } from '../types';

export type ObservationFormData = Omit<Observation, 'id' | 'count' | 'maleCount' | 'femaleCount' | 'unidentifiedCount'> & {
    count: number | '';
    maleCount: number | '';
    femaleCount: number | '';
    unidentifiedCount: number | '';
};

const parseOptionalInteger = (value: number | ''): number | null => {
    if (value === '') return null;
    if (!Number.isInteger(value) || value < 0) return null;
    return value;
};

export const validateObservationForm = (formData: ObservationFormData): Record<string, string> => {
    const errors: Record<string, string> = {};
    const numericCount = Number(formData.count);
    const numericMaleCount = parseOptionalInteger(formData.maleCount);
    const numericFemaleCount = parseOptionalInteger(formData.femaleCount);
    const numericUnidentifiedCount = parseOptionalInteger(formData.unidentifiedCount);
    const hasAnyBreakdown = formData.maleCount !== '' || formData.femaleCount !== '' || formData.unidentifiedCount !== '';

    if (!formData.speciesName) errors.speciesName = "Le nom de l'espèce est obligatoire.";
    if (!formData.date) errors.date = 'La date est obligatoire.';
    if (!Number.isInteger(numericCount) || numericCount < 1) errors.count = 'Le nombre doit être au moins 1.';
    if (formData.maleCount !== '' && numericMaleCount === null) errors.maleCount = 'Le nombre de mâles doit être un entier >= 0.';
    if (formData.femaleCount !== '' && numericFemaleCount === null) errors.femaleCount = 'Le nombre de femelles doit être un entier >= 0.';
    if (formData.unidentifiedCount !== '' && numericUnidentifiedCount === null) errors.unidentifiedCount = 'Le nombre non identifié doit être un entier >= 0.';
    if (
        hasAnyBreakdown
        && Number.isInteger(numericCount)
        && numericCount >= 1
        && !errors.maleCount
        && !errors.femaleCount
        && !errors.unidentifiedCount
        && ((numericMaleCount ?? 0) + (numericFemaleCount ?? 0) + (numericUnidentifiedCount ?? 0) !== numericCount)
    ) {
        errors.countBreakdown = 'La somme mâle + femelle + non identifié doit être égale au total.';
    }
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
    maleCount: formData.maleCount === '' ? undefined : Number(formData.maleCount),
    femaleCount: formData.femaleCount === '' ? undefined : Number(formData.femaleCount),
    unidentifiedCount: formData.unidentifiedCount === '' ? undefined : Number(formData.unidentifiedCount),
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
