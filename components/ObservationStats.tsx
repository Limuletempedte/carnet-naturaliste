import React, { useMemo } from 'react';
import {
    PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer,
    BarChart, Bar, XAxis, YAxis, CartesianGrid
} from 'recharts';
import { Observation } from '../types';
import Badges from './Badges';

interface ObservationStatsProps {
    observations: Observation[];
    isMobileView?: boolean;
}

const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884d8', '#82ca9d', '#ffc658', '#8dd1e1', '#a4de6c', '#d0ed57'];

const ObservationStats: React.FC<ObservationStatsProps> = ({ observations, isMobileView = false }) => {

    const stats = useMemo(() => {
        const totalObservations = observations.length;
        const uniqueSpecies = new Set(observations.map(obs => obs.speciesName)).size;
        const uniqueLocations = new Set(observations.map(obs => obs.municipality)).size;

        const uniqueGroups = new Set(observations.map(obs => obs.taxonomicGroup)).size;

        // Group Distribution
        const groupCounts: Record<string, number> = {};
        observations.forEach(obs => {
            const group = obs.taxonomicGroup;
            groupCounts[group] = (groupCounts[group] || 0) + 1;
        });
        const groupData = Object.entries(groupCounts).map(([name, value]) => ({ name, value }));

        // Status Distribution
        const statusCounts: Record<string, number> = {};
        observations.forEach(obs => {
            const status = obs.status;
            statusCounts[status] = (statusCounts[status] || 0) + 1;
        });
        const statusData = Object.entries(statusCounts).map(([name, value]) => ({ name, value }));

        // Monthly Activity
        const monthCounts: Record<string, number> = {};
        observations.forEach(obs => {
            const date = new Date(obs.date);
            const month = date.toLocaleString('fr-FR', { month: 'short' });
            monthCounts[month] = (monthCounts[month] || 0) + 1;
        });
        // Sort months chronologically is a bit tricky with just names, so let's use a fixed order or index
        const monthsOrder = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
        const activityData = monthsOrder.map(month => ({
            name: month,
            observations: monthCounts[month] || 0
        }));

        // Top 5 Species
        const speciesCounts: Record<string, number> = {};
        observations.forEach(obs => {
            speciesCounts[obs.speciesName] = (speciesCounts[obs.speciesName] || 0) + obs.count;
        });
        const topSpecies = Object.entries(speciesCounts)
            .sort(([, a], [, b]) => b - a)
            .slice(0, 5)
            .map(([name, count]) => ({ name, count }));

        return {
            totalObservations,
            uniqueSpecies,
            uniqueLocations,
            uniqueGroups,
            groupData,
            statusData,
            activityData,
            topSpecies
        };
    }, [observations]);

    return (
        <div className={`space-y-8 animate-fadeIn ${isMobileView ? 'pb-24' : ''}`}>
            {/* Key Metrics */}
            <div className={`grid grid-cols-1 md:grid-cols-3 gap-8 ${isMobileView ? 'gap-4' : ''}`}>
                <div className={`bg-white/80 dark:bg-nature-dark-surface/80 backdrop-blur-xl rounded-3xl shadow-ios border border-white/20 dark:border-white/5 text-center relative overflow-hidden group ${isMobileView ? 'p-6' : 'p-8'}`}>
                    <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-nature-green to-emerald-400"></div>
                    <h3 className="text-gray-500 dark:text-gray-400 font-bold uppercase text-xs tracking-widest mb-2">Total Observations</h3>
                    <p className={`font-bold text-nature-dark dark:text-white tracking-tight group-hover:scale-110 transition-transform duration-300 ${isMobileView ? 'text-4xl' : 'text-5xl'}`}>{stats.totalObservations}</p>
                </div>
                <div className={`bg-white/80 dark:bg-nature-dark-surface/80 backdrop-blur-xl rounded-3xl shadow-ios border border-white/20 dark:border-white/5 text-center relative overflow-hidden group ${isMobileView ? 'p-6' : 'p-8'}`}>
                    <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-blue-500 to-cyan-400"></div>
                    <h3 className="text-gray-500 dark:text-gray-400 font-bold uppercase text-xs tracking-widest mb-2">Espèces (Uniques)</h3>
                    <p className={`font-bold text-nature-dark dark:text-white tracking-tight group-hover:scale-110 transition-transform duration-300 ${isMobileView ? 'text-4xl' : 'text-5xl'}`}>{stats.uniqueSpecies}</p>
                </div>
                <div className={`bg-white/80 dark:bg-nature-dark-surface/80 backdrop-blur-xl rounded-3xl shadow-ios border border-white/20 dark:border-white/5 text-center relative overflow-hidden group ${isMobileView ? 'p-6' : 'p-8'}`}>
                    <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-purple-500 to-pink-400"></div>
                    <h3 className="text-gray-500 dark:text-gray-400 font-bold uppercase text-xs tracking-widest mb-2">Groupes Taxonomiques</h3>
                    <p className={`font-bold text-nature-dark dark:text-white tracking-tight group-hover:scale-110 transition-transform duration-300 ${isMobileView ? 'text-4xl' : 'text-5xl'}`}>{stats.uniqueGroups}</p>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                {/* Group Distribution */}
                <div className={`bg-white/80 dark:bg-nature-dark-surface/80 backdrop-blur-xl rounded-3xl shadow-ios border border-white/20 dark:border-white/5 ${isMobileView ? 'p-4' : 'p-8'}`}>
                    <h3 className="text-xl font-bold text-nature-dark dark:text-white mb-6">Répartition par Groupe</h3>
                    <div className="h-72">
                        <ResponsiveContainer width="100%" height="100%">
                            <PieChart>
                                <Pie
                                    data={stats.groupData}
                                    cx="50%"
                                    cy="50%"
                                    labelLine={false}
                                    outerRadius={isMobileView ? 80 : 100}
                                    innerRadius={isMobileView ? 50 : 60}
                                    fill="#8884d8"
                                    dataKey="value"
                                    paddingAngle={5}
                                    label={({ percent }: { percent?: number }) => percent ? `${(percent * 100).toFixed(0)}%` : ''}
                                >
                                    {stats.groupData.map((_entry, index) => (
                                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} strokeWidth={0} />
                                    ))}
                                </Pie>
                                <Tooltip
                                    contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 20px rgba(0,0,0,0.1)' }}
                                />
                                <Legend />
                            </PieChart>
                        </ResponsiveContainer>
                    </div>
                </div>

                {/* Monthly Activity */}
                <div className={`bg-white/80 dark:bg-nature-dark-surface/80 backdrop-blur-xl rounded-3xl shadow-ios border border-white/20 dark:border-white/5 ${isMobileView ? 'p-4' : 'p-8'}`}>
                    <h3 className="text-xl font-bold text-nature-dark dark:text-white mb-6">Activité Mensuelle</h3>
                    <div className="h-72">
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={stats.activityData}>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E5EA" />
                                <XAxis dataKey="name" tick={{ fontSize: 10, fill: '#8E8E93' }} axisLine={false} tickLine={false} interval={0} angle={-45} textAnchor="end" height={60} />
                                <YAxis allowDecimals={false} tick={{ fontSize: 12, fill: '#8E8E93' }} axisLine={false} tickLine={false} />
                                <Tooltip
                                    cursor={{ fill: 'rgba(0,0,0,0.05)' }}
                                    contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 20px rgba(0,0,0,0.1)' }}
                                />
                                <Bar dataKey="observations" fill="#34C759" radius={[6, 6, 0, 0]} barSize={20} />
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </div>

                {/* Top Species */}
                <div className={`bg-white/80 dark:bg-nature-dark-surface/80 backdrop-blur-xl rounded-3xl shadow-ios border border-white/20 dark:border-white/5 ${isMobileView ? 'p-4' : 'p-8'}`}>
                    <h3 className="text-xl font-bold text-nature-dark dark:text-white mb-6">Top 5 Espèces</h3>
                    <ul className="space-y-4">
                        {stats.topSpecies.map((species, index) => (
                            <li key={index} className="flex items-center justify-between p-4 bg-white/50 dark:bg-white/5 rounded-2xl transition-colors hover:bg-white/80 dark:hover:bg-white/10">
                                <div className="flex items-center gap-4">
                                    <span className={`flex items-center justify-center w-8 h-8 rounded-full font-bold text-white text-sm shadow-sm ${index === 0 ? 'bg-yellow-400' : index === 1 ? 'bg-gray-400' : index === 2 ? 'bg-orange-400' : 'bg-nature-green'}`}>
                                        {index + 1}
                                    </span>
                                    <span className="font-semibold text-nature-dark dark:text-white truncate max-w-[150px]">{species.name}</span>
                                </div>
                                <span className="font-bold text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-white/10 px-3 py-1 rounded-full text-sm whitespace-nowrap">{species.count} obs.</span>
                            </li>
                        ))}
                    </ul>
                </div>

                {/* Status Distribution */}
                <div className={`bg-white/80 dark:bg-nature-dark-surface/80 backdrop-blur-xl rounded-3xl shadow-ios border border-white/20 dark:border-white/5 ${isMobileView ? 'p-4' : 'p-8'}`}>
                    <h3 className="text-xl font-bold text-nature-dark dark:text-white mb-6">Statut de Protection</h3>
                    <div className="h-72">
                        <ResponsiveContainer width="100%" height="100%">
                            <PieChart>
                                <Pie
                                    data={stats.statusData}
                                    cx="50%"
                                    cy="50%"
                                    innerRadius={isMobileView ? 50 : 60}
                                    outerRadius={isMobileView ? 80 : 100}
                                    fill="#8884d8"
                                    paddingAngle={5}
                                    dataKey="value"
                                >
                                    {stats.statusData.map((_entry, index) => (
                                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} strokeWidth={0} />
                                    ))}
                                </Pie>
                                <Tooltip
                                    contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 20px rgba(0,0,0,0.1)' }}
                                />
                                <Legend />
                            </PieChart>
                        </ResponsiveContainer>
                    </div>
                </div>
            </div>

            {/* Badges Section */}
            <Badges observations={observations} />
        </div>
    );
};

export default ObservationStats;
