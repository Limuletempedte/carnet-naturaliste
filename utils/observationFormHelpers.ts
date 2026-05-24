import {
    Observation,
    TaxonomicGroup,
    Status,
    Protocol,
    Sexe,
    Age,
    ObservationCondition,
    Comportement,
    WeatherCondition,
    Habitat,
    Phenology,
} from '../types';
import type { ObservationFormData } from '../services/observationFormService';
import { dateToIsoLocal } from './dateUtils';
import { normalizeSearchText } from './textUtils';

/** Clé d'identification d'une espèce : nom latin prioritaire, sinon nom commun. */
export const getObservationLookupKey = (speciesName: string, latinName: string): string => {
    return latinName.trim() || speciesName.trim();
};

/** Normalise une clé de lookup (minuscules, sans accents) pour comparaison stable. */
export const normalizeLookupKey = (value: string): string => normalizeSearchText(value || '');

/** Formulaire vierge avec les valeurs par défaut (date/heure du jour). */
export const createEmptyFormData = (defaultTaxonomicGroup: TaxonomicGroup): ObservationFormData => ({
    speciesName: '',
    latinName: '',
    taxonomicGroup: defaultTaxonomicGroup,
    date: dateToIsoLocal(new Date()),
    time: new Date().toTimeString().substring(0, 5),
    count: 1,
    maleCount: '',
    femaleCount: '',
    unidentifiedCount: '',
    location: '',
    gps: { lat: null, lon: null },
    municipality: '',
    department: '',
    country: 'France',
    altitude: null,
    comment: '',
    status: Status.NE,
    atlasCode: '',
    protocol: Protocol.OPPORTUNIST,
    sexe: Sexe.UNKNOWN,
    age: Age.UNKNOWN,
    observationCondition: ObservationCondition.UNKNOWN,
    comportement: Comportement.UNKNOWN,
    weather: WeatherCondition.UNKNOWN,
    photo: undefined,
    sound: undefined,
    wikipediaImage: undefined,
    habitat: Habitat.UNKNOWN,
    phenology: Phenology.UNKNOWN,
    observers: undefined,
});

/** Convertit une observation existante en données de formulaire éditables. */
export const mapObservationToFormData = (observation: Observation): ObservationFormData => ({
    ...observation,
    count: observation.count,
    maleCount: observation.maleCount ?? '',
    femaleCount: observation.femaleCount ?? '',
    unidentifiedCount: observation.unidentifiedCount ?? '',
});
