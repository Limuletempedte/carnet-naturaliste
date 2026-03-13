import React, { useMemo, useRef, useEffect, useState } from 'react';
import {
    PieChart, Pie, Cell, Tooltip, ResponsiveContainer,
    BarChart, Bar, XAxis, YAxis, CartesianGrid
} from 'recharts';
import { Observation } from '../types';
import Badges from './Badges';
import { buildStatsReportData } from '../utils/statsReportData';

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
            // Ease-out cubic
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
    onExportStats?: () => Promise<void>;
    isExportingStats?: boolean;
    statsRootRef?: React.RefObject<HTMLDivElement | null>;
}

const STATUS_MEDAL_COLORS = ['bg-amber-500', 'bg-stone-400', 'bg-orange-500'];

const cardShellClass = 'bg-white/88 dark:bg-nature-dark-surface/88 backdrop-blur-xl rounded-[30px] shadow-ios border border-white/30 dark:border-white/10';
const sectionTitleClass = 'text-[1.65rem] font-serif font-bold tracking-tight text-nature-dark dark:text-white';

const tooltipStyle = {
    borderRadius: '14px',
    border: '1px solid rgba(28,28,30,0.08)',
    boxShadow: '0 18px 38px rgba(28,28,30,0.12)',
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
            className={`${cardShellClass} relative overflow-hidden cursor-pointer transition-all duration-300 hover:shadow-ios-hover hover:scale-[1.025] active:scale-[0.99] ${isMobileView ? 'p-5' : 'p-7'}`}
        >
            <div className={`absolute inset-x-0 top-0 h-1.5 bg-gradient-to-r ${accent}`}></div>
            <div className="space-y-6">
                <div className="space-y-2">
                    <p className="text-[0.72rem] uppercase tracking-[0.22em] font-bold text-[#7C7468] dark:text-gray-400">
                        {label}
                    </p>
                    <p className={`font-bold tracking-tight text-nature-dark dark:text-white tabular-nums ${isMobileView ? 'text-4xl' : 'text-[3.35rem]'}`}>
                        {animated}
                    </p>
                </div>
                <p className="text-sm text-[#756D62] dark:text-gray-300">
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
    statsRootRef
}) => {
    const internalRef = useRef<HTMLDivElement>(null);
    const [groupTooltip, setGroupTooltip] = useState<{ text: string; x: number; y: number } | null>(null);
    const rootRef = (statsRootRef as React.RefObject<HTMLDivElement | null> | undefined) ?? internalRef;

    const stats = useMemo(() => buildStatsReportData(observations), [observations]);

    return (
        <div
            ref={rootRef as React.RefObject<HTMLDivElement>}
            className={`space-y-10 animate-fadeIn ${isMobileView ? 'pb-24' : ''}`}
        >
            {onExportStats && (
                <div className={`flex ${isMobileView ? 'justify-center' : 'justify-end'}`}>
                    <button
                        onClick={onExportStats}
                        disabled={isExportingStats}
                        className="flex items-center gap-2 px-5 py-3 rounded-full bg-white/85 dark:bg-nature-dark-surface/88 backdrop-blur-md shadow-ios border border-white/30 dark:border-white/10 text-nature-dark dark:text-white font-semibold text-sm transition-all duration-300 hover:shadow-ios-hover hover:scale-[1.02] disabled:opacity-60 disabled:cursor-not-allowed disabled:scale-100"
                    >
                        <span>{isExportingStats ? '⏳' : '📦'}</span>
                        {isExportingStats ? 'Export en cours...' : 'Exporter Stats (ZIP: PDF statique + HTML interactif)'}
                    </button>
                </div>
            )}

            <div className={`grid grid-cols-1 md:grid-cols-3 ${isMobileView ? 'gap-4' : 'gap-6'}`}>
                <MetricCard
                    label="Total observations"
                    value={stats.totalObservations}
                    accent="from-[#4C9A6A] via-[#56B77A] to-[#A8D7B6]"
                    note="Toutes les saisies enregistrées"
                    isMobileView={isMobileView}
                />
                <MetricCard
                    label="Espèces distinctes"
                    value={stats.uniqueSpecies}
                    accent="from-[#2F7CC1] via-[#3F9AD6] to-[#8DD7E8]"
                    note="Dédupliquées par nom observé"
                    isMobileView={isMobileView}
                />
                <MetricCard
                    label="Groupes taxonomiques"
                    value={stats.uniqueGroups}
                    accent="from-[#8F6CB3] via-[#B07DB6] to-[#E7B7D3]"
                    note="Présents dans le carnet"
                    isMobileView={isMobileView}
                />
            </div>

            {stats.taxonSpeciesCards.length > 0 && (
                <section className={`${cardShellClass} relative overflow-hidden ${isMobileView ? 'p-4' : 'p-8'}`}>
                    <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,_rgba(76,154,106,0.12),_transparent_35%),radial-gradient(circle_at_bottom_right,_rgba(200,123,66,0.10),_transparent_32%)] pointer-events-none"></div>
                    <div className="relative space-y-6">
                        <div className="space-y-2">
                            <h3 className={sectionTitleClass}>Espèces observées par taxon</h3>
                            <p className="text-sm text-[#756D62] dark:text-gray-300">
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
                                        className="group relative overflow-hidden rounded-[28px] border border-[#E2D4BF]/90 dark:border-[#4A4137] bg-gradient-to-br from-[#FBF7EF] via-[#FFFDFC] to-[#F4EADD] dark:from-[#2D261F] dark:via-[#241F19] dark:to-[#1E1A16] shadow-[0_18px_40px_rgba(67,53,36,0.10)] cursor-pointer transition-all duration-300 hover:shadow-[0_24px_50px_rgba(67,53,36,0.18)] hover:scale-[1.02] hover:border-[#4C9A6A]/40 active:scale-[0.99]"
                                    >
                                        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,_rgba(76,154,106,0.12),_transparent_35%),radial-gradient(circle_at_bottom_right,_rgba(200,123,66,0.15),_transparent_30%)] opacity-80 pointer-events-none"></div>
                                        <div className="relative flex items-center justify-between gap-4 p-5 pb-3">
                                            <div className="flex items-center gap-4 min-w-0">
                                                <div className="w-14 h-14 rounded-[20px] bg-[#F0E5D3]/90 dark:bg-white/8 border border-[#D7C5AC] dark:border-white/10 flex items-center justify-center shadow-inner shrink-0 transition-transform duration-300 group-hover:scale-110">
                                                    <img src={card.logo} alt={card.taxonomicGroup} className="w-8 h-8 object-contain opacity-95" />
                                                </div>
                                                <div className="min-w-0">
                                                    <p className="font-semibold text-lg leading-tight text-nature-dark dark:text-white truncate">
                                                        {card.taxonomicGroup}
                                                    </p>
                                                    <p className="text-xs uppercase tracking-[0.18em] font-bold text-[#907A5D] dark:text-[#D9C7AF] mt-2">
                                                        Espèces distinctes
                                                    </p>
                                                </div>
                                            </div>

                                            <div className="shrink-0 text-right">
                                                <p className="text-[2rem] font-bold leading-none tracking-tight text-nature-dark dark:text-white tabular-nums">
                                                    {card.speciesCount}
                                                </p>
                                                <p className="text-sm font-semibold text-[#6F6659] dark:text-gray-300">
                                                    {card.speciesCount === 1 ? 'espèce' : 'espèces'}
                                                </p>
                                            </div>
                                        </div>
                                        {/* Mini progress bar */}
                                        <div className="relative px-5 pb-4">
                                            <div className="h-1.5 rounded-full bg-[#E9DECF] dark:bg-white/10 overflow-hidden">
                                                <div
                                                    className="h-full rounded-full bg-[#4C9A6A] transition-all duration-700"
                                                    style={{ width: `${Math.round((card.speciesCount / maxSpecies) * 100)}%` }}
                                                />
                                            </div>
                                        </div>
                                    </article>
                                ));
                            })()}
                        </div>
                    </div>
                </section>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                <section className={`${cardShellClass} relative overflow-hidden ${isMobileView ? 'p-4' : 'p-8'}`}>
                    <div className="absolute inset-0 bg-[linear-gradient(180deg,_rgba(76,154,106,0.07),_transparent_45%)] pointer-events-none"></div>
                    <div className="relative space-y-6">
                        <div className="space-y-2">
                            <h3 className={sectionTitleClass}>Répartition par groupe</h3>
                            <p className="text-sm text-[#756D62] dark:text-gray-300">
                                Classement des groupes les plus représentés, avec pourcentage intégré directement dans chaque ligne.
                            </p>
                        </div>

                        {groupTooltip && (
                            <div
                                className="fixed z-50 pointer-events-none bg-gray-900/90 text-white text-xs px-3 py-1.5 rounded-xl shadow-xl"
                                style={{ left: groupTooltip.x + 14, top: groupTooltip.y - 38 }}
                            >
                                {groupTooltip.text}
                            </div>
                        )}
                        <div className="space-y-4">
                            {stats.rankedGroupData.map((group) => {
                                const barWidth = `${Math.max(group.percentage, group.value > 0 ? 6 : 0)}%`;
                                const tooltipText = `${group.name} : ${group.value} observation${group.value > 1 ? 's' : ''} (${group.percentage.toFixed(1)}%)`;
                                return (
                                    <article
                                        key={group.name}
                                        data-testid="ranked-group-row"
                                        className="rounded-[24px] border border-[#E5D8C4] dark:border-[#463D34] bg-[#FBF8F1]/90 dark:bg-[#221D18] p-4 shadow-[0_10px_26px_rgba(67,53,36,0.07)] cursor-pointer transition-all duration-150 hover:-translate-y-px hover:shadow-[0_8px_18px_rgba(67,53,36,0.12)]"
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
                                                <p className="mt-2 text-xs uppercase tracking-[0.18em] font-bold text-[#887764] dark:text-[#CBB79A]">
                                                    {group.value} observation{group.value > 1 ? 's' : ''} • {group.percentage.toFixed(1)}%
                                                </p>
                                            </div>
                                            <span className="px-3 py-1 rounded-full bg-white dark:bg-white/8 border border-[#E7DDCE] dark:border-white/10 text-sm font-bold text-[#5E5548] dark:text-gray-200 whitespace-nowrap">
                                                {group.value}
                                            </span>
                                        </div>

                                        <div className="mt-4 h-3 rounded-full bg-[#E9DECF] dark:bg-white/10 overflow-hidden">
                                            <div
                                                className="h-full rounded-full transition-all duration-500"
                                                style={{ width: barWidth, backgroundColor: group.color }}
                                            ></div>
                                        </div>
                                    </article>
                                );
                            })}
                        </div>
                    </div>
                </section>

                <section className={`${cardShellClass} relative overflow-hidden ${isMobileView ? 'p-4' : 'p-8'}`}>
                    <div className="absolute inset-0 bg-[linear-gradient(180deg,_rgba(76,154,106,0.07),_transparent_45%)] pointer-events-none"></div>
                    <div className="relative space-y-6">
                        <div className="space-y-2">
                            <h3 className={sectionTitleClass}>Activité mensuelle</h3>
                            <p className="text-sm text-[#756D62] dark:text-gray-300">
                                Volume d&apos;observations sur l&apos;année, pour repérer les pics d&apos;activité rapidement.
                            </p>
                        </div>

                        <div className="h-80">
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={stats.activityData} margin={{ top: 8, right: 4, left: -18, bottom: 10 }}>
                                    <CartesianGrid strokeDasharray="4 6" vertical={false} stroke="#DDD2C2" />
                                    <XAxis
                                        dataKey="name"
                                        tick={{ fontSize: 11, fill: '#7B7469' }}
                                        axisLine={false}
                                        tickLine={false}
                                        interval={0}
                                        angle={-30}
                                        textAnchor="end"
                                        height={54}
                                    />
                                    <YAxis
                                        allowDecimals={false}
                                        tick={{ fontSize: 11, fill: '#7B7469' }}
                                        axisLine={false}
                                        tickLine={false}
                                    />
                                    <Tooltip
                                        cursor={{ fill: 'rgba(76, 154, 106, 0.08)' }}
                                        contentStyle={tooltipStyle}
                                    />
                                    <Bar dataKey="observations" fill="#4C9A6A" radius={[10, 10, 0, 0]} barSize={24} />
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    </div>
                </section>

                <section className={`${cardShellClass} relative overflow-hidden ${isMobileView ? 'p-4' : 'p-8'}`}>
                    <div className="absolute inset-0 bg-[linear-gradient(180deg,_rgba(200,123,66,0.08),_transparent_45%)] pointer-events-none"></div>
                    <div className="relative space-y-6">
                        <div className="space-y-2">
                            <h3 className={sectionTitleClass}>Top 5 espèces</h3>
                            <p className="text-sm text-[#756D62] dark:text-gray-300">
                                Les espèces les plus observées en nombre d&apos;individus, avec une présentation plus compacte.
                            </p>
                        </div>

                        <ul className="space-y-3">
                            {stats.topSpecies.map((species, index) => (
                                <li
                                    key={species.name}
                                    className="flex items-center justify-between gap-4 p-4 rounded-[24px] bg-[#FAF6EE] dark:bg-[#211C17] border border-[#E4D7C5] dark:border-[#443B32] shadow-[0_10px_24px_rgba(67,53,36,0.06)]"
                                >
                                    <div className="flex items-center gap-4 min-w-0">
                                        <span
                                            className={`flex items-center justify-center w-10 h-10 rounded-full font-bold text-white text-sm shadow-sm ${STATUS_MEDAL_COLORS[index] ?? 'bg-nature-green'}`}
                                        >
                                            {index + 1}
                                        </span>
                                        <div className="min-w-0">
                                            <span className="block font-semibold text-base text-nature-dark dark:text-white truncate">
                                                {species.name}
                                            </span>
                                            <span className="text-xs uppercase tracking-[0.16em] font-bold text-[#897863] dark:text-[#CDB89D]">
                                                Espèce la plus observée
                                            </span>
                                        </div>
                                    </div>
                                    <span className="font-bold text-[#5F5548] dark:text-gray-200 bg-white dark:bg-white/8 px-4 py-2 rounded-full text-sm whitespace-nowrap border border-[#E6DCCD] dark:border-white/10">
                                        {species.count} ind.
                                    </span>
                                </li>
                            ))}
                        </ul>
                    </div>
                </section>

                <section className={`${cardShellClass} relative overflow-hidden ${isMobileView ? 'p-4' : 'p-8'}`}>
                    <div className="absolute inset-0 bg-[linear-gradient(180deg,_rgba(47,124,193,0.07),_transparent_45%)] pointer-events-none"></div>
                    <div className="relative space-y-6">
                        <div className="space-y-2">
                            <h3 className={sectionTitleClass}>Statut de protection</h3>
                            <p className="text-sm text-[#756D62] dark:text-gray-300">
                                Vue synthétique des statuts présents dans le carnet, avec détail numérique sous le graphique.
                            </p>
                        </div>

                        <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_220px] gap-6 items-center">
                            <div className="h-80">
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
                                            formatter={(value: number, name: string) => [`${value} observation(s)`, name]}
                                        />
                                    </PieChart>
                                </ResponsiveContainer>
                            </div>

                            <div className="space-y-3">
                                {stats.statusData.map((status) => (
                                    <div
                                        key={status.name}
                                        className="rounded-[20px] border border-[#E4D7C5] dark:border-[#463C34] bg-[#FAF6EE] dark:bg-[#221D18] px-4 py-3"
                                    >
                                        <div className="flex items-center gap-3">
                                            <span
                                                className="w-3 h-3 rounded-full shrink-0"
                                                style={{ backgroundColor: status.color }}
                                                aria-hidden="true"
                                            ></span>
                                            <span className="font-semibold text-nature-dark dark:text-white">{status.name}</span>
                                        </div>
                                        <p className="mt-2 text-sm text-[#6F6659] dark:text-gray-300">
                                            {status.value} observation{status.value > 1 ? 's' : ''} • {status.percentage.toFixed(1)}%
                                        </p>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                </section>
            </div>

            <Badges observations={observations} />
        </div>
    );
};

export default ObservationStats;
