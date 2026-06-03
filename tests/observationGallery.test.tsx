import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import ObservationGallery from '../components/ObservationGallery';
import { Age, Comportement, Observation, ObservationCondition, Protocol, Sexe, Status, TaxonomicGroup, WeatherCondition } from '../types';

const makeObservation = (overrides: Partial<Observation> = {}): Observation => ({
    id: '123e4567-e89b-42d3-a456-426614174000',
    speciesName: 'Mésange bleue',
    latinName: 'Cyanistes caeruleus',
    taxonomicGroup: TaxonomicGroup.BIRD,
    date: '2026-03-01',
    time: '12:00',
    count: 1,
    location: 'Bois',
    gps: { lat: null, lon: null },
    municipality: 'Lille',
    department: '59',
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
    ...overrides
});

describe('ObservationGallery — FO-50 image cassée', () => {
    it('affiche le placeholder quand l\'image échoue à charger', () => {
        const obs = makeObservation({ wikipediaImage: 'https://upload.wikimedia.org/cassee.jpg' });
        render(<ObservationGallery observations={[obs]} onEdit={vi.fn()} />);

        const img = screen.getByAltText('Mésange bleue') as HTMLImageElement;
        expect(img).toBeTruthy();
        // Pas de placeholder tant que l'image n'a pas échoué.
        expect(screen.queryByText('📷')).toBeNull();

        fireEvent.error(img);

        // Après l'échec : l'image disparaît, le placeholder 📷 prend sa place.
        expect(screen.queryByAltText('Mésange bleue')).toBeNull();
        expect(screen.getByText('📷')).toBeTruthy();
    });
});
