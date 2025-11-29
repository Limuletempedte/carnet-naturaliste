import React, { useMemo } from 'react';
import { Observation, TaxonomicGroup } from '../types';

interface BadgesProps {
    observations: Observation[];
}

interface Badge {
    id: string;
    name: string;
    description: string;
    icon: string;
    condition: (obs: Observation[]) => boolean;
    color: string;
}

const BADGES_DEFINITIONS: Badge[] = [
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
                TaxonomicGroup.ORTHOPTERA, TaxonomicGroup.HYMENOPTERA, TaxonomicGroup.MANTIS,
                TaxonomicGroup.CICADA, TaxonomicGroup.HETEROPTERA, TaxonomicGroup.COLEOPTERA,
                TaxonomicGroup.NEUROPTERA, TaxonomicGroup.DIPTERA, TaxonomicGroup.PHASMID
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

const Badges: React.FC<BadgesProps> = ({ observations }) => {
    const badgesStatus = useMemo(() => {
        return BADGES_DEFINITIONS.map(badge => ({
            ...badge,
            unlocked: badge.condition(observations)
        }));
    }, [observations]);

    return (
        <div className="bg-white/80 dark:bg-nature-dark-surface/80 backdrop-blur-xl p-8 rounded-3xl shadow-ios border border-white/20 dark:border-white/5 animate-fadeIn">
            <h3 className="text-xl font-bold text-nature-dark dark:text-white mb-8">
                Badges & Succès
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
                {badgesStatus.map(badge => (
                    <div
                        key={badge.id}
                        className={`p-6 rounded-2xl border transition-all duration-300 relative overflow-hidden group ${badge.unlocked
                            ? `${badge.color} shadow-sm hover:shadow-md transform hover:-translate-y-1 border-transparent`
                            : 'bg-gray-50 dark:bg-white/5 text-gray-400 dark:text-gray-600 border-gray-100 dark:border-white/5 grayscale opacity-60'
                            }`}
                    >
                        <div className="flex items-center gap-4 mb-3">
                            <span className="text-4xl filter drop-shadow-sm transform group-hover:scale-110 transition-transform duration-300">{badge.icon}</span>
                            <h4 className="font-bold text-sm leading-tight">{badge.name}</h4>
                        </div>
                        <p className="text-xs font-medium opacity-80 leading-relaxed">{badge.description}</p>
                        {badge.unlocked && (
                            <div className="absolute top-3 right-3">
                                <div className="w-2 h-2 rounded-full bg-current animate-pulse"></div>
                            </div>
                        )}
                    </div>
                ))}
            </div>
        </div>
    );
};

export default Badges;
