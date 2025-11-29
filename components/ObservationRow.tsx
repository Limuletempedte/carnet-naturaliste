import React from 'react';
import { Observation } from '../types';
import { TAXON_LOGOS } from '../constants';

interface ObservationRowProps {
    observation: Observation;
    onEdit: (id: string) => void;
    onDelete: (id: string) => void;
    selected: boolean;
    onToggle: (id: string) => void;
}

const ObservationRow: React.FC<ObservationRowProps> = ({ observation, onEdit, onDelete, selected, onToggle }) => {
    const { id, speciesName, latinName, taxonomicGroup, location, date, count, photo, wikipediaImage } = observation;

    const logo = TAXON_LOGOS[taxonomicGroup as keyof typeof TAXON_LOGOS];
    const imageSrc = photo || wikipediaImage;

    return (
        <tr className={`border-b border-gray-100/50 dark:border-white/5 hover:bg-white/40 dark:hover:bg-white/5 transition-all duration-300 group relative backdrop-blur-sm ${selected ? 'bg-nature-green/10 dark:bg-nature-green/20' : ''}`}>
            <td className="p-6 align-middle">
                <input
                    type="checkbox"
                    checked={selected}
                    onChange={() => onToggle(id)}
                    className="w-5 h-5 rounded border-gray-300 text-nature-green focus:ring-nature-green cursor-pointer"
                />
            </td>
            <td className="p-6 align-middle">
                <div className="flex items-center gap-4">
                    {logo && <img src={logo} alt={taxonomicGroup} className="w-10 h-10 object-contain rounded-full bg-white/80 dark:bg-white/10 p-1 shadow-sm ring-1 ring-gray-100/50 dark:ring-white/5 backdrop-blur-md" />}
                    <span className="font-medium text-sm text-gray-900 dark:text-white">{taxonomicGroup}</span>
                </div>
            </td>
            <td className="p-6 align-middle">
                <div className="flex items-center gap-4">
                    {imageSrc && (
                        <img
                            src={imageSrc}
                            alt={speciesName}
                            className="w-12 h-12 object-cover rounded-2xl shadow-sm ring-1 ring-gray-100/50 dark:ring-white/5"
                        />
                    )}
                    <div>
                        <div className="font-bold text-nature-dark dark:text-white text-base">{speciesName}</div>
                        <div className="text-sm text-gray-500 dark:text-gray-400 italic">{latinName}</div>
                    </div>
                </div>
            </td>
            <td className="p-6 align-middle hidden md:table-cell">
                <div className="text-sm font-medium text-gray-700 dark:text-gray-300">{location}</div>
                <div className="text-xs text-gray-500 dark:text-gray-500">{observation.municipality}</div>
            </td>
            <td className="p-6 align-middle hidden lg:table-cell">
                <span className="text-sm text-gray-600 dark:text-gray-400">{new Date(date).toLocaleDateString('fr-FR', { year: 'numeric', month: 'long', day: 'numeric' })}</span>
            </td>
            <td className="p-6 align-middle text-center">
                <span className="inline-flex items-center justify-center px-3 py-1 rounded-full text-sm font-bold bg-nature-green/10 text-nature-green dark:bg-nature-green/20 dark:text-nature-green backdrop-blur-md">
                    {count}
                </span>
            </td>
            <td className="p-6 align-middle text-center">
                <div className="flex justify-center items-center gap-3 opacity-0 group-hover:opacity-100 transition-all duration-300 transform translate-y-2 group-hover:translate-y-0">
                    <button
                        onClick={() => onEdit(id)}
                        className="p-2 text-blue-600 bg-blue-50/50 hover:bg-blue-100/80 dark:text-blue-400 dark:bg-blue-900/20 dark:hover:bg-blue-900/40 rounded-full transition-all shadow-sm backdrop-blur-md hover:scale-110"
                        aria-label="Modifier"
                        title="Modifier"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                            <path d="M17.414 2.586a2 2 0 00-2.828 0L7 10.172V13h2.828l7.586-7.586a2 2 0 000-2.828z" />
                            <path fillRule="evenodd" d="M2 6a2 2 0 012-2h4a1 1 0 010 2H4v10h10v-4a1 1 0 112 0v4a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" clipRule="evenodd" />
                        </svg>
                    </button>
                    <button
                        onClick={() => onDelete(id)}
                        className="p-2 text-red-600 bg-red-50/50 hover:bg-red-100/80 dark:text-red-400 dark:bg-red-900/20 dark:hover:bg-red-900/40 rounded-full transition-all shadow-sm backdrop-blur-md hover:scale-110"
                        aria-label="Supprimer"
                        title="Supprimer"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                            <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm4 0a1 1 0 012 0v6a1 1 0 11-2 0V8z" clipRule="evenodd" />
                        </svg>
                    </button>
                </div>
            </td>
        </tr>
    );
};

export default ObservationRow;