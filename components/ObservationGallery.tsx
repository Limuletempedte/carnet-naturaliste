import React from 'react';
import { Observation } from '../types';
import { TAXON_LOGOS } from '../constants';

interface ObservationGalleryProps {
    observations: Observation[];
    onEdit: (id: string) => void;
    isMobileView?: boolean;
}

const ObservationGallery: React.FC<ObservationGalleryProps> = ({ observations, onEdit, isMobileView = false }) => {
    return (
        <div className={`grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-8 animate-fadeIn ${isMobileView ? 'pb-24' : ''}`}>
            {observations.map(obs => {
                const imageSrc = obs.photo || obs.wikipediaImage;
                const logo = TAXON_LOGOS[obs.taxonomicGroup as keyof typeof TAXON_LOGOS];

                return (
                    <div
                        key={obs.id}
                        className="bg-white/80 dark:bg-nature-dark-surface/80 backdrop-blur-xl rounded-3xl shadow-ios border border-white/20 dark:border-white/5 overflow-hidden hover:shadow-ios-hover transition-all duration-300 transform hover:-translate-y-2 cursor-pointer group"
                        onClick={() => onEdit(obs.id)}
                    >
                        <div className="relative h-56 overflow-hidden">
                            {imageSrc ? (
                                <img
                                    src={imageSrc}
                                    alt={obs.speciesName}
                                    className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110"
                                />
                            ) : (
                                <div className="w-full h-full bg-nature-beige dark:bg-white/5 flex items-center justify-center text-gray-300 dark:text-gray-600">
                                    <span className="text-5xl filter grayscale opacity-50">📷</span>
                                </div>
                            )}
                            <div className="absolute top-3 right-3 bg-white/90 dark:bg-nature-dark-surface/90 rounded-full p-1.5 shadow-sm backdrop-blur-md">
                                {logo && <img src={logo} alt={obs.taxonomicGroup} className="w-6 h-6 object-contain" />}
                            </div>
                            <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent p-5 pt-12">
                                <h3 className="text-white font-bold text-lg truncate drop-shadow-md">{obs.speciesName}</h3>
                                <p className="text-white/90 text-xs font-medium italic truncate">{obs.latinName}</p>
                            </div>
                        </div>
                        <div className="p-5">
                            <div className="flex justify-between items-center text-sm text-gray-600 dark:text-gray-300 mb-3">
                                <span className="flex items-center gap-1.5 font-medium">
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                                    </svg>
                                    {new Date(obs.date).toLocaleDateString('fr-FR')}
                                </span>
                                <span className="bg-nature-green/10 dark:bg-nature-green/20 text-nature-green dark:text-nature-green px-2.5 py-0.5 rounded-full text-xs font-bold">
                                    {obs.count}
                                </span>
                            </div>
                            <div className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400 truncate">
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                                </svg>
                                <span className="truncate">{obs.location} {obs.municipality && `(${obs.municipality})`}</span>
                            </div>
                        </div>
                    </div>
                );
            })}
        </div>
    );
};

export default ObservationGallery;
