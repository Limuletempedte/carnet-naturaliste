import { Observation, Status } from '../types';
import { TaxonSpeciesCard, buildTaxonSpeciesCards } from './observationStatsUtils';
import { getMonthIndexFromIsoDate } from './dateUtils';
import { BADGES_DEFINITIONS } from './badgeUtils';

export interface BadgeReport {
    id: string;
    name: string;
    icon: string;
    description: string;
    unlocked: boolean;
}

export interface RankedGroupDatum {
    name: string;
    value: number;
    percentage: number;
    color: string;
    isOther?: boolean;
}

export interface StatusDatum {
    [key: string]: string | number;
    name: Status;
    value: number;
    percentage: number;
    color: string;
}

export interface StatsReportData {
    totalObservations: number;
    uniqueSpecies: number;
    uniqueLocations: number;
    uniqueGroups: number;
    taxonSpeciesCards: TaxonSpeciesCard[];
    groupData: Array<{ name: string; value: number }>;
    rankedGroupData: RankedGroupDatum[];
    statusData: StatusDatum[];
    activityData: Array<{ name: string; observations: number }>;
    topSpecies: Array<{ name: string; count: number }>;
    badges: BadgeReport[];
}

export const MONTHS_ORDER = [
    'janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin',
    'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'
];

export const GROUP_DISPLAY_LIMIT = 6;

export const GROUP_COLORS = [
    '#2F7D5C',
    '#C87B42',
    '#487A78',
    '#A16B3B',
    '#6D8A5B',
    '#7B6D52'
];

export const STATUS_COLORS: Record<string, string> = {
    [Status.CR]: '#B91C1C',
    [Status.EN]: '#DC2626',
    [Status.VU]: '#D97706',
    [Status.NT]: '#D4A017',
    [Status.LC]: '#1D4ED8',
    [Status.DD]: '#6B7280',
    [Status.NE]: '#18BFA5',
    [Status.EW]: '#7C3AED',
    [Status.EX]: '#374151'
};

const STATUS_ORDER: Status[] = [
    Status.CR,
    Status.EN,
    Status.VU,
    Status.NT,
    Status.LC,
    Status.DD,
    Status.NE,
    Status.EW,
    Status.EX
];

const roundPercentage = (value: number, total: number): number => {
    if (!total) return 0;
    return Number(((value / total) * 100).toFixed(1));
};

const sortEntriesByValueThenName = (entries: Array<[string, number]>): Array<[string, number]> => {
    return entries.sort((a, b) => {
        if (b[1] !== a[1]) return b[1] - a[1];
        return a[0].localeCompare(b[0], 'fr');
    });
};

const buildRankedGroupData = (groupCounts: Record<string, number>, totalObservations: number): RankedGroupDatum[] => {
    const sortedGroups = sortEntriesByValueThenName(Object.entries(groupCounts));
    if (sortedGroups.length === 0) return [];

    const shouldAggregateOthers = sortedGroups.length > GROUP_DISPLAY_LIMIT;
    const visibleGroups = shouldAggregateOthers
        ? sortedGroups.slice(0, GROUP_DISPLAY_LIMIT - 1)
        : sortedGroups;
    const hiddenGroups = shouldAggregateOthers
        ? sortedGroups.slice(GROUP_DISPLAY_LIMIT - 1)
        : [];

    const rankedGroups: RankedGroupDatum[] = visibleGroups.map(([name, value], index) => ({
        name,
        value,
        percentage: roundPercentage(value, totalObservations),
        color: GROUP_COLORS[index % GROUP_COLORS.length]
    }));

    if (hiddenGroups.length > 0) {
        const othersValue = hiddenGroups.reduce((sum, [, value]) => sum + value, 0);
        rankedGroups.push({
            name: 'Autres',
            value: othersValue,
            percentage: roundPercentage(othersValue, totalObservations),
            color: GROUP_COLORS[GROUP_COLORS.length - 1],
            isOther: true
        });
    }

    return rankedGroups;
};

const buildStatusData = (statusCounts: Record<string, number>, totalObservations: number): StatusDatum[] => {
    return STATUS_ORDER
        .map((status) => {
            const value = statusCounts[status] ?? 0;
            if (!value) return null;

            return {
                name: status,
                value,
                percentage: roundPercentage(value, totalObservations),
                color: STATUS_COLORS[status]
            };
        })
        .filter((status): status is StatusDatum => status !== null);
};

export function buildStatsReportData(observations: Observation[]): StatsReportData {
    const totalObservations = observations.length;
    const uniqueSpecies = new Set(observations.map(obs => obs.speciesName)).size;
    const uniqueLocations = new Set(observations.map(obs => obs.municipality)).size;
    const uniqueGroups = new Set(observations.map(obs => obs.taxonomicGroup)).size;
    const taxonSpeciesCards = buildTaxonSpeciesCards(observations);

    const groupCounts: Record<string, number> = {};
    observations.forEach(obs => {
        groupCounts[obs.taxonomicGroup] = (groupCounts[obs.taxonomicGroup] || 0) + 1;
    });
    const groupData = sortEntriesByValueThenName(Object.entries(groupCounts)).map(([name, value]) => ({ name, value }));
    const rankedGroupData = buildRankedGroupData(groupCounts, totalObservations);

    const statusCounts: Record<string, number> = {};
    observations.forEach(obs => {
        statusCounts[obs.status] = (statusCounts[obs.status] || 0) + 1;
    });
    const statusData = buildStatusData(statusCounts, totalObservations);

    const monthCounts = Array.from({ length: 12 }, () => 0);
    observations.forEach(obs => {
        const monthIndex = getMonthIndexFromIsoDate(obs.date);
        if (monthIndex !== null) {
            monthCounts[monthIndex] += 1;
        }
    });
    const activityData = MONTHS_ORDER.map((month, index) => ({
        name: month,
        observations: monthCounts[index] || 0
    }));

    const speciesCounts: Record<string, number> = {};
    observations.forEach(obs => {
        speciesCounts[obs.speciesName] = (speciesCounts[obs.speciesName] || 0) + obs.count;
    });
    const topSpecies = Object.entries(speciesCounts)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 5)
        .map(([name, count]) => ({ name, count }));

    const badges = BADGES_DEFINITIONS.map(badge => ({
        id: badge.id,
        name: badge.name,
        icon: badge.icon,
        description: badge.description,
        unlocked: badge.condition(observations)
    }));

    return {
        totalObservations,
        uniqueSpecies,
        uniqueLocations,
        uniqueGroups,
        taxonSpeciesCards,
        groupData,
        rankedGroupData,
        statusData,
        activityData,
        topSpecies,
        badges
    };
}
