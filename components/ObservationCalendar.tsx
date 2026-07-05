import React, { useMemo, useState } from 'react';
import Calendar from 'react-calendar';
import 'react-calendar/dist/Calendar.css';
import '../calendar.css';
import { Observation } from '../types';
import ObservationRow from './ObservationRow';
import { dateToIsoLocal } from '../utils/dateUtils';
import { CalendarIcon } from './icons';

interface ObservationCalendarProps {
    observations: Observation[];
    // EE-2 : le clic sur une ligne ouvre la vue détail (lecture seule).
    onView: (id: string) => void;
    onEdit: (id: string) => void;
    onDelete: (id: string) => void;
    isMobileView?: boolean;
}

type ValuePiece = Date | null;
type Value = ValuePiece | [ValuePiece, ValuePiece];

const ObservationCalendar: React.FC<ObservationCalendarProps> = ({ observations, onView, onEdit, onDelete, isMobileView = false }) => {
    const [date, setDate] = useState<Value>(new Date());
    const observationsByDate = useMemo(() => {
        const grouped = new Map<string, Observation[]>();
        observations.forEach((observation) => {
            const existing = grouped.get(observation.date);
            if (existing) {
                existing.push(observation);
            } else {
                grouped.set(observation.date, [observation]);
            }
        });
        return grouped;
    }, [observations]);

    const getObservationsForDate = (date: Date) => {
        const dateString = dateToIsoLocal(date);
        return observationsByDate.get(dateString) || [];
    };

    const tileContent = ({ date, view }: { date: Date; view: string }) => {
        if (view === 'month') {
            const dateString = dateToIsoLocal(date);
            const dayObservationsCount = observationsByDate.get(dateString)?.length || 0;
            if (dayObservationsCount > 0) {
                return (
                    <div className="flex justify-center items-center mt-1">
                        <div className="w-2 h-2 bg-nature-green rounded-full"></div>
                        <span className="text-[10px] text-nature-dark dark:text-nature-green ml-1 font-bold">{dayObservationsCount}</span>
                    </div>
                );
            }
        }
        return null;
    };

    const selectedDate = Array.isArray(date) ? date[0] : date;
    const selectedObservations = selectedDate instanceof Date ? getObservationsForDate(selectedDate) : [];

    return (
        <div className={`space-y-8 animate-fadeIn ${isMobileView ? 'pb-24' : ''}`}>
            <div className={`bg-white/80 dark:bg-nature-dark-surface/80 backdrop-blur-xl rounded-3xl shadow-ios border border-white/20 dark:border-white/5 flex flex-col items-center ${isMobileView ? 'p-4' : 'p-8'}`}>
                <h2 className="text-3xl font-bold text-nature-dark dark:text-white mb-8">Calendrier des Observations</h2>
                <div className={`calendar-container bg-white dark:bg-nature-dark-bg rounded-2xl shadow-inner ring-1 ring-black/5 w-full max-w-md ${isMobileView ? 'p-2' : 'p-6'}`}>
                    <Calendar
                        onChange={setDate}
                        value={date}
                        tileContent={tileContent}
                        className="react-calendar-custom border-none rounded-xl font-sans w-full"
                    />
                </div>
            </div>

            {date instanceof Date && (
                <div className={`bg-white/80 dark:bg-nature-dark-surface/80 backdrop-blur-xl rounded-3xl shadow-ios border border-white/20 dark:border-white/5 ${isMobileView ? 'p-4' : 'p-8'}`}>
                    <h3 className="text-xl font-bold text-nature-dark dark:text-white mb-6 pb-4 border-b border-gray-100 dark:border-white/5 flex items-center gap-2">
                        <CalendarIcon className="w-6 h-6" />
                        {isMobileView ? (
                            <span>{date.toLocaleDateString('fr-FR')}</span>
                        ) : (
                            <span>Observations du {date.toLocaleDateString('fr-FR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</span>
                        )}
                    </h3>
                    {selectedObservations.length > 0 ? (
                        <div className="overflow-hidden rounded-2xl border border-gray-100 dark:border-white/5">
                            <table className="w-full text-left border-collapse">
                                <thead className="bg-gray-50/50 dark:bg-white/5 border-b border-gray-100 dark:border-white/5">
                                    <tr>
                                        <th className="p-5 text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400 hidden md:table-cell">Groupe</th>
                                        <th className="p-5 text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">Espèce</th>
                                        <th className="p-5 text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400 hidden md:table-cell">Lieu</th>
                                        <th className="p-5 text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400 hidden lg:table-cell">Date</th>
                                        <th className="p-5 text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">Nb.</th>
                                        <th className="p-5 text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400 text-center">Statut</th>
                                        <th className="p-5 text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400 text-center">Actions</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100 dark:divide-white/5">
                                    {selectedObservations.map(obs => (
                                        <ObservationRow key={obs.id} observation={obs} onView={onView} onEdit={onEdit} onDelete={onDelete} selected={false} onToggle={() => { }} showSelection={false} />
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    ) : (
                        <div className="text-center py-12 bg-gray-50/50 dark:bg-white/5 rounded-2xl border border-dashed border-gray-200 dark:border-gray-700">
                            <p className="text-gray-500 dark:text-gray-400 font-medium">Aucune observation pour cette date.</p>
                            <p className="text-sm text-gray-400 mt-1">Sélectionnez une autre date ou ajoutez une observation.</p>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

export default ObservationCalendar;
