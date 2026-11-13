import React, { useMemo, useRef, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import {
    PieChart, Pie, Cell, Tooltip, ResponsiveContainer,
    BarChart, Bar, XAxis, YAxis, CartesianGrid
} from 'recharts';
import { Observation } from '../types';
import Badges from './Badges';
import { buildStatsReportData } from '../utils/statsReportData';
import { computeCurrentStreak, computeLongestStreak } from '../utils/observationStatsUtils';
import { SpinnerIcon, ArchiveBoxIcon, FlameIcon, MedalIcon } from './icons';
import EmptyState from './EmptyState';
import MonthlySummaryCard from './MonthlySummaryCard';

const useCountUp = (target: number, duration = 800): number => {
    const [value, setValue] = useState(0);
    const frameRef = useRef<number | null>(null);
    const startRef = useRef<number | null>(null);

    useEffect(() => {
        if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
        startRef.current = null;
        setValue(0);

        const step = (timestamp: number) => {
            if (startRef.current === null) startRef.current = timestamp;
            const elapsed = timestamp - startRef.current;
            const progress = Math.min(elapsed / duration, 1);
            const eased = 1 - Math.pow(1 - progress, 3);
            setValue(Math.round(eased * target));
            if (progress < 1) {
                frameRef.current = requestAnimationFrame(step);
            }
        };

        frameRef.current = requestAnimationFrame(step);
        return () => { if (frameRef.current !== null) cancelAnimationFrame(frameRef.current); };
    }, [target, duration]);

    return value;
};

interface ObservationStatsProps {
    observations: Observation[];
    isMobileView?: boolean;
    onExportStats?: () => void | Promise<void>;
    isExportingStats?: boolean;
    statsRootRef?: React.RefObject<HTMLDivElement | null>;
    isOffline?: boolean;
    /** Ouvre « Assistant IA » depuis la carte du bilan du mois. */
    onOpenAiAssistant?: () => void;
}

const STATUS_MEDAL_COLORS = ['bg-nature-green', 'bg-slate-500', 'bg-slate-400'];

const cardShellClass = 'bg-white/86 dark:bg-nature-dark-surface/88 backdrop-blur-xl rounded-[28px] shadow-ios border border-white/25 dark:border-white/10';
const sectionTitleClass = 'text-[1.6rem] font-serif font-bold tracking-tight text-nature-dark dark:text-white';
const sectionDescriptionClass = 'text-sm text-gray-600 dark:text-gray-300';
const chartGridColor = '#D1D5DB';
const chartTextColor = '#6B7280';

const tooltipStyle = {
    borderRadius: '12px',
    border: '1px solid rgba(107,114,128,0.18)',
    boxShadow: '0 14px 30px rgba(17,24,39,0.16)',
    backgroundColor: 'rgba(255,255,255,0.96)'
};

interface MetricCardProps {
    label: string;
    value: number;
    accent: string;
    note: string;
    isMobileView: boolean;
}

const MetricCard: React.FC<MetricCardProps> = ({ label, value, accent, note, isMobileView }) => {
    const animated = useCountUp(value);
    return (
        <div
            className={`${cardShellClass} relative overflow-hidden transition-all duration-300 hover:shadow-ios-hover hover:-translate-y-0.5 active:translate-y-0 ${isMobileView ? 'p-5' : 'p-7'}`}
        >
            <div className={`absolute inset-x-0 top-0 h-1.5 bg-gradient-to-r ${accent}`}></div>
            <div className="space-y-5">
                <div className="space-y-2">
                    <p className="text-[0.72rem] uppercase tracking-[0.2em] font-bold text-gray-500 dark:text-gray-400">
                        {label}
                    </p>
                    <p className={`font-bold tracking-tight text-nature-dark dark:text-white tabular-nums ${isMobileView ? 'text-4xl' : 'text-[3.1rem]'}`}>
                        {animated}
                    </p>
                </div>
                <p className="text-sm text-gray-600 dark:text-gray-300">
                    {note}
                </p>
            </div>
        </div>
    );
};

const ObservationStats: React.FC<ObservationStatsProps> = ({
    observations,
    isMobileView = false,
    onExportStats,
    isExportingStats = false,
    statsRootRef,
    isOffline = false,
    onOpenAiAssistant,
}) => {
    const internalRef = useRef<HTMLDivElement>(null);
    const [groupTooltip, setGroupTooltip] = useState<{ text: string; x: number; y: number } | null>(null);
    const rootRef = (statsRootRef as React.RefObject<HTMLDivElement | null> | undefined) ?? internalRef;

    const stats = useMemo(() => buildStatsReportData(observations), [observations]);
    const currentStreak = useMemo(() => computeCurrentStreak(observations), [observations]);
    const longestStreak = useMemo(() => computeLongestStreak(observations), [observations]);

    if (observations.length === 0) {
        return (
            <EmptyState
                variant="stats"
                title="Aucune observation"
                hint="Ajoutez des observations pour voir les statistiques."
                className="py-16"
            />
        );
    }

    return (
        <div
            ref={rootRef as React.RefObject<HTMLDivElement>}
            className={`space-y-8 animate-fadeIn ${isMobileView ? 'pb-24' : ''}`}
        >
            {onExportStats && (
                <div className={`flex ${isMobileView ? 'justify-center' : 'justify-end'}`}>
                    <button
                        onClick={onExportStats}
                        disabled={isExportingStats}
                        className="flex items-center gap-2 px-5 py-3 rounded-full bg-white/85 dark:bg-nature-dark-surface/88 backdrop-blur-md shadow-ios border border-white/25 dark:border-white/10 text-nature-dark dark:text-white font-semibold text-sm transition-all duration-300 hover:shadow-ios-hover hover:-translate-y-0.5 disabled:opacity-60 disabled:cursor-not-allowed disabled:translate-y-0"
                    >
                        {isExportingStats ? <SpinnerIcon className="w-5 h-5 animate-spin" /> : <ArchiveBoxIcon className="w-5 h-5" />}
                        {isExportingStats ? 'Export en cours...' : 'Exporter Stats (ZIP: PDF statique + HTML interactif)'}
                    </button>
                </div>
            )}

            <div className={`grid grid-cols-1 md:grid-cols-3 ${isMobileView ? 'gap-4' : 'gap-6'}`}>
                <MetricCard
                    label="Total observations"
                    value={stats.totalObservations}
                    accent="from-nature-green via-emerald-500 to-emerald-400"
                    note="Toutes les saisies enregistrées"
                    isMobileView={isMobileView}
                />
                <MetricCard
                    label="Espèces distinctes"
                    value={stats.uniqueSpecies}
                    accent="from-slate-600 via-slate-500 to-slate-400"
                    note="Dédupliquées par nom observé"
                    isMobileView={isMobileView}
                />
                <MetricCard
                    label="Groupes taxonomiques"
                    value={stats.uniqueGroups}
                    accent="from-zinc-600 via-zinc-500 to-zinc-400"
                    note="Présents dans le carnet"
                    isMobileView={isMobileView}
                />
            </div>

            {/* VP-22 — Compteur de série */}
            <div className={`${cardShellClass} ${isMobileView ? 'p-5' : 'p-6'} flex flex-wrap items-center justify-between gap-4`}>
                <div>
                    <p className="text-[0.72rem] uppercase tracking-[0.2em] font-bold text-gray-500 dark:text-gray-400">Séries d&apos;observations</p>
                    <p className="text-sm text-gray-600 dark:text-gray-300 mt-1">Jours consécutifs avec au moins une observation.</p>
                </div>
                <div className="flex items-center gap-6">
                    <div className="text-center">
                        <div className="text-3xl font-bold text-nature-dark dark:text-white flex items-center justify-center gap-1.5">
                            <FlameIcon className="w-7 h-7 text-orange-500" /> {currentStreak}
                        </div>
                        <div className="text-xs uppercase tracking-wider text-gray-500 dark:text-gray-400 mt-1">Série actuelle</div>
                    </div>
                    <div className="text-center">
                        <div className="text-3xl font-bold text-nature-dark dark:text-white flex items-center justify-center gap-1.5">
                            <MedalIcon className="w-7 h-7 text-amber-500" /> {longestStreak}
                        </div>
                        <div className="text-xs uppercase tracking-wider text-gray-500 dark:text-gray-400 mt-1">Meilleure série</div>
                    </div>
                </div>
            </div>

            <MonthlySummaryCard
                observations={observations}
                isOffline={isOffline}
                isMobileView={isMobileView}
                onOpenAiAssistant={onOpenAiAssistant}
            />

            {stats.taxonSpeciesCards.length > 0 && (
                <section className={`${cardShellClass} ${isMobileView ? 'p-4' : 'p-8'} space-y-6`}>
                    <div className="space-y-2">
                        <h3 className={sectionTitleClass}>Espèces observées par taxon</h3>
                        <p className={sectionDescriptionClass}>
                            Nombre d&apos;espèces distinctes observées par grand groupe, avec une lecture plus nette que le compteur d&apos;individus.
                        </p>
                    </div>

                    <div className={`grid ${isMobileView ? 'grid-cols-1 sm:grid-cols-2 gap-3' : 'grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4'}`}>
                        {(() => {
                            const maxSpecies = Math.max(...stats.taxonSpeciesCards.map(c => c.speciesCount), 1);
                            return stats.taxonSpeciesCards.map((card) => (
                                <article
                                    key={card.taxonomicGroup}
                                    data-testid="taxon-species-card"
                                    className="group relative overflow-hidden rounded-[22px] border border-gray-200/90 dark:border-white/10 bg-white/80 dark:bg-black/20 shadow-[0_8px_22px_rgba(15,23,42,0.08)] cursor-pointer transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_12px_26px_rgba(15,23,42,0.14)]"
                                >
                                    <div className="flex items-center justify-between gap-4 p-5 pb-3">
                                        <div className="flex items-center gap-4 min-w-0">
                                            <div className="w-14 h-14 rounded-2xl bg-gray-100 dark:bg-white/10 border border-gray-200 dark:border-white/10 flex items-center justify-center shadow-inner shrink-0 transition-transform duration-300 group-hover:scale-105">
                                                <img src={card.logo} alt={card.taxonomicGroup} className="w-8 h-8 object-contain opacity-95" />
                                            </div>
                                            <div className="min-w-0">
                                                <p className="font-semibold text-lg leading-tight text-nature-dark dark:text-white truncate">
                                                    {card.taxonomicGroup}
                                                </p>
                                                <p className="text-xs uppercase tracking-[0.16em] font-bold text-gray-500 dark:text-gray-400 mt-2">
                                                    Espèces distinctes
                                                </p>
                                            </div>
                                        </div>

                                        <div className="shrink-0 text-right">
                                            <p className="text-[2rem] font-bold leading-none tracking-tight text-nature-dark dark:text-white tabular-nums">
                                                {card.speciesCount}
                                            </p>
                                            <p className="text-sm font-semibold text-gray-600 dark:text-gray-300">
                                                {card.speciesCount === 1 ? 'espèce' : 'espèces'}
                                            </p>
                                        </div>
                                    </div>
                                    <div className="px-5 pb-4">
                                        <div className="h-1.5 rounded-full bg-gray-200 dark:bg-white/10 overflow-hidden">
                                            <div
                                                className="h-full rounded-full bg-nature-green transition-all duration-700"
                                                style={{ width: `${Math.round((card.speciesCount / maxSpecies) * 100)}%` }}
                                            />
                                        </div>
                                    </div>
                                </article>
                            ));
                        })()}
                    </div>
                </section>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                <section className={`${cardShellClass} ${isMobileView ? 'p-4' : 'p-8'} space-y-6`}>
                    <div className="space-y-2">
                        <h3 className={sectionTitleClass}>Répartition par groupe</h3>
                        <p className={sectionDescriptionClass}>
                            Classement des groupes les plus représentés, avec pourcentage intégré directement dans chaque ligne.
                        </p>
                    </div>

                    {groupTooltip && createPortal(
                        <div
                            className="fixed z-[9999] pointer-events-none bg-nature-dark/95 text-white text-xs px-3 py-1.5 rounded-lg shadow-xl whitespace-nowrap"
                            style={{
                                left: Math.max(8, Math.min(groupTooltip.x + 14, window.innerWidth - 250)),
                                top: groupTooltip.y - 38 < 8 ? groupTooltip.y + 14 : groupTooltip.y - 38,
                            }}
                        >
                            {groupTooltip.text}
                        </div>,
                        document.body
                    )}
                    <div className="space-y-4">
                        {stats.rankedGroupData.map((group) => {
                            const barWidth = `${Math.max(group.percentage, group.value > 0 ? 6 : 0)}%`;
                            const tooltipText = `${group.name}: ${group.value} observation(s) (${group.percentage.toFixed(1)}%)`;
                            return (
                                <article
                                    key={group.name}
                                    data-testid="ranked-group-row"
                                    className="rounded-[20px] border border-gray-200 dark:border-white/10 bg-white/80 dark:bg-black/20 p-4 shadow-[0_8px_20px_rgba(15,23,42,0.08)] cursor-pointer transition-all duration-150 hover:-translate-y-0.5 hover:shadow-[0_10px_22px_rgba(15,23,42,0.14)]"
                                    onMouseEnter={(e) => setGroupTooltip({ text: tooltipText, x: e.clientX, y: e.clientY })}
                                    onMouseMove={(e) => setGroupTooltip(prev => prev ? { ...prev, x: e.clientX, y: e.clientY } : null)}
                                    onMouseLeave={() => setGroupTooltip(null)}
                                >
                                    <div className="flex items-start justify-between gap-4">
                                        <div className="min-w-0">
                                            <div className="flex items-center gap-3">
                                                <span
                                                    className="w-3 h-3 rounded-full shrink-0"
                                                    style={{ backgroundColor: group.color }}
                                                    aria-hidden="true"
                                                ></span>
                                                <p className="font-semibold text-base text-nature-dark dark:text-white truncate">
                                                    {group.name}
                                                </p>
                                            </div>
                                            <p className="mt-2 text-xs uppercase tracking-[0.16em] font-bold text-gray-500 dark:text-gray-400">
                                                {group.value} observation{group.value > 1 ? 's' : ''} • {group.percentage.toFixed(1)}%
                                            </p>
                                        </div>
                                        <span className="px-3 py-1 rounded-full bg-white dark:bg-white/10 border border-gray-200 dark:border-white/10 text-sm font-bold text-gray-700 dark:text-gray-200 whitespace-nowrap">
                                            {group.value}
                                        </span>
                                    </div>

                                    <div className="mt-4 h-3 rounded-full bg-gray-200 dark:bg-white/10 overflow-hidden">
                                        <div
                                            className="h-full rounded-full transition-all duration-500"
                                            style={{ width: barWidth, backgroundColor: group.color }}
                                        ></div>
                                    </div>
                                </article>
                            );
                        })}
                    </div>
                </section>

                <section className={`${cardShellClass} ${isMobileView ? 'p-4' : 'p-8'} space-y-6`}>
                    <div className="space-y-2">
                        <h3 className={sectionTitleClass}>Activité mensuelle</h3>
                        <p className={sectionDescriptionClass}>
                            Volume d&apos;observations sur l&apos;année, pour repérer les pics d&apos;activité rapidement.
                        </p>
                    </div>

                    <div className="h-64 md:h-80">
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={stats.activityData} margin={{ top: 8, right: 4, left: -18, bottom: 10 }}>
                                <CartesianGrid strokeDasharray="4 6" vertical={false} stroke={chartGridColor} />
                                <XAxis
                                    dataKey="name"
                                    tick={{ fontSize: 11, fill: chartTextColor }}
                                    axisLine={false}
                                    tickLine={false}
                                    interval={0}
                                    angle={-30}
                                    textAnchor="end"
                                    height={54}
                                />
                                <YAxis
                                    allowDecimals={false}
                                    tick={{ fontSize: 11, fill: chartTextColor }}
                                    axisLine={false}
                                    tickLine={false}
                                />
                                <Tooltip
                                    cursor={{ fill: 'rgba(52, 199, 89, 0.10)' }}
                                    contentStyle={tooltipStyle}
                                />
                                <Bar dataKey="observations" fill="#34C759" radius={[10, 10, 0, 0]} />
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </section>

                <section className={`${cardShellClass} ${isMobileView ? 'p-4' : 'p-8'} space-y-6`}>
                    <div className="space-y-2">
                        <h3 className={sectionTitleClass}>Top 5 espèces</h3>
                        <p className={sectionDescriptionClass}>
                            Les espèces les plus observées en nombre d&apos;individus, avec une présentation plus compacte.
                        </p>
                    </div>

                    <ul className="space-y-3">
                        {stats.topSpecies.map((species, index) => (
                            <li
                                key={species.name}
                                className="flex items-center justify-between gap-4 p-4 rounded-[20px] bg-white/80 dark:bg-black/20 border border-gray-200 dark:border-white/10 shadow-[0_8px_20px_rgba(15,23,42,0.07)]"
                            >
                                <div className="flex items-center gap-4 min-w-0">
                                    <span
                                        className={`flex items-center justify-center w-10 h-10 rounded-full font-bold text-white text-sm shadow-sm ${STATUS_MEDAL_COLORS[index] ?? 'bg-slate-500'}`}
                                    >
                                        {index + 1}
                                    </span>
                                    <div className="min-w-0">
                                        <span className="block font-semibold text-base text-nature-dark dark:text-white truncate">
                                            {species.name}
                                        </span>
                                        <span className="text-xs uppercase tracking-[0.14em] font-bold text-gray-500 dark:text-gray-400">
                                            Espèce la plus observée
                                        </span>
                                    </div>
                                </div>
                                <span className="font-bold text-gray-700 dark:text-gray-200 bg-white dark:bg-white/10 px-4 py-2 rounded-full text-sm whitespace-nowrap border border-gray-200 dark:border-white/10">
                                    {species.count} ind.
                                </span>
                            </li>
                        ))}
                    </ul>
                </section>

                <section className={`${cardShellClass} ${isMobileView ? 'p-4' : 'p-8'} space-y-6`}>
                    <div className="space-y-2">
                        <h3 className={sectionTitleClass}>Statut de protection</h3>
                        <p className={sectionDescriptionClass}>
                            Vue synthétique des statuts présents dans le carnet, avec détail numérique sous le graphique.
                        </p>
                    </div>

                    <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_220px] gap-6 items-center">
                        <div className="h-64 md:h-80">
                            <ResponsiveContainer width="100%" height="100%">
                                <PieChart>
                                    <Pie
                                        data={stats.statusData}
                                        cx="50%"
                                        cy="50%"
                                        innerRadius={isMobileView ? 62 : 72}
                                        outerRadius={isMobileView ? 96 : 110}
                                        paddingAngle={4}
                                        dataKey="value"
                                    >
                                        {stats.statusData.map((entry) => (
                                            <Cell key={entry.name} fill={entry.color} strokeWidth={0} />
                                        ))}
                                    </Pie>
                                    <Tooltip
                                        contentStyle={tooltipStyle}
                                        formatter={(value, name) => [`${value} observation(s)`, name]}
                                    />
                                </PieChart>
                            </ResponsiveContainer>
                        </div>

                        <div className="space-y-3">
                            {stats.statusData.map((status) => (
                                <div
                                    key={status.name}
                                    className="rounded-[18px] border border-gray-200 dark:border-white/10 bg-white/80 dark:bg-black/20 px-4 py-3"
                                >
                                    <div className="flex items-center gap-3">
                                        <span
                                            className="w-3 h-3 rounded-full shrink-0"
                                            style={{ backgroundColor: status.color }}
                                            aria-hidden="true"
                                        ></span>
                                        <span className="font-semibold text-nature-dark dark:text-white">{status.name}</span>
                                    </div>
                                    <p className="mt-2 text-sm text-gray-600 dark:text-gray-300">
                                        {status.value} observation{status.value > 1 ? 's' : ''} • {status.percentage.toFixed(1)}%
                                    </p>
                                </div>
                            ))}
                        </div>
                    </div>
                </section>
            </div>

            <Badges observations={observations} />
        </div>
    );
};

export default ObservationStats;
