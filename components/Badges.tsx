import React, { useMemo } from 'react';
import { Observation } from '../types';
import { BADGES_DEFINITIONS } from '../utils/badgeUtils';

interface BadgesProps {
    observations: Observation[];
}

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
