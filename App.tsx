import 'leaflet/dist/leaflet.css';
import React, { useState, useEffect, useMemo } from 'react';
import { Observation, View, TaxonomicGroup, Status } from './types';
import { getObservations, saveObservation, updateObservation, deleteObservation, syncObservations, processOfflineQueue } from './services/storageService';
import ObservationList from './components/ObservationList';
import ObservationForm from './components/ObservationForm';
import ObservationMap from './components/ObservationMap';
import ObservationStats from './components/ObservationStats';
import ObservationGallery from './components/ObservationGallery';
import ObservationCalendar from './components/ObservationCalendar';
import ConfirmationDialog from './components/ConfirmationDialog';
import BottomNavigation from './components/BottomNavigation';
import { INITIAL_OBSERVATIONS } from './constants';
import { fetchSpeciesInfo } from './services/speciesService';

type SortDirection = 'ascending' | 'descending';
type SortKey = keyof Observation | '';

import Login from './components/Auth/Login';
import UserProfile from './components/Auth/UserProfile';
import { useAuth } from './contexts/AuthContext';

const App: React.FC = () => {
    const { user, loading: authLoading } = useAuth();
    const [observations, setObservations] = useState<Observation[]>([]);
    const [view, setView] = useState<View>(View.LIST);
    const [editingObservation, setEditingObservation] = useState<Observation | null>(null);
    const [searchTerm, setSearchTerm] = useState('');
    const [yearFilter, setYearFilter] = useState<string>('all');
    const [taxonomicGroupFilter, setTaxonomicGroupFilter] = useState<TaxonomicGroup | 'all'>('all');
    const [statusFilter, setStatusFilter] = useState<Status | 'all'>('all');
    const [startDateFilter, setStartDateFilter] = useState<string>('');
    const [endDateFilter, setEndDateFilter] = useState<string>('');
    const [sortConfig, setSortConfig] = useState<{ key: SortKey; direction: SortDirection }>({ key: 'date', direction: 'descending' });
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [confirmation, setConfirmation] = useState<{ title: string; message: string; onConfirm: () => void; } | null>(null);

    const [isDarkMode, setIsDarkMode] = useState(false);

    useEffect(() => {
        if (isDarkMode) {
            document.documentElement.classList.add('dark');
        } else {
            document.documentElement.classList.remove('dark');
        }
    }, [isDarkMode]);

    useEffect(() => {
        const loadData = async () => {
            setIsLoading(true);
            try {
                // Try to sync if online
                if (navigator.onLine) {
                    await processOfflineQueue();
                }

                const loadedObservations = await getObservations();
                let obsToUse = loadedObservations;
                if (loadedObservations.length === 0) {
                    // Only sync initial data if we are online and have no data? 
                    // Or maybe just skip this if offline.
                    if (navigator.onLine) {
                        await syncObservations(INITIAL_OBSERVATIONS);
                        obsToUse = INITIAL_OBSERVATIONS;
                    }
                }
                setObservations(obsToUse);
                setIsLoading(false);

                // Auto-fetch missing images for existing observations
                const obsWithMissingImages = obsToUse.filter(obs => !obs.photo && !obs.wikipediaImage && obs.speciesName);

                if (obsWithMissingImages.length > 0) {
                    // Process in background
                    const updatedObs = [...obsToUse];
                    let hasUpdates = false;

                    for (const obs of obsWithMissingImages) {
                        try {
                            const info = await fetchSpeciesInfo(obs.speciesName);
                            if (info && info.imageUrl) {
                                const index = updatedObs.findIndex(o => o.id === obs.id);
                                if (index !== -1) {
                                    updatedObs[index] = {
                                        ...updatedObs[index],
                                        wikipediaImage: info.imageUrl,
                                        latinName: updatedObs[index].latinName || info.latinName || updatedObs[index].latinName,
                                        taxonomicGroup: info.taxonomicGroup || updatedObs[index].taxonomicGroup
                                    };
                                    hasUpdates = true;
                                    // Save individually to storage to persist
                                    await updateObservation(updatedObs[index]);
                                }
                            }
                        } catch (err) {
                            console.error(`Failed to fetch info for ${obs.speciesName}`, err);
                        }
                        // Small delay to be nice to the API
                        await new Promise(resolve => setTimeout(resolve, 200));
                    }

                    if (hasUpdates) {
                        setObservations(updatedObs);
                    }
                }
            } catch (e) {
                setError("Erreur lors du chargement des observations. Le serveur n'est peut-être pas démarré.");
                console.error(e);
                setIsLoading(false);
            }
        };
        loadData();
    }, []);

    const handleAddObservation = () => {
        setEditingObservation(null);
        setView(View.FORM);
    };

    const handleEditObservation = (id: string) => {
        const observationToEdit = observations.find(obs => obs.id === id);
        if (observationToEdit) {
            setEditingObservation(observationToEdit);
            setView(View.FORM);
        }
    };

    const handleDeleteRequest = (id: string) => {
        setConfirmation({
            title: "Confirmer la suppression",
            message: "Êtes-vous sûr de vouloir supprimer cette observation ? Cette action est irréversible.",
            onConfirm: async () => {
                try {
                    await deleteObservation(id);
                    setObservations(prev => prev.filter(obs => obs.id !== id));
                } catch (e) {
                    setError("Erreur lors de la suppression de l'observation.");
                    console.error(e);
                }
            }
        });
    };

    const handleBulkDeleteRequest = (ids: string[]) => {
        setConfirmation({
            title: "Confirmer la suppression multiple",
            message: `Êtes-vous sûr de vouloir supprimer ces ${ids.length} observations ? Cette action est irréversible.`,
            onConfirm: async () => {
                try {
                    // Delete sequentially or in parallel
                    // Parallel might overwhelm the server if too many, but for SQLite it's tricky.
                    // Let's do it sequentially for safety or Promise.all with chunks.
                    // Given the server fix (INSERT OR REPLACE), DELETE should be fine.
                    // But we don't have a bulk delete endpoint.
                    // We will call deleteObservation for each.

                    // Optimistic update
                    const idsSet = new Set(ids);
                    setObservations(prev => prev.filter(obs => !idsSet.has(obs.id)));

                    // Background delete
                    for (const id of ids) {
                        await deleteObservation(id).catch(e => console.error(`Failed to delete ${id}`, e));
                    }
                } catch (e) {
                    setError("Erreur lors de la suppression multiple.");
                    console.error(e);
                }
            }
        });
    };

    const handleSaveObservation = async (observation: Observation) => {
        try {
            if (editingObservation) {
                await updateObservation(observation);
                setObservations(prev => prev.map(obs => obs.id === observation.id ? observation : obs));
            } else {
                const savedObs = await saveObservation(observation);
                // Merge the returned ID with the local observation data to ensure we have all fields (especially date)
                const newObservation = { ...observation, id: savedObs.id };
                setObservations(prev => [newObservation, ...prev]);
            }
            setView(View.LIST);
            setEditingObservation(null);
        } catch (e) {
            setError("Erreur lors de la sauvegarde de l'observation.");
            console.error(e);
        }
    };

    const handleImportRequest = (importedObservations: Observation[]) => {
        setConfirmation({
            title: "Confirmer l'importation",
            message: `Vous allez importer ${importedObservations.length} observations. Les doublons (basés sur l'ID) seront mis à jour. Continuer ?`,
            onConfirm: async () => {
                try {
                    // Merge observations: Update existing ones, add new ones
                    const mergedObservations = [...observations];
                    let addedCount = 0;
                    let updatedCount = 0;

                    importedObservations.forEach(newObs => {
                        const index = mergedObservations.findIndex(existingObs => existingObs.id === newObs.id);
                        if (index !== -1) {
                            mergedObservations[index] = newObs;
                            updatedCount++;
                        } else {
                            mergedObservations.push(newObs);
                            addedCount++;
                        }
                    });

                    await syncObservations(mergedObservations);
                    setObservations(mergedObservations);
                    setView(View.LIST);
                    // Optional: Show success message with details
                    // alert(`${addedCount} ajoutées, ${updatedCount} mises à jour.`);
                } catch (e: any) {
                    const errorMessage = e instanceof Error ? e.message : String(e);
                    setError(`Erreur lors de l'importation : ${errorMessage}`);
                    console.error(e);
                }
            }
        });
    };

    const handleCancel = () => {
        setView(View.LIST);
        setEditingObservation(null);
    };

    const requestSort = (key: SortKey) => {
        let direction: SortDirection = 'ascending';
        if (sortConfig.key === key && sortConfig.direction === 'ascending') {
            direction = 'descending';
        }
        setSortConfig({ key, direction });
    };

    const sortedAndFilteredObservations = useMemo(() => {
        let sortableItems = [...observations];

        // Filtering
        sortableItems = sortableItems
            .filter(obs => {
                if (yearFilter === 'all') return true;
                return new Date(obs.date).getFullYear().toString() === yearFilter;
            })
            .filter(obs => {
                if (taxonomicGroupFilter === 'all') return true;
                return obs.taxonomicGroup === taxonomicGroupFilter;
            })
            .filter(obs => {
                if (statusFilter === 'all') return true;
                return obs.status === statusFilter;
            })
            .filter(obs => {
                if (!startDateFilter) return true;
                return new Date(obs.date) >= new Date(startDateFilter);
            })
            .filter(obs => {
                if (!endDateFilter) return true;
                return new Date(obs.date) <= new Date(endDateFilter);
            })
            .filter(obs => {
                if (!searchTerm) return true;
                const lowerSearchTerm = searchTerm.toLowerCase();
                return (
                    obs.speciesName.toLowerCase().includes(lowerSearchTerm) ||
                    (obs.latinName && obs.latinName.toLowerCase().includes(lowerSearchTerm)) ||
                    (obs.location && obs.location.toLowerCase().includes(lowerSearchTerm)) ||
                    (obs.municipality && obs.municipality.toLowerCase().includes(lowerSearchTerm))
                );
            });

        // Sorting
        if (sortConfig.key) {
            sortableItems.sort((a, b) => {
                const key = sortConfig.key as keyof Observation;
                const aValue = a[key];
                const bValue = b[key];

                if (aValue === null || aValue === undefined) return 1;
                if (bValue === null || bValue === undefined) return -1;

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
    }, [observations, searchTerm, yearFilter, taxonomicGroupFilter, statusFilter, sortConfig]);

    const availableYears = useMemo(() => {
        const years = new Set(observations.map(obs => new Date(obs.date).getFullYear().toString()));
        return Array.from(years).sort((a, b) => parseInt(b) - parseInt(a));
    }, [observations]);

    const [isMobileView, setIsMobileView] = useState(false);

    useEffect(() => {
        if (isDarkMode) {
            document.documentElement.classList.add('dark');
        } else {
            document.documentElement.classList.remove('dark');
        }
    }, [isDarkMode]);

    if (authLoading) {
        return <div className="flex items-center justify-center h-screen"><p>Chargement de la session...</p></div>;
    }

    if (!user) {
        return <Login />;
    }

    if (isLoading) {
        return <div className="flex items-center justify-center h-screen"><p>Chargement des données...</p></div>;
    }

    return (
        <div className={`min-h-screen font-sans transition-colors duration-500 bg-gradient-to-br from-nature-beige to-white dark:from-nature-dark-bg dark:to-nature-dark-surface text-nature-dark dark:text-nature-dark-text ${isMobileView ? 'pb-20' : ''}`}>
            {/* Theme Toggle */}
            <button
                onClick={() => setIsDarkMode(!isDarkMode)}
                className="fixed top-6 right-6 z-50 p-3 rounded-full bg-white/80 dark:bg-nature-dark-surface/80 backdrop-blur-md shadow-ios hover:shadow-ios-hover transition-all duration-300 transform hover:scale-105 border border-white/20 dark:border-white/10"
                title={isDarkMode ? "Mode Clair" : "Mode Sombre"}
            >
                {isDarkMode ? '☀️' : '🌙'}
            </button>

            <UserProfile />

            {/* Mobile View Toggle */}
            <button
                onClick={() => setIsMobileView(!isMobileView)}
                className="fixed top-6 right-20 z-50 p-3 rounded-full bg-white/80 dark:bg-nature-dark-surface/80 backdrop-blur-md shadow-ios hover:shadow-ios-hover transition-all duration-300 transform hover:scale-105 border border-white/20 dark:border-white/10 text-gray-700 dark:text-gray-200"
                title={isMobileView ? "Version Desktop" : "Version Mobile"}
            >
                {isMobileView ? (
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"></path></svg>
                ) : (
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z"></path></svg>
                )}
            </button>

            {/* Server Status Indicator */}
            <div className={`fixed top-6 right-36 z-50 flex items-center gap-2 px-3 py-1.5 rounded-full backdrop-blur-md border shadow-sm transition-all ${error && error.includes('serveur') ? 'bg-red-100/80 border-red-200 text-red-600' : 'bg-green-100/80 border-green-200 text-green-700'}`} title={error && error.includes('serveur') ? "Déconnecté du serveur" : "Connecté au serveur"}>
                <div className={`w-2 h-2 rounded-full ${error && error.includes('serveur') ? 'bg-red-500 animate-pulse' : 'bg-green-500'}`}></div>
                <span className="text-xs font-bold hidden md:inline">{error && error.includes('serveur') ? "Offline" : "Online"}</span>
            </div>

            {confirmation && (
                <ConfirmationDialog
                    isOpen={!!confirmation}
                    onClose={() => setConfirmation(null)}
                    onConfirm={confirmation.onConfirm}
                    title={confirmation.title}
                    message={confirmation.message}
                />
            )}
            {error && (
                <div className="fixed top-20 left-1/2 transform -translate-x-1/2 z-50 bg-red-100/90 backdrop-blur-md border border-red-200 text-red-700 px-6 py-4 rounded-2xl shadow-ios flex items-center gap-3 animate-fadeIn">
                    <strong className="font-bold">Erreur:</strong>
                    <span className="block sm:inline"> {error}</span>
                    <button onClick={() => setError(null)} className="ml-4 text-red-500 hover:text-red-700">
                        <svg className="fill-current h-6 w-6" role="button" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20"><title>Close</title><path d="M14.348 14.849a1.2 1.2 0 0 1-1.697 0L10 11.819l-2.651 3.029a1.2 1.2 0 1 1-1.697-1.697l2.758-3.15-2.759-3.152a1.2 1.2 0 1 1 1.697-1.697L10 8.183l2.651-3.031a1.2 1.2 0 1 1 1.697 1.697l-2.758 3.152 2.758 3.15a1.2 1.2 0 0 1 0 1.698z" /></svg>
                    </button>
                </div>
            )}

            {/* Backup Button (Desktop) */}
            {!isMobileView && (
                <button
                    onClick={() => import('./services/backupService').then(m => m.createBackup(observations))}
                    className="fixed bottom-6 left-6 z-50 p-3 rounded-full bg-white/80 dark:bg-nature-dark-surface/80 backdrop-blur-md shadow-ios hover:shadow-ios-hover transition-all duration-300 transform hover:scale-105 border border-white/20 dark:border-white/10 text-nature-dark dark:text-white"
                    title="Sauvegarde Complète (ZIP)"
                >
                    💾
                </button>
            )}

            <div className={`container mx-auto p-4 md:p-8 max-w-7xl ${isMobileView ? 'px-2' : ''}`}>
                {/* Navigation Tabs - Desktop Only */}
                {!isMobileView && view !== View.FORM && (
                    <div className="flex justify-center mb-10 sticky top-4 z-40">
                        <div className="bg-white/70 dark:bg-nature-dark-surface/70 backdrop-blur-xl rounded-full p-1.5 shadow-ios border border-white/20 dark:border-white/5 flex gap-1 overflow-x-auto max-w-full">
                            {[
                                { id: View.LIST, label: 'Liste', icon: '📝' },
                                { id: View.MAP, label: 'Carte', icon: '🗺️' },
                                { id: View.STATS, label: 'Stats', icon: '📊' },
                                { id: View.CALENDAR, label: 'Calendrier', icon: '📅' },
                                { id: View.GALLERY, label: 'Galerie', icon: '🖼️' }
                            ].map((tab) => (
                                <button
                                    key={tab.id}
                                    onClick={() => setView(tab.id)}
                                    className={`
                                        px-5 py-2.5 rounded-full text-sm font-semibold transition-all duration-300 flex items-center gap-2 whitespace-nowrap
                                        ${view === tab.id
                                            ? 'bg-white dark:bg-nature-dark-bg text-nature-dark dark:text-white shadow-sm scale-105'
                                            : 'text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200 hover:bg-white/30 dark:hover:bg-white/5'}
                                    `}
                                >
                                    <span>{tab.icon}</span>
                                    {tab.label}
                                </button>
                            ))}
                        </div>
                    </div>
                )}

                {/* Bottom Navigation - Mobile Only */}
                {isMobileView && view !== View.FORM && (
                    <BottomNavigation currentView={view} onViewChange={setView} />
                )}

                {view === View.LIST ? (
                    <ObservationList
                        observations={sortedAndFilteredObservations}
                        onAdd={handleAddObservation}
                        onEdit={handleEditObservation}
                        onDelete={handleDeleteRequest}
                        onBulkDelete={handleBulkDeleteRequest}
                        onImport={handleImportRequest}
                        searchTerm={searchTerm}
                        onSearchChange={setSearchTerm}
                        yearFilter={yearFilter}
                        onYearChange={setYearFilter}
                        startDateFilter={startDateFilter}
                        onStartDateChange={setStartDateFilter}
                        endDateFilter={endDateFilter}
                        onEndDateChange={setEndDateFilter}
                        taxonomicGroupFilter={taxonomicGroupFilter}
                        onTaxonomicGroupChange={setTaxonomicGroupFilter}
                        statusFilter={statusFilter}
                        onStatusChange={setStatusFilter}
                        availableYears={availableYears}
                        allObservations={observations}
                        sortConfig={sortConfig}
                        requestSort={requestSort}
                        isMobileView={isMobileView}
                    />
                ) : view === View.MAP ? (
                    <div className={`space-y-6 ${isMobileView ? 'pb-20' : ''}`}>
                        {/* Reuse filters from ObservationList for the Map */}
                        {!isMobileView && (
                            <div className="p-6 bg-white/60 dark:bg-nature-dark-surface/60 backdrop-blur-sm rounded-xl shadow-lg space-y-6">
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-end">
                                    <div className="relative md:col-span-1">
                                        <label htmlFor="search-input" className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-1">Recherche</label>
                                        <input
                                            type="text"
                                            id="search-input"
                                            placeholder="Espèce, lieu..."
                                            value={searchTerm}
                                            onChange={e => setSearchTerm(e.target.value)}
                                            className="w-full px-4 py-2 border border-nature-light-gray dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-nature-green focus:border-transparent transition dark:bg-nature-dark-bg dark:text-white"
                                        />
                                    </div>
                                    <div>
                                        <label htmlFor="year-filter" className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-1">Année</label>
                                        <select
                                            id="year-filter"
                                            value={yearFilter}
                                            onChange={e => setYearFilter(e.target.value)}
                                            className="w-full border border-nature-light-gray dark:border-gray-600 rounded-lg p-2 focus:ring-2 focus:ring-nature-green focus:border-transparent transition dark:bg-nature-dark-bg dark:text-white"
                                        >
                                            <option value="all">Toutes</option>
                                            {availableYears.map(year => (
                                                <option key={year} value={year}>{year}</option>
                                            ))}
                                        </select>
                                    </div>
                                    <div>
                                        <label htmlFor="status-filter" className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-1">Statut</label>
                                        <select
                                            id="status-filter"
                                            value={statusFilter}
                                            onChange={e => setStatusFilter(e.target.value as Status | 'all')}
                                            className="w-full border border-nature-light-gray dark:border-gray-600 rounded-lg p-2 focus:ring-2 focus:ring-nature-green focus:border-transparent transition dark:bg-nature-dark-bg dark:text-white"
                                        >
                                            <option value="all">Tous</option>
                                            {Object.values(Status).map(status => (
                                                <option key={status} value={status}>{status}</option>
                                            ))}
                                        </select>
                                    </div>
                                </div>
                            </div>
                        )}

                        <ObservationMap
                            observations={sortedAndFilteredObservations}
                            isDarkMode={isDarkMode}
                            isMobileView={isMobileView}
                        />

                        <div className={`flex justify-end ${isMobileView ? 'fixed bottom-24 right-4 z-50' : ''}`}>
                            <button
                                onClick={handleAddObservation}
                                className={`px-6 py-2 rounded-full shadow-lg font-semibold text-white transition-all duration-200 transform hover:scale-105 bg-nature-green hover:bg-nature-dark ${isMobileView ? 'w-14 h-14 flex items-center justify-center p-0' : ''}`}
                            >
                                {isMobileView ? <span className="text-2xl">+</span> : 'Ajouter une observation'}
                            </button>
                        </div>
                    </div>
                ) : view === View.STATS ? (
                    <ObservationStats observations={observations} isMobileView={isMobileView} />
                ) : view === View.CALENDAR ? (
                    <ObservationCalendar
                        observations={observations}
                        onEdit={handleEditObservation}
                        onDelete={handleDeleteRequest}
                        isMobileView={isMobileView}
                    />
                ) : view === View.GALLERY ? (
                    <div className={`space-y-6 ${isMobileView ? 'pb-20' : ''}`}>
                        {/* Reuse filters for Gallery too */}
                        {!isMobileView && (
                            <div className="p-6 bg-white/60 dark:bg-nature-dark-surface/60 backdrop-blur-sm rounded-xl shadow-lg space-y-6">
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-end">
                                    <div className="relative md:col-span-1">
                                        <label htmlFor="search-input-gallery" className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-1">Recherche</label>
                                        <input
                                            type="text"
                                            id="search-input-gallery"
                                            placeholder="Espèce, lieu..."
                                            value={searchTerm}
                                            onChange={e => setSearchTerm(e.target.value)}
                                            className="w-full px-4 py-2 border border-nature-light-gray dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-nature-green focus:border-transparent transition dark:bg-nature-dark-bg dark:text-white"
                                        />
                                    </div>
                                    <div>
                                        <label htmlFor="year-filter-gallery" className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-1">Année</label>
                                        <select
                                            id="year-filter-gallery"
                                            value={yearFilter}
                                            onChange={e => setYearFilter(e.target.value)}
                                            className="w-full border border-nature-light-gray dark:border-gray-600 rounded-lg p-2 focus:ring-2 focus:ring-nature-green focus:border-transparent transition dark:bg-nature-dark-bg dark:text-white"
                                        >
                                            <option value="all">Toutes</option>
                                            {availableYears.map(year => (
                                                <option key={year} value={year}>{year}</option>
                                            ))}
                                        </select>
                                    </div>
                                    <div>
                                        <label htmlFor="status-filter-gallery" className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-1">Statut</label>
                                        <select
                                            id="status-filter-gallery"
                                            value={statusFilter}
                                            onChange={e => setStatusFilter(e.target.value as Status | 'all')}
                                            className="w-full border border-nature-light-gray dark:border-gray-600 rounded-lg p-2 focus:ring-2 focus:ring-nature-green focus:border-transparent transition dark:bg-nature-dark-bg dark:text-white"
                                        >
                                            <option value="all">Tous</option>
                                            {Object.values(Status).map(status => (
                                                <option key={status} value={status}>{status}</option>
                                            ))}
                                        </select>
                                    </div>
                                </div>
                            </div>
                        )}
                        <ObservationGallery
                            observations={sortedAndFilteredObservations}
                            onEdit={handleEditObservation}
                            isMobileView={isMobileView}
                        />
                        <div className={`flex justify-end ${isMobileView ? 'fixed bottom-24 right-4 z-50' : ''}`}>
                            <button
                                onClick={handleAddObservation}
                                className={`px-6 py-2 rounded-full shadow-lg font-semibold text-white transition-all duration-200 transform hover:scale-105 bg-nature-green hover:bg-nature-dark ${isMobileView ? 'w-14 h-14 flex items-center justify-center p-0' : ''}`}
                            >
                                {isMobileView ? <span className="text-2xl">+</span> : 'Ajouter une observation'}
                            </button>
                        </div>
                    </div>
                ) : (
                    <ObservationForm
                        onSave={handleSaveObservation}
                        onCancel={handleCancel}
                        initialData={editingObservation}
                    />
                )}
            </div>
        </div>
    );
};

export default App;
