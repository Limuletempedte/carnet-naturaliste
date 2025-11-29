import React from 'react';
import { Observation } from '../types';
import { TAXON_LOGOS } from '../constants';

interface ObservationCardProps {
    observation: Observation;
    onEdit: (id: string) => void;
    onDelete: (id: string) => void;
    selected: boolean;
    onToggle: (id: string) => void;
}

const ObservationCard: React.FC<ObservationCardProps> = ({ observation, onEdit, onDelete, selected, onToggle }) => {
    return (
        <div className={`bg-white/60 dark:bg-nature-dark-surface/60 backdrop-blur-md rounded-2xl p-4 shadow-sm border border-white/20 dark:border-white/5 mb-4 relative overflow-hidden group ${selected ? 'ring-2 ring-nature-green bg-nature-green/5' : ''}`}>
            <div className="flex items-start gap-4">
                {/* Checkbox */}
                <div className="pt-1">
                    <input
                        type="checkbox"
                        checked={selected}
                        onChange={() => onToggle(observation.id)}
                        className="w-5 h-5 rounded border-gray-300 text-nature-green focus:ring-nature-green cursor-pointer"
                    />
                </div>
                {/* Image or Icon */}
                <div className="w-20 h-20 rounded-xl overflow-hidden flex-shrink-0 bg-gray-100 dark:bg-black/20 relative">
                    {observation.photo ? (
                        <img src={observation.photo} alt={observation.speciesName} className="w-full h-full object-cover" />
                    ) : observation.wikipediaImage ? (
                        <img src={observation.wikipediaImage} alt={observation.speciesName} className="w-full h-full object-cover" />
                    ) : (
                        <div className="w-full h-full flex items-center justify-center text-3xl opacity-50">
                            {TAXON_LOGOS[observation.taxonomicGroup] ? (
                                <img src={TAXON_LOGOS[observation.taxonomicGroup]} alt={observation.taxonomicGroup} className="w-10 h-10 opacity-50" />
                            ) : '🐾'}
                        </div>
                    )}
                    <div className="absolute top-0 right-0 bg-nature-green text-white text-[10px] font-bold px-1.5 py-0.5 rounded-bl-lg">
                        {observation.count}
                    </div>
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                    <div className="flex justify-between items-start">
                        <div>
                            <h3 className="font-bold text-nature-dark dark:text-white truncate pr-2">{observation.speciesName}</h3>
                            <p className="text-xs text-gray-500 dark:text-gray-400 italic truncate">{observation.latinName}</p>
                        </div>
                        <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${observation.status === 'LC' ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' :
                            observation.status === 'NT' ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400' :
                                'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
                            }`}>
                            {observation.status}
                        </span>
                    </div>

                    <div className="mt-2 space-y-1">
                        <div className="flex items-center text-xs text-gray-600 dark:text-gray-300">
                            <span className="mr-1">📍</span>
                            <span className="truncate">{observation.location}</span>
                        </div>
                        <div className="flex items-center text-xs text-gray-600 dark:text-gray-300">
                            <span className="mr-1">📅</span>
                            <span>{new Date(observation.date).toLocaleDateString()}</span>
                        </div>
                    </div>
                </div>
            </div>

            {/* Actions */}
            <div className="mt-4 flex justify-end gap-2 border-t border-gray-100 dark:border-white/5 pt-3">
                <button
                    onClick={() => onEdit(observation.id)}
                    className="px-3 py-1.5 text-xs font-medium text-nature-green bg-nature-green/10 rounded-lg hover:bg-nature-green/20 transition-colors"
                >
                    Modifier
                </button>
                <button
                    onClick={() => onDelete(observation.id)}
                    className="px-3 py-1.5 text-xs font-medium text-red-500 bg-red-500/10 rounded-lg hover:bg-red-500/20 transition-colors"
                >
                    Supprimer
                </button>
            </div>
        </div>
    );
};

export default ObservationCard;
