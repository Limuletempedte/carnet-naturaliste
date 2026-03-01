import React from 'react';
import { Status } from '../types';

interface FilterBarProps {
    searchTerm: string;
    onSearchChange: (value: string) => void;
    yearFilter: string;
    onYearChange: (value: string) => void;
    statusFilter: Status | 'all';
    onStatusChange: (value: Status | 'all') => void;
    availableYears: string[];
    isMobileView: boolean;
    searchId?: string;
}

const FilterBar: React.FC<FilterBarProps> = ({
    searchTerm,
    onSearchChange,
    yearFilter,
    onYearChange,
    statusFilter,
    onStatusChange,
    availableYears,
    isMobileView,
    searchId = 'search-input-filter'
}) => {
    return (
        <div className={`${isMobileView ? 'p-3 bg-white/70 dark:bg-nature-dark-surface/70 backdrop-blur-md rounded-xl shadow-sm space-y-2' : 'p-6 bg-white/60 dark:bg-nature-dark-surface/60 backdrop-blur-sm rounded-xl shadow-lg space-y-6'}`}>
            <div className={`grid ${isMobileView ? 'grid-cols-2 gap-2' : 'grid-cols-1 md:grid-cols-3 gap-6'} items-end`}>
                <div className={`relative ${isMobileView ? '' : 'md:col-span-1'}`}>
                    <label htmlFor={searchId} className={`block font-bold text-gray-700 dark:text-gray-300 mb-1 ${isMobileView ? 'text-xs' : 'text-sm'}`}>Recherche</label>
                    <input
                        type="text"
                        id={searchId}
                        placeholder="Espèce, lieu..."
                        value={searchTerm}
                        onChange={e => onSearchChange(e.target.value)}
                        className={`w-full border border-nature-light-gray dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-nature-green focus:border-transparent transition dark:bg-nature-dark-bg dark:text-white ${isMobileView ? 'px-2 py-1.5 text-xs' : 'px-4 py-2'}`}
                    />
                </div>
                <div>
                    <label className={`block font-bold text-gray-700 dark:text-gray-300 mb-1 ${isMobileView ? 'text-xs' : 'text-sm'}`}>Année</label>
                    <select
                        value={yearFilter}
                        onChange={e => onYearChange(e.target.value)}
                        className={`w-full border border-nature-light-gray dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-nature-green focus:border-transparent transition dark:bg-nature-dark-bg dark:text-white ${isMobileView ? 'p-1.5 text-xs' : 'p-2'}`}
                    >
                        <option value="all">Toutes</option>
                        {availableYears.map(year => (
                            <option key={year} value={year}>{year}</option>
                        ))}
                    </select>
                </div>
                {!isMobileView && (
                    <div>
                        <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-1">Statut</label>
                        <select
                            value={statusFilter}
                            onChange={e => onStatusChange(e.target.value as Status | 'all')}
                            className="w-full border border-nature-light-gray dark:border-gray-600 rounded-lg p-2 focus:ring-2 focus:ring-nature-green focus:border-transparent transition dark:bg-nature-dark-bg dark:text-white"
                        >
                            <option value="all">Tous</option>
                            {Object.values(Status).map(status => (
                                <option key={status} value={status}>{status}</option>
                            ))}
                        </select>
                    </div>
                )}
            </div>
        </div>
    );
};

export default FilterBar;
