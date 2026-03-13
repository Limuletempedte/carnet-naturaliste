import { render, screen, within } from '@testing-library/react';
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { Age, Comportement, Observation, ObservationCondition, Protocol, Sexe, Status, TaxonomicGroup } from '../types';

vi.mock('recharts', () => {
    const MockContainer = ({ children }: { children?: React.ReactNode }) => <div>{children}</div>;
    return {
        ResponsiveContainer: MockContainer,
        PieChart: MockContainer,
        Pie: MockContainer,
        Cell: () => <div />,
        Tooltip: () => <div />,
        BarChart: MockContainer,
        Bar: () => <div />,
        XAxis: () => <div />,
        YAxis: () => <div />,
        CartesianGrid: () => <div />
    };
});

import ObservationStats from '../components/ObservationStats';

const makeObservation = (overrides: Partial<Observation>): Observation => ({
    id: 'obs-1',
    speciesName: 'Espèce inconnue',
    latinName: '',
    taxonomicGroup: TaxonomicGroup.OTHER,
    date: '2026-03-01',
    time: '09:00',
    count: 1,
    location: 'Lieu',
    gps: { lat: null, lon: null },
    municipality: 'Commune',
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
    ...overrides
});

describe('ObservationStats taxon species cards', () => {
    it('renders taxon cards with logos and distinct species counts', () => {
        const observations: Observation[] = [
            makeObservation({ id: '1', taxonomicGroup: TaxonomicGroup.BIRD, speciesName: 'Mésange bleue' }),
            makeObservation({ id: '2', taxonomicGroup: TaxonomicGroup.BIRD, speciesName: 'mesange  bleue' }),
            makeObservation({ id: '3', taxonomicGroup: TaxonomicGroup.BIRD, speciesName: 'Rougegorge familier' }),
            makeObservation({ id: '4', taxonomicGroup: TaxonomicGroup.MAMMAL, speciesName: 'Renard roux' }),
            makeObservation({ id: '5', taxonomicGroup: TaxonomicGroup.OTHER, speciesName: 'Taxon sans logo' })
        ];

        render(<ObservationStats observations={observations} />);

        expect(screen.getByText('Espèces observées par taxon')).toBeTruthy();

        const cards = screen.getAllByTestId('taxon-species-card');
        expect(cards).toHaveLength(2);
        const hasOtherTaxonCard = cards.some((card) => within(card).queryByText(TaxonomicGroup.OTHER));
        expect(hasOtherTaxonCard).toBe(false);

        const birdCard = cards.find((card) => within(card).queryByText(TaxonomicGroup.BIRD));
        const mammalCard = cards.find((card) => within(card).queryByText(TaxonomicGroup.MAMMAL));

        expect(birdCard).toBeTruthy();
        expect(mammalCard).toBeTruthy();

        expect((birdCard as HTMLElement).textContent).toContain('2');
        expect((birdCard as HTMLElement).textContent).toContain('espèces');
        expect((mammalCard as HTMLElement).textContent).toContain('1');
        expect((mammalCard as HTMLElement).textContent).toContain('espèce');

        expect(within(birdCard as HTMLElement).getByRole('img', { name: TaxonomicGroup.BIRD })).toBeTruthy();
        expect(within(mammalCard as HTMLElement).getByRole('img', { name: TaxonomicGroup.MAMMAL })).toBeTruthy();
    });
});
