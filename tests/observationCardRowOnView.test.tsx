import { render, screen, fireEvent } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import ObservationCard from '../components/ObservationCard';
import ObservationRow from '../components/ObservationRow';
import { Age, Comportement, Observation, ObservationCondition, Protocol, Sexe, Status, TaxonomicGroup, WeatherCondition } from '../types';

const makeObservation = (overrides: Partial<Observation> = {}): Observation => ({
    id: '123e4567-e89b-42d3-a456-426614174000',
    speciesName: 'Mésange bleue',
    latinName: 'Cyanistes caeruleus',
    taxonomicGroup: TaxonomicGroup.BIRD,
    date: '2026-03-01',
    time: '09:30',
    count: 1,
    location: 'Bois',
    gps: { lat: null, lon: null },
    municipality: 'Lille',
    department: '59',
    country: 'France',
    altitude: null,
    comment: '',
    status: Status.LC,
    atlasCode: '',
    protocol: Protocol.OPPORTUNIST,
    sexe: Sexe.UNKNOWN,
    age: Age.UNKNOWN,
    observationCondition: ObservationCondition.UNKNOWN,
    comportement: Comportement.UNKNOWN,
    weather: WeatherCondition.UNKNOWN,
    ...overrides
});

// EE-2 : le clic sur une carte/ligne ouvre la vue détail, SANS casser les
// boutons rapides Modifier/Supprimer ni la checkbox de sélection multiple.
describe('ObservationCard — ouverture de la vue détail', () => {
    const setup = () => {
        const handlers = { onView: vi.fn(), onEdit: vi.fn(), onDelete: vi.fn(), onToggle: vi.fn() };
        const obs = makeObservation();
        render(
            <ObservationCard
                observation={obs}
                onView={handlers.onView}
                onEdit={handlers.onEdit}
                onDelete={handlers.onDelete}
                selected={false}
                onToggle={handlers.onToggle}
            />
        );
        return { handlers, obs };
    };

    it('le clic sur la zone contenu appelle onView', () => {
        const { handlers, obs } = setup();
        fireEvent.click(screen.getByRole('button', { name: 'Voir l\'observation de Mésange bleue' }));
        expect(handlers.onView).toHaveBeenCalledWith(obs.id);
        expect(handlers.onEdit).not.toHaveBeenCalled();
        expect(handlers.onDelete).not.toHaveBeenCalled();
    });

    it('la touche Entrée sur la zone contenu appelle onView (accès clavier)', () => {
        const { handlers, obs } = setup();
        fireEvent.keyDown(screen.getByRole('button', { name: 'Voir l\'observation de Mésange bleue' }), { key: 'Enter' });
        expect(handlers.onView).toHaveBeenCalledWith(obs.id);
    });

    it('la checkbox de sélection n\'ouvre pas la vue détail', () => {
        const { handlers, obs } = setup();
        fireEvent.click(screen.getByLabelText('Sélectionner Mésange bleue'));
        expect(handlers.onToggle).toHaveBeenCalledWith(obs.id);
        expect(handlers.onView).not.toHaveBeenCalled();
    });

    it('les boutons rapides Modifier/Supprimer fonctionnent sans ouvrir le détail', () => {
        const { handlers, obs } = setup();
        fireEvent.click(screen.getByRole('button', { name: 'Modifier' }));
        expect(handlers.onEdit).toHaveBeenCalledWith(obs.id);
        fireEvent.click(screen.getByRole('button', { name: 'Supprimer' }));
        expect(handlers.onDelete).toHaveBeenCalledWith(obs.id);
        expect(handlers.onView).not.toHaveBeenCalled();
    });
});

describe('ObservationRow — ouverture de la vue détail', () => {
    const setup = () => {
        const handlers = { onView: vi.fn(), onEdit: vi.fn(), onDelete: vi.fn(), onToggle: vi.fn() };
        const obs = makeObservation();
        render(
            <table>
                <tbody>
                    <ObservationRow
                        observation={obs}
                        onView={handlers.onView}
                        onEdit={handlers.onEdit}
                        onDelete={handlers.onDelete}
                        selected={false}
                        onToggle={handlers.onToggle}
                    />
                </tbody>
            </table>
        );
        return { handlers, obs };
    };

    it('le clic sur la ligne appelle onView', () => {
        const { handlers, obs } = setup();
        fireEvent.click(screen.getByRole('row'));
        expect(handlers.onView).toHaveBeenCalledWith(obs.id);
    });

    it('le nom d\'espèce est un bouton qui appelle onView une seule fois', () => {
        const { handlers, obs } = setup();
        fireEvent.click(screen.getByRole('button', { name: 'Voir l\'observation de Mésange bleue' }));
        expect(handlers.onView).toHaveBeenCalledTimes(1);
        expect(handlers.onView).toHaveBeenCalledWith(obs.id);
    });

    it('la checkbox de sélection n\'ouvre pas la vue détail', () => {
        const { handlers, obs } = setup();
        fireEvent.click(screen.getByLabelText('Sélectionner Mésange bleue'));
        expect(handlers.onToggle).toHaveBeenCalledWith(obs.id);
        expect(handlers.onView).not.toHaveBeenCalled();
    });

    it('les boutons rapides Modifier/Supprimer fonctionnent sans ouvrir le détail', () => {
        const { handlers, obs } = setup();
        fireEvent.click(screen.getByRole('button', { name: 'Modifier' }));
        expect(handlers.onEdit).toHaveBeenCalledWith(obs.id);
        fireEvent.click(screen.getByRole('button', { name: 'Supprimer' }));
        expect(handlers.onDelete).toHaveBeenCalledWith(obs.id);
        expect(handlers.onView).not.toHaveBeenCalled();
    });
});
