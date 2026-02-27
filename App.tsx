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
import { fetchSpeciesInfo } from './services/speciesService';
import { ImportResult } from './services/excelImportService';
import ToastContainer, { ToastItem, ToastType } from './components/ToastContainer';
import { compareIsoDate, getYearFromIsoDate } from './utils/dateUtils';

type SortDirection = 'ascending' | 'descending';
type SortKey = keyof Observation | '';
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

import Login from './components/Auth/Login';
import UserProfile from './components/Auth/UserProfile';
import { useAuth } from './contexts/AuthContext';
import { supabaseConfigError } from './supabaseClient';

const App: React.FC = () => {
    const ENRICHMENT_BATCH_LIMIT = 20;
    const ENRICHMENT_CONCURRENCY = 3;
    const { user, loading: authLoading, isOffline } = useAuth();
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
    const [toasts, setToasts] = useState<ToastItem[]>([]);

    const [isDarkMode, setIsDarkMode] = useState(() => localStorage.getItem('darkMode') === 'true');

    useEffect(() => {
        localStorage.setItem('darkMode', String(isDarkMode));
    }, [isDarkMode]);

    const removeToast = (id: string) => {
        setToasts(prev => prev.filter(t => t.id !== id));
    };

    const pushToast = (type: ToastType, message: string, durationMs = 4500) => {
        const id = crypto.randomUUID();
        setToasts(prev => [...prev, { id, type, message }]);
        window.setTimeout(() => {
            setToasts(prev => prev.filter(t => t.id !== id));
        }, durationMs);
    };

    useEffect(() => {
        if (isDarkMode) {
            document.documentElement.classList.add('dark');
        } else {
            document.documentElement.classList.remove('dark');
        }
    }, [isDarkMode]);

    // Listen for localStorage quota exceeded and warn user
    useEffect(() => {
        const handleQuota = () => pushToast('warning', 'Stockage local plein — les données hors-ligne risquent de ne pas être sauvegardées. Libérez de l\'espace ou synchronisez vos données.', 8000);
        window.addEventListener('storage-quota-exceeded', handleQuota);
        return () => window.removeEventListener('storage-quota-exceeded', handleQuota);
    }, []);

    useEffect(() => {
        if (authLoading || !user || supabaseConfigError) {
            return;
        }

        let mounted = true;

        const loadData = async () => {
            setIsLoading(true);
            try {
                // Try to sync if online
                if (navigator.onLine) {
                    await processOfflineQueue();
                }

                const obsToUse = await getObservations();
                if (!mounted) return;
                setObservations(obsToUse);
                setIsLoading(false);

                // Auto-fetch missing images for existing observations
                if (!navigator.onLine) return;
                const obsWithMissingImages = obsToUse
                    .filter(obs => !obs.photo && !obs.wikipediaImage && obs.speciesName)
                    .slice(0, ENRICHMENT_BATCH_LIMIT);

                if (obsWithMissingImages.length > 0) {
                    const updatedObs = [...obsToUse];
                    let hasUpdates = false;
                    let nextIndex = 0;

                    const worker = async () => {
                        while (nextIndex < obsWithMissingImages.length && mounted) {
                            const currentIndex = nextIndex;
                            nextIndex += 1;
                            const obs = obsWithMissingImages[currentIndex];

                            try {
                                const info = await fetchSpeciesInfo(obs.speciesName);
                                if (!mounted || !info) continue;

                                const index = updatedObs.findIndex(o => o.id === obs.id);
                                if (index === -1) continue;

                                const nextObservation = {
                                    ...updatedObs[index],
                                    wikipediaImage: info.imageUrl || updatedObs[index].wikipediaImage,
                                    latinName: updatedObs[index].latinName || info.latinName || '',
                                    taxonomicGroup: info.taxonomicGroup || updatedObs[index].taxonomicGroup
                                };

                                const changed = (
                                    nextObservation.wikipediaImage !== updatedObs[index].wikipediaImage ||
                                    nextObservation.latinName !== updatedObs[index].latinName ||
                                    nextObservation.taxonomicGroup !== updatedObs[index].taxonomicGroup
                                );

                                if (!changed) continue;

                                updatedObs[index] = nextObservation;
                                hasUpdates = true;
                                await updateObservation(nextObservation);
                            } catch (err) {
                                console.error(`Failed to fetch info for ${obs.speciesName}`, err);
                            }
                            await new Promise(resolve => setTimeout(resolve, 200));
                        }
                    };

                    await Promise.all(
                        Array.from({ length: Math.min(ENRICHMENT_CONCURRENCY, obsWithMissingImages.length) }, () => worker())
                    );

                    if (hasUpdates && mounted) {
                        setObservations(updatedObs);
                    }
                }
            } catch (e: any) {
                if (!mounted) return;
                const errorMsg = e.message || "Erreur inconnue";
                setError(`Erreur connexion: ${errorMsg}. Le serveur n'est peut-être pas démarré.`);
                console.error(e);
                setIsLoading(false);
            }
        };
        loadData();

        return () => { mounted = false; };
    }, [authLoading, user, supabaseConfigError]);

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
                    const results = await Promise.allSettled(ids.map(id => deleteObservation(id)));
                    const successIds: string[] = [];
                    let failedCount = 0;

                    results.forEach((result, index) => {
                        if (result.status === 'fulfilled') {
                            successIds.push(ids[index]);
                        } else {
                            failedCount++;
                        }
                    });

                    const idsSet = new Set(successIds);
                    setObservations(prev => prev.filter(obs => !idsSet.has(obs.id)));

                    if (failedCount > 0) {
                        pushToast('warning', `${failedCount} suppression(s) ont échoué.`);
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
            throw e;
        }
    };

    const handleImportRequest = async (importResult: ImportResult): Promise<void> => {
        try {
            if (importResult.report.errors.length > 0) {
                throw new Error(`Le fichier contient ${importResult.report.errors.length} erreur(s) bloquante(s).`);
            }

            let regeneratedIds = 0;
            const normalizedImported = importResult.observations.map(obs => {
                if (!UUID_RE.test(String(obs.id).trim())) {
                    regeneratedIds++;
                    return { ...obs, id: crypto.randomUUID() };
                }
                return obs;
            });

            // Deduplicate imported rows by ID, keeping the latest occurrence.
            const importedObservations = Array.from(
                new Map(normalizedImported.map(obs => [obs.id, obs])).values()
            );

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

            if (navigator.onLine) {
                await syncObservations(importedObservations);
            } else {
                const existingIds = new Set(observations.map(obs => obs.id));
                for (const imported of importedObservations) {
                    if (existingIds.has(imported.id)) {
                        await updateObservation(imported);
                    } else {
                        await saveObservation(imported);
                    }
                }
            }
            setObservations(mergedObservations);
            setView(View.LIST);
            setError(null);

            pushToast('success', `Import terminé: ${addedCount} ajoutée(s), ${updatedCount} mise(s) à jour.`);
            if (importResult.report.warnings.length > 0) {
                pushToast('warning', `Import avec ${importResult.report.warnings.length} warning(s).`, 7000);
            }
            if (regeneratedIds > 0) {
                pushToast('warning', `${regeneratedIds} ID(s) non valides ont été régénérés en UUID.`, 7000);
            }
        } catch (e: any) {
            const errorMessage = e instanceof Error ? e.message : String(e);
            setError(`Erreur lors de l'importation : ${errorMessage}`);
            pushToast('error', `Échec de l'import: ${errorMessage}`);
            console.error(e);
            throw e;
        }
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
                return getYearFromIsoDate(obs.date) === yearFilter;
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
                return compareIsoDate(obs.date, startDateFilter) >= 0;
            })
            .filter(obs => {
                if (!endDateFilter) return true;
                return compareIsoDate(obs.date, endDateFilter) <= 0;
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
    }, [observations, searchTerm, yearFilter, taxonomicGroupFilter, statusFilter, startDateFilter, endDateFilter, sortConfig]);

    const availableYears = useMemo(() => {
        const years = new Set(
            observations
                .map(obs => getYearFromIsoDate(obs.date))
                .filter((year): year is string => !!year)
        );
        return Array.from(years).sort((a, b) => parseInt(b) - parseInt(a));
    }, [observations]);

    const [isMobileView, setIsMobileView] = useState<boolean>(() => {
        if (typeof window === 'undefined') return false;
        return window.matchMedia('(max-width: 1024px)').matches;
    });

    useEffect(() => {
        const mediaQuery = window.matchMedia('(max-width: 1024px)');
        const handleChange = (event: MediaQueryListEvent) => {
            setIsMobileView(event.matches);
        };

        setIsMobileView(mediaQuery.matches);
        mediaQuery.addEventListener('change', handleChange);
        return () => mediaQuery.removeEventListener('change', handleChange);
    }, []);



    if (supabaseConfigError) {
        return (
            <div className="flex flex-col items-center justify-center min-h-screen bg-gradient-to-br from-nature-beige to-white dark:from-nature-dark-bg dark:to-nature-dark-surface p-4">
                <div className="w-full max-w-lg bg-white/80 dark:bg-nature-dark-surface/80 backdrop-blur-xl rounded-2xl shadow-ios p-8 border border-white/20 text-center">
                    <h1 className="text-3xl font-bold mb-3 text-nature-dark dark:text-white">Configuration invalide</h1>
                    <p className="text-gray-700 dark:text-gray-300">{supabaseConfigError}</p>
                    <p className="text-sm text-gray-500 dark:text-gray-400 mt-4">Ajoutez les variables dans `.env.local`, puis redémarrez l’application.</p>
                </div>
            </div>
        );
    }

    if (authLoading) {
        return <div className="flex items-center justify-center h-screen"><p>Chargement de la session...</p></div>;
    }

    if (!user) {
        // If offline and no cached user, show offline message instead of broken Login form
        if (isOffline) {
            return (
                <div className="flex flex-col items-center justify-center min-h-screen bg-gradient-to-br from-nature-beige to-white dark:from-nature-dark-bg dark:to-nature-dark-surface p-4">
                    <div className="w-full max-w-md bg-white/80 dark:bg-nature-dark-surface/80 backdrop-blur-xl rounded-2xl shadow-ios p-8 border border-white/20 text-center">
                        <h1 className="text-3xl font-bold mb-2 text-nature-dark dark:text-white">Carnet Naturaliste</h1>
                        <div className="text-6xl mb-4">📡</div>
                        <p className="text-gray-600 dark:text-gray-400 mb-4">Vous êtes hors-ligne. Connectez-vous à Internet pour vous identifier.</p>
                        <p className="text-sm text-gray-400 dark:text-gray-500">Une fois connecté, vos données seront disponibles hors-ligne.</p>
                    </div>
                </div>
            );
        }
        return <Login />;
    }

    if (isLoading) {
        return <div className="flex items-center justify-center h-screen"><p>Chargement des données...</p></div>;
    }

    return (
        <div className={`min-h-screen font-sans transition-colors duration-500 bg-gradient-to-br from-nature-beige to-white dark:from-nature-dark-bg dark:to-nature-dark-surface text-nature-dark dark:text-nature-dark-text ${isMobileView ? 'pb-20' : ''}`}>

            {/* Mobile Layout: Glass Header */}
            {isMobileView ? (
                <header className="fixed top-0 left-0 right-0 z-50 px-4 py-3 bg-white/70 dark:bg-nature-dark-surface/70 backdrop-blur-md border-b border-white/20 dark:border-white/5 shadow-sm flex items-center justify-between transition-all duration-300">
                    <UserProfile />
                    <div className="flex items-center gap-2">
                        {/* Server Status Mobile */}
                        <div className={`w-3 h-3 rounded-full ${isOffline ? 'bg-red-500 animate-pulse' : 'bg-green-500'}`} title={isOffline ? "Offline" : "Online"}></div>

                        <button
                            onClick={() => setIsDarkMode(!isDarkMode)}
                            className="p-2 rounded-full bg-white/50 dark:bg-white/10 hover:bg-white/80 dark:hover:bg-white/20 transition-all"
                        >
                            {isDarkMode ? '☀️' : '🌙'}
                        </button>
                    </div>
                </header>
            ) : (
                /* Desktop Layout: Floating Buttons */
                <>
                    <div className="fixed top-6 left-6 z-50">
                        <UserProfile />
                    </div>

                    <button
                        onClick={() => setIsDarkMode(!isDarkMode)}
                        className="fixed top-6 right-6 z-50 p-3 rounded-full bg-white/80 dark:bg-nature-dark-surface/80 backdrop-blur-md shadow-ios hover:shadow-ios-hover transition-all duration-300 transform hover:scale-105 border border-white/20 dark:border-white/10"
                        title={isDarkMode ? "Mode Clair" : "Mode Sombre"}
                    >
                        {isDarkMode ? '☀️' : '🌙'}
                    </button>

                    <div className={`fixed top-6 right-20 z-50 flex items-center gap-2 px-3 py-1.5 rounded-full backdrop-blur-md border shadow-sm transition-all ${isOffline ? 'bg-red-100/80 border-red-200 text-red-600' : 'bg-green-100/80 border-green-200 text-green-700'}`} title={isOffline ? "Déconnecté du serveur" : "Connecté au serveur"}>
                        <div className={`w-2 h-2 rounded-full ${isOffline ? 'bg-red-500 animate-pulse' : 'bg-green-500'}`}></div>
                        <span className="text-xs font-bold hidden md:inline">{isOffline ? "Offline" : "Online"}</span>
                    </div>
                </>
            )}

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
                <div className={`fixed left-1/2 transform -translate-x-1/2 z-50 bg-red-100/90 backdrop-blur-md border border-red-200 text-red-700 px-6 py-4 rounded-2xl shadow-ios flex items-center gap-3 animate-fadeIn w-[90%] md:w-auto ${isMobileView ? 'top-24' : 'top-20'}`}>
                    <strong className="font-bold">Erreur:</strong>
                    <span className="block sm:inline"> {error}</span>
                    <button onClick={() => setError(null)} className="ml-4 text-red-500 hover:text-red-700">
                        <svg className="fill-current h-6 w-6" role="button" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20"><title>Close</title><path d="M14.348 14.849a1.2 1.2 0 0 1-1.697 0L10 11.819l-2.651 3.029a1.2 1.2 0 1 1-1.697-1.697l2.758-3.15-2.759-3.152a1.2 1.2 0 1 1 1.697-1.697L10 8.183l2.651-3.031a1.2 1.2 0 1 1 1.697 1.697l-2.758 3.152 2.758 3.15a1.2 1.2 0 0 1 0 1.698z" /></svg>
                    </button>
                </div>
            )}
            <ToastContainer toasts={toasts} onDismiss={removeToast} />

            {/* Backup Button (Desktop Only) */}
            {!isMobileView && (
                <button
                    onClick={() => import('./services/backupService').then(m => m.createBackup(observations))}
                    className="fixed bottom-6 left-6 z-50 p-3 rounded-full bg-white/80 dark:bg-nature-dark-surface/80 backdrop-blur-md shadow-ios hover:shadow-ios-hover transition-all duration-300 transform hover:scale-105 border border-white/20 dark:border-white/10 text-nature-dark dark:text-white"
                    title="Sauvegarde Complète (ZIP)"
                >
                    💾
                </button>
            )}

            <div className={`container mx-auto p-4 md:p-8 max-w-7xl ${isMobileView ? 'pt-24 px-2' : ''}`}>
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
                        onToast={pushToast}
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
                        {/* Filters for Map view */}
                        <div className={`${isMobileView ? 'p-3 bg-white/70 dark:bg-nature-dark-surface/70 backdrop-blur-md rounded-xl shadow-sm space-y-2' : 'p-6 bg-white/60 dark:bg-nature-dark-surface/60 backdrop-blur-sm rounded-xl shadow-lg space-y-6'}`}>
                            <div className={`grid ${isMobileView ? 'grid-cols-2 gap-2' : 'grid-cols-1 md:grid-cols-3 gap-6'} items-end`}>
                                <div className={`relative ${isMobileView ? '' : 'md:col-span-1'}`}>
                                    <label htmlFor="search-input" className={`block font-bold text-gray-700 dark:text-gray-300 mb-1 ${isMobileView ? 'text-xs' : 'text-sm'}`}>Recherche</label>
                                    <input
                                        type="text"
                                        id="search-input"
                                        placeholder="Espèce, lieu..."
                                        value={searchTerm}
                                        onChange={e => setSearchTerm(e.target.value)}
                                        className={`w-full border border-nature-light-gray dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-nature-green focus:border-transparent transition dark:bg-nature-dark-bg dark:text-white ${isMobileView ? 'px-2 py-1.5 text-xs' : 'px-4 py-2'}`}
                                    />
                                </div>
                                <div>
                                    <label htmlFor="year-filter" className={`block font-bold text-gray-700 dark:text-gray-300 mb-1 ${isMobileView ? 'text-xs' : 'text-sm'}`}>Année</label>
                                    <select
                                        id="year-filter"
                                        value={yearFilter}
                                        onChange={e => setYearFilter(e.target.value)}
                                        className={`w-full border border-nature-light-gray dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-nature-green focus:border-transparent transition dark:bg-nature-dark-bg dark:text-white ${isMobileView ? 'p-1.5 text-xs' : 'p-2'}`}
                                    >
                                        <option value="all">Toutes</option>
                                        {availableYears.map(year => (
                                            <option key={year} value={year}>{year}</option>
                                        ))}
                                    </select>
                                </div>
                                {!isMobileView && (
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
                                )}
                            </div>
                        </div>

                        <ObservationMap
                            observations={sortedAndFilteredObservations}
                            isDarkMode={isDarkMode}
                            isMobileView={isMobileView}
                            onToast={pushToast}
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
                        {/* Filters for Gallery view */}
                        <div className={`${isMobileView ? 'p-3 bg-white/70 dark:bg-nature-dark-surface/70 backdrop-blur-md rounded-xl shadow-sm space-y-2' : 'p-6 bg-white/60 dark:bg-nature-dark-surface/60 backdrop-blur-sm rounded-xl shadow-lg space-y-6'}`}>
                            <div className={`grid ${isMobileView ? 'grid-cols-2 gap-2' : 'grid-cols-1 md:grid-cols-3 gap-6'} items-end`}>
                                <div className={`relative ${isMobileView ? '' : 'md:col-span-1'}`}>
                                    <label htmlFor="search-input-gallery" className={`block font-bold text-gray-700 dark:text-gray-300 mb-1 ${isMobileView ? 'text-xs' : 'text-sm'}`}>Recherche</label>
                                    <input
                                        type="text"
                                        id="search-input-gallery"
                                        placeholder="Espèce, lieu..."
                                        value={searchTerm}
                                        onChange={e => setSearchTerm(e.target.value)}
                                        className={`w-full border border-nature-light-gray dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-nature-green focus:border-transparent transition dark:bg-nature-dark-bg dark:text-white ${isMobileView ? 'px-2 py-1.5 text-xs' : 'px-4 py-2'}`}
                                    />
                                </div>
                                <div>
                                    <label htmlFor="year-filter-gallery" className={`block font-bold text-gray-700 dark:text-gray-300 mb-1 ${isMobileView ? 'text-xs' : 'text-sm'}`}>Année</label>
                                    <select
                                        id="year-filter-gallery"
                                        value={yearFilter}
                                        onChange={e => setYearFilter(e.target.value)}
                                        className={`w-full border border-nature-light-gray dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-nature-green focus:border-transparent transition dark:bg-nature-dark-bg dark:text-white ${isMobileView ? 'p-1.5 text-xs' : 'p-2'}`}
                                    >
                                        <option value="all">Toutes</option>
                                        {availableYears.map(year => (
                                            <option key={year} value={year}>{year}</option>
                                        ))}
                                    </select>
                                </div>
                                {!isMobileView && (
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
                                )}
                            </div>
                        </div>
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
                        onToast={pushToast}
                    />
                )}
            </div>
        </div>
    );
};

export default App;
