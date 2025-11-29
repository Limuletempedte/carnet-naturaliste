import React, { useState } from 'react';
import Calendar from 'react-calendar';
import 'react-calendar/dist/Calendar.css';
import { Observation } from '../types';
import ObservationRow from './ObservationRow';

interface ObservationCalendarProps {
    observations: Observation[];
    onEdit: (id: string) => void;
    onDelete: (id: string) => void;
    isMobileView?: boolean;
}

type ValuePiece = Date | null;
type Value = ValuePiece | [ValuePiece, ValuePiece];

const ObservationCalendar: React.FC<ObservationCalendarProps> = ({ observations, onEdit, onDelete, isMobileView = false }) => {
    const [date, setDate] = useState<Value>(new Date());

    const getObservationsForDate = (date: Date) => {
        const dateString = date.toISOString().split('T')[0];
        return observations.filter(obs => obs.date === dateString);
    };

    const tileContent = ({ date, view }: { date: Date; view: string }) => {
        if (view === 'month') {
            const dateString = date.toISOString().split('T')[0];
            const dayObservations = observations.filter(obs => obs.date === dateString);
            if (dayObservations.length > 0) {
                return (
                    <div className="flex justify-center mt-1">
                        <div className="w-2 h-2 bg-nature-green rounded-full"></div>
                        {dayObservations.length > 1 && (
                            <span className="text-[10px] text-nature-dark ml-1 font-bold">{dayObservations.length}</span>
                        )}
                    </div>
                );
            }
        }
        return null;
    };

    const selectedObservations = date instanceof Date ? getObservationsForDate(date) : [];

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
                        <span className="text-2xl">📅</span>
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
                                        <th className="p-5 text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">Groupe</th>
                                        <th className="p-5 text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">Espèce</th>
                                        <th className="p-5 text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400 hidden md:table-cell">Lieu</th>
                                        <th className="p-5 text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400 hidden lg:table-cell">Date</th>
                                        <th className="p-5 text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">Nb.</th>
                                        <th className="p-5 text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400 text-center">Actions</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100 dark:divide-white/5">
                                    {selectedObservations.map(obs => (
                                        <ObservationRow key={obs.id} observation={obs} onEdit={onEdit} onDelete={onDelete} />
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
            <style>{`
                .react-calendar-custom {
                    width: 100%;
                    background: transparent;
                    font-family: 'Inter', sans-serif;
                }
                .react-calendar__navigation {
                    margin-bottom: 1rem;
                }
                .react-calendar__navigation button {
                    color: #1C1C1E;
                    min-width: 44px;
                    background: none;
                    font-size: 16px;
                    font-weight: 600;
                    border-radius: 8px;
                }
                .dark .react-calendar__navigation button {
                    color: #F2F2F7;
                }
                .react-calendar__navigation button:enabled:hover,
                .react-calendar__navigation button:enabled:focus {
                    background-color: #F2F2F7;
                }
                .dark .react-calendar__navigation button:enabled:hover,
                .dark .react-calendar__navigation button:enabled:focus {
                    background-color: #2C2C2E;
                }
                .react-calendar__month-view__weekdays {
                    text-transform: uppercase;
                    font-weight: bold;
                    font-size: 0.75em;
                    color: #8E8E93;
                    margin-bottom: 0.5rem;
                }
                .react-calendar__tile {
                    padding: 10px 6px;
                    font-size: 14px;
                    font-weight: 500;
                    color: #1C1C1E;
                }
                .dark .react-calendar__tile {
                    color: #F2F2F7;
                }
                .react-calendar__tile:enabled:hover,
                .react-calendar__tile:enabled:focus {
                    background: #F2F2F7;
                    border-radius: 12px;
                    color: #1C1C1E;
                }
                .dark .react-calendar__tile:enabled:hover,
                .dark .react-calendar__tile:enabled:focus {
                    background: #2C2C2E;
                    color: #F2F2F7;
                }
                .react-calendar__tile--now {
                    background: #FFD60A !important;
                    border-radius: 12px;
                    color: #000000 !important;
                    font-weight: bold;
                }
                .react-calendar__tile--active {
                    background: #34C759 !important;
                    color: white !important;
                    border-radius: 12px;
                    font-weight: bold;
                    box-shadow: 0 4px 12px rgba(52, 199, 89, 0.3);
                }
                .react-calendar__tile--active:enabled:hover,
                .react-calendar__tile--active:enabled:focus {
                    background: #34C759 !important;
                }
                .dark .react-calendar__month-view__days__day--weekend {
                    color: #FF3B30;
                }
            `}</style>
        </div>
    );
};

export default ObservationCalendar;
