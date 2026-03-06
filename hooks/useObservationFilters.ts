import { useMemo, useState } from 'react';
import { Observation, Status, TaxonomicGroup } from '../types';
import { compareIsoDate, getYearFromIsoDate } from '../utils/dateUtils';
import { normalizeSearchText } from '../utils/textUtils';

export type SortDirection = 'ascending' | 'descending';
export type SortKey = keyof Observation | '';

export interface ObservationFilterState {
    searchTerm: string;
    yearFilter: string;
    taxonomicGroupFilter: TaxonomicGroup | 'all';
    statusFilter: Status | 'all';
    startDateFilter: string;
    endDateFilter: string;
}

export const useObservationFilters = (
    observations: Observation[],
    filters: ObservationFilterState
) => {
    const [sortConfig, setSortConfig] = useState<{ key: SortKey; direction: SortDirection }>({
        key: 'date',
        direction: 'descending'
    });

    const requestSort = (key: SortKey) => {
        let direction: SortDirection = 'ascending';
        if (sortConfig.key === key && sortConfig.direction === 'ascending') {
            direction = 'descending';
        }
        setSortConfig({ key, direction });
    };

    const sortedAndFilteredObservations = useMemo(() => {
        let sortableItems = [...observations];

        sortableItems = sortableItems
            .filter(obs => {
                if (filters.yearFilter === 'all') return true;
                return getYearFromIsoDate(obs.date) === filters.yearFilter;
            })
            .filter(obs => {
                if (filters.taxonomicGroupFilter === 'all') return true;
                return obs.taxonomicGroup === filters.taxonomicGroupFilter;
            })
            .filter(obs => {
                if (filters.statusFilter === 'all') return true;
                return obs.status === filters.statusFilter;
            })
            .filter(obs => {
                if (!filters.startDateFilter) return true;
                return compareIsoDate(obs.date, filters.startDateFilter) >= 0;
            })
            .filter(obs => {
                if (!filters.endDateFilter) return true;
                return compareIsoDate(obs.date, filters.endDateFilter) <= 0;
            })
            .filter(obs => {
                if (!filters.searchTerm) return true;
                const normalizedSearchTerm = normalizeSearchText(filters.searchTerm);
                return (
                    normalizeSearchText(obs.speciesName).includes(normalizedSearchTerm) ||
                    (obs.latinName && normalizeSearchText(obs.latinName).includes(normalizedSearchTerm)) ||
                    (obs.location && normalizeSearchText(obs.location).includes(normalizedSearchTerm)) ||
                    (obs.municipality && normalizeSearchText(obs.municipality).includes(normalizedSearchTerm))
                );
            });

        if (sortConfig.key) {
            sortableItems.sort((a, b) => {
                const key = sortConfig.key as keyof Observation;
                const aValue = a[key];
                const bValue = b[key];

                if (aValue === null || aValue === undefined) return 1;
                if (bValue === null || bValue === undefined) return -1;

                if (key === 'date' && typeof aValue === 'string' && typeof bValue === 'string') {
                    const dateCmp = compareIsoDate(aValue, bValue);
                    return sortConfig.direction === 'ascending' ? dateCmp : -dateCmp;
                }

                if (aValue < bValue) {
                    return sortConfig.direction === 'ascending' ? -1 : 1;
                }
                if (aValue > bValue) {
                    return sortConfig.direction === 'ascending' ? 1 : -1;
                }
                return 0;
            });
        }

        return sortableItems;
    }, [filters, observations, sortConfig]);

    const availableYears = useMemo(() => {
        const years = new Set(
            observations
                .map(obs => getYearFromIsoDate(obs.date))
                .filter((year): year is string => !!year)
        );
        return Array.from(years).sort((a, b) => parseInt(b) - parseInt(a));
    }, [observations]);

    return {
        sortConfig,
        requestSort,
        sortedAndFilteredObservations,
        availableYears
    };
};
