import { Observation, TaxonomicGroup } from '../types';

export interface BadgeDefinition {
    id: string;
    name: string;
    description: string;
    icon: string;
    condition: (obs: Observation[]) => boolean;
    color: string;
}

export const BADGES_DEFINITIONS: BadgeDefinition[] = [
    {
        id: 'beginner',
        name: 'Débutant',
        description: 'Ajoutez votre première observation.',
        icon: '🌱',
        condition: (obs) => obs.length >= 1,
        color: 'bg-green-100 text-green-800 border-green-200'
    },
    {
        id: 'explorer',
        name: 'Explorateur',
        description: 'Atteignez 10 observations.',
        icon: '🧭',
        condition: (obs) => obs.length >= 10,
        color: 'bg-blue-100 text-blue-800 border-blue-200'
    },
    {
        id: 'expert',
        name: 'Expert',
        description: 'Atteignez 50 observations.',
        icon: '🏆',
        condition: (obs) => obs.length >= 50,
        color: 'bg-purple-100 text-purple-800 border-purple-200'
    },
    {
        id: 'ornithologist',
        name: 'Ornithologue',
        description: 'Observez 5 oiseaux différents.',
        icon: '🦅',
        condition: (obs) => new Set(obs.filter(o => o.taxonomicGroup === TaxonomicGroup.BIRD).map(o => o.speciesName)).size >= 5,
        color: 'bg-sky-100 text-sky-800 border-sky-200'
    },
    {
        id: 'entomologist',
        name: 'Entomologiste',
        description: 'Observez 5 insectes différents.',
        icon: '🐞',
        condition: (obs) => {
            const insectGroups = [
                TaxonomicGroup.ODONATE, TaxonomicGroup.BUTTERFLY, TaxonomicGroup.MOTH,
                TaxonomicGroup.ORTHOPTERA, TaxonomicGroup.HYMENOPTERA, TaxonomicGroup.ANT,
                TaxonomicGroup.MANTIS, TaxonomicGroup.CICADA, TaxonomicGroup.HETEROPTERA,
                TaxonomicGroup.COLEOPTERA, TaxonomicGroup.NEUROPTERA, TaxonomicGroup.DIPTERA,
                TaxonomicGroup.PHASMID, TaxonomicGroup.DERMAPTERA
            ];
            return new Set(obs.filter(o => insectGroups.includes(o.taxonomicGroup)).map(o => o.speciesName)).size >= 5;
        },
        color: 'bg-amber-100 text-amber-800 border-amber-200'
    },
    {
        id: 'botanist',
        name: 'Botaniste',
        description: 'Observez 5 plantes différentes.',
        icon: '🌿',
        condition: (obs) => {
            const plantGroups = [TaxonomicGroup.ORCHID, TaxonomicGroup.BOTANY];
            return new Set(obs.filter(o => plantGroups.includes(o.taxonomicGroup)).map(o => o.speciesName)).size >= 5;
        },
        color: 'bg-emerald-100 text-emerald-800 border-emerald-200'
    },
    {
        id: 'photographer',
        name: 'Photographe',
        description: 'Ajoutez 5 observations avec photo.',
        icon: '📸',
        condition: (obs) => obs.filter(o => o.photo).length >= 5,
        color: 'bg-pink-100 text-pink-800 border-pink-200'
    },
    {
        id: 'traveler',
        name: 'Voyageur',
        description: 'Observez dans 3 communes différentes.',
        icon: '🌍',
        condition: (obs) => new Set(obs.map(o => o.municipality).filter(Boolean)).size >= 3,
        color: 'bg-indigo-100 text-indigo-800 border-indigo-200'
    }
];
