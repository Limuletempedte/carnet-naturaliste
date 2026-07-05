import React from 'react';
import { Observation } from '../types';
import { TAXON_LOGOS } from '../constants';
import { isoToFrDisplay } from '../utils/dateUtils';
import { isSafeImageUrl } from '../utils/urlUtils';
import { PawIcon, MapPinIcon, CalendarIcon } from './icons';

interface ObservationCardProps {
    observation: Observation;
    // EE-2 : le clic sur la zone image + contenu ouvre la vue détail (lecture seule).
    onView: (id: string) => void;
    onEdit: (id: string) => void;
    onDelete: (id: string) => void;
    selected: boolean;
    onToggle: (id: string) => void;
}

const getStatusBadgeClass = (status: string): string => {
    switch (status) {
        case 'LC': return 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300';
        case 'NT': return 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300';
        case 'VU': return 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300';
        case 'EN':
        case 'CR': return 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300';
        default: return 'bg-gray-100 text-gray-600 dark:bg-gray-800/30 dark:text-gray-400';
    }
};

const ObservationCard: React.FC<ObservationCardProps> = React.memo(({ observation, onView, onEdit, onDelete, selected, onToggle }) => {
    return (
        <div className={`bg-white/60 dark:bg-nature-dark-surface/60 backdrop-blur-md rounded-2xl p-4 shadow-sm border border-white/20 dark:border-white/5 mb-4 relative overflow-hidden group ${selected ? 'ring-2 ring-nature-green bg-nature-green/5' : ''}`}>
            <div className="flex items-start gap-4">
                {/* Checkbox */}
                <div className="pt-1 min-w-[44px] min-h-[44px] flex items-center justify-center">
                    <input
                        type="checkbox"
                        checked={selected}
                        onChange={() => onToggle(observation.id)}
                        aria-label={`Sélectionner ${observation.speciesName}`}
                        className="w-6 h-6 rounded border-gray-300 text-nature-green focus:ring-nature-green cursor-pointer"
                    />
                </div>
                {/* Zone cliquable (image + contenu) → vue détail. La checkbox et les
                    boutons d'action restent en dehors : pas de conflit de clic. */}
                <div
                    role="button"
                    tabIndex={0}
                    aria-label={`Voir l'observation de ${observation.speciesName}`}
                    onClick={() => onView(observation.id)}
                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onView(observation.id); } }}
                    className="flex flex-1 items-start gap-4 min-w-0 cursor-pointer rounded-xl focus:outline-none focus-visible:ring-2 focus-visible:ring-nature-green"
                >
                    {/* Image or Icon */}
                    <div className="w-20 h-20 rounded-xl overflow-hidden flex-shrink-0 bg-gray-100 dark:bg-black/20 relative">
                        {observation.photo && isSafeImageUrl(observation.photo) ? (
                            <img src={observation.photo} alt={observation.speciesName} loading="lazy" className="w-full h-full object-cover" />
                        ) : observation.wikipediaImage && isSafeImageUrl(observation.wikipediaImage) ? (
                            <img src={observation.wikipediaImage} alt={observation.speciesName} loading="lazy" className="w-full h-full object-cover" />
                        ) : (
                            <div className="w-full h-full flex items-center justify-center text-3xl opacity-50">
                                {TAXON_LOGOS[observation.taxonomicGroup] ? (
                                    <img src={TAXON_LOGOS[observation.taxonomicGroup]} alt={observation.taxonomicGroup} loading="lazy" className="w-10 h-10 opacity-50" />
                                ) : <PawIcon className="w-8 h-8" />}
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
                            <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${getStatusBadgeClass(observation.status)}`}>
                                {observation.status}
                            </span>
                        </div>

                        <div className="mt-2 space-y-1">
                            <div className="flex items-center text-xs text-gray-600 dark:text-gray-300">
                                <MapPinIcon className="w-3.5 h-3.5 mr-1 shrink-0" />
                                <span className="truncate">{observation.location}</span>
                            </div>
                            <div className="flex items-center text-xs text-gray-600 dark:text-gray-300">
                                <CalendarIcon className="w-3.5 h-3.5 mr-1 shrink-0" />
                                <span>{isoToFrDisplay(observation.date, { year: 'numeric', month: '2-digit', day: '2-digit' })}</span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Actions */}
            <div className="mt-4 flex justify-end gap-2 border-t border-gray-100 dark:border-white/5 pt-3">
                <button
                    onClick={() => onEdit(observation.id)}
                    className="px-4 py-2.5 text-sm font-medium text-nature-green-text bg-nature-green/10 rounded-lg hover:bg-nature-green/20 transition-colors min-h-[44px]"
                >
                    Modifier
                </button>
                <button
                    onClick={() => onDelete(observation.id)}
                    className="px-4 py-2.5 text-sm font-medium text-red-500 bg-red-500/10 rounded-lg hover:bg-red-500/20 transition-colors min-h-[44px]"
                >
                    Supprimer
                </button>
            </div>
        </div>
    );
});

export default ObservationCard;
