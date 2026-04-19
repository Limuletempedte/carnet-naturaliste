import { useMemo, useState } from 'react';
import { Observation, Status, TaxonomicGroup } from '../types';
import { compareIsoDate, getYearFromIsoDate } from '../utils/dateUtils';
import { normalizeSearchText } from '../utils/textUtils';

export type SortDirection = 'ascending' | 'descending';
export type SortKey = keyof Observation | '';
export interface SortCriterion {
    key: SortKey;
    direction: SortDirection;
}

export interface ObservationFilterState {
    searchTerm: string;
    yearFilter: string;
    taxonomicGroupFilter: TaxonomicGroup | 'all';
    statusFilter: Status | 'all';
    startDateFilter: string;
    endDateFilter: string;
    geoMode?: 'none' | 'radius' | 'bbox';
    radiusCenterLat?: string;
    radiusCenterLon?: string;
    radiusKm?: string;
    bboxMinLat?: string;
    bboxMaxLat?: string;
    bboxMinLon?: string;
    bboxMaxLon?: string;
}

const parseOptionalNumber = (value?: string): number | null => {
    if (value === undefined || value === null || value.trim() === '') return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
};

const EARTH_RADIUS_KM = 6371;
const toRadians = (value: number): number => value * (Math.PI / 180);

const distanceKm = (lat1: number, lon1: number, lat2: number, lon2: number): number => {
    const dLat = toRadians(lat2 - lat1);
    const dLon = toRadians(lon2 - lon1);
    const radLat1 = toRadians(lat1);
    const radLat2 = toRadians(lat2);

    const a = Math.sin(dLat / 2) ** 2
        + Math.cos(radLat1) * Math.cos(radLat2) * Math.sin(dLon / 2) ** 2;
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return EARTH_RADIUS_KM * c;
};

const compareObservationValues = (
    left: Observation,
    right: Observation,
    criterion: SortCriterion
): number => {
    const { key, direction } = criterion;
    const directionFactor = direction === 'ascending' ? 1 : -1;
    const leftValue = left[key as keyof Observation];
    const rightValue = right[key as keyof Observation];

    if (leftValue === null || leftValue === undefined) return 1;
    if (rightValue === null || rightValue === undefined) return -1;

    if (key === 'date' && typeof leftValue === 'string' && typeof rightValue === 'string') {
        const cmp = compareIsoDate(leftValue, rightValue);
        return cmp * directionFactor;
    }

    if (typeof leftValue === 'string' && typeof rightValue === 'string') {
        return leftValue.localeCompare(rightValue, 'fr', { sensitivity: 'base' }) * directionFactor;
    }

    if (leftValue < rightValue) return -1 * directionFactor;
    if (leftValue > rightValue) return 1 * directionFactor;
    return 0;
};

export const useObservationFilters = (
    observations: Observation[],
    filters: ObservationFilterState,
    additionalSorts: SortCriterion[] = []
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
            })
            .filter(obs => {
                const geoMode = filters.geoMode || 'none';
                if (geoMode === 'none') return true;
                if (obs.gps.lat === null || obs.gps.lon === null) return false;

                if (geoMode === 'radius') {
                    const centerLat = parseOptionalNumber(filters.radiusCenterLat);
                    const centerLon = parseOptionalNumber(filters.radiusCenterLon);
                    const radiusKm = parseOptionalNumber(filters.radiusKm);
                    if (centerLat === null || centerLon === null || radiusKm === null || radiusKm <= 0) {
                        return true; // filtre incomplet → inclure (flag geoFilterIncomplete ci-dessous)
                    }
                    // Valider les bornes des coordonnées
                    if (centerLat < -90 || centerLat > 90 || centerLon < -180 || centerLon > 180) {
                        return true; // coordonnées invalides → inclure tout
                    }
                    return distanceKm(centerLat, centerLon, obs.gps.lat, obs.gps.lon) <= radiusKm;
                }

                if (geoMode === 'bbox') {
                    const rawMinLat = parseOptionalNumber(filters.bboxMinLat);
                    const rawMaxLat = parseOptionalNumber(filters.bboxMaxLat);
                    const rawMinLon = parseOptionalNumber(filters.bboxMinLon);
                    const rawMaxLon = parseOptionalNumber(filters.bboxMaxLon);

                    if (rawMinLat === null || rawMaxLat === null || rawMinLon === null || rawMaxLon === null) {
                        return true; // filtre incomplet → inclure (flag geoFilterIncomplete ci-dessous)
                    }

                    const minLat = Math.min(rawMinLat, rawMaxLat);
                    const maxLat = Math.max(rawMinLat, rawMaxLat);
                    const minLon = Math.min(rawMinLon, rawMaxLon);
                    const maxLon = Math.max(rawMinLon, rawMaxLon);

                    return obs.gps.lat >= minLat
                        && obs.gps.lat <= maxLat
                        && obs.gps.lon >= minLon
                        && obs.gps.lon <= maxLon;
                }

                return true;
            });

        const sortCriteria: SortCriterion[] = [];
        if (sortConfig.key) {
            sortCriteria.push({ key: sortConfig.key, direction: sortConfig.direction });
        }
        additionalSorts.forEach(sort => {
            if (!sort.key) return;
            if (sortCriteria.some(existing => existing.key === sort.key)) return;
            sortCriteria.push(sort);
        });

        if (sortCriteria.length > 0) {
            sortableItems.sort((a, b) => {
                for (const criterion of sortCriteria) {
                    const cmp = compareObservationValues(a, b, criterion);
                    if (cmp !== 0) return cmp;
                }
                return 0;
            });
        }

        return sortableItems;
    }, [additionalSorts, filters, observations, sortConfig]);

    const geoFilterIncomplete = useMemo(() => {
        const geoMode = filters.geoMode || 'none';
        if (geoMode === 'radius') {
            const lat = parseOptionalNumber(filters.radiusCenterLat);
            const lon = parseOptionalNumber(filters.radiusCenterLon);
            const km = parseOptionalNumber(filters.radiusKm);
            return lat === null || lon === null || km === null || km <= 0
                || lat < -90 || lat > 90 || lon < -180 || lon > 180;
        }
        if (geoMode === 'bbox') {
            const vals = [filters.bboxMinLat, filters.bboxMaxLat, filters.bboxMinLon, filters.bboxMaxLon].map(parseOptionalNumber);
            return vals.some(v => v === null);
        }
        return false;
    }, [filters]);

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
        availableYears,
        geoFilterIncomplete
    };
};
