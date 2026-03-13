import React, { Suspense, lazy, useState, useEffect, useRef } from 'react';
import { Observation, View, TaxonomicGroup, Status } from './types';
import { getObservations, saveObservation, updateObservation, deleteObservation, processOfflineQueue, bulkUpsertObservationsInCache } from './services/storageService';
import ObservationList from './components/ObservationList';
import ConfirmationDialog from './components/ConfirmationDialog';
import BottomNavigation from './components/BottomNavigation';
import { fetchSpeciesInfo } from './services/speciesService';
import { ImportResult } from './services/excelImportService';
import FilterBar from './components/FilterBar';
import ToastContainer, { ToastItem, ToastType } from './components/ToastContainer';
import { compareIsoDate } from './utils/dateUtils';
import { buildImportPersistencePlan } from './services/importPolicy';
import { isUuid } from './utils/uuidUtils';
import { useObservationFilters } from './hooks/useObservationFilters';
import { selectStartupEnrichmentCandidates } from './services/startupEnrichmentUtils';

type AppConnectionStatus = 'online' | 'offline' | 'degraded';

import Login from './components/Auth/Login';
import UserProfile from './components/Auth/UserProfile';
import { useAuth } from './contexts/AuthContext';
import { supabaseConfigError } from './supabaseClient';

const ObservationForm = lazy(() => import('./components/ObservationForm'));
const ObservationMap = lazy(() => import('./components/ObservationMap'));
const ObservationStats = lazy(() => import('./components/ObservationStats'));
const ObservationGallery = lazy(() => import('./components/ObservationGallery'));
const ObservationCalendar = lazy(() => import('./components/ObservationCalendar'));

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
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [confirmation, setConfirmation] = useState<{ title: string; message: string; onConfirm: () => void; } | null>(null);
    const [toasts, setToasts] = useState<ToastItem[]>([]);
    const [connectionStatus, setConnectionStatus] = useState<AppConnectionStatus>(isOffline ? 'offline' : 'online');
    const [isBulkDeleting, setIsBulkDeleting] = useState(false);
    const [isImporting, setIsImporting] = useState(false);
    const [isCreatingBackup, setIsCreatingBackup] = useState(false);
    const [isExportingStats, setIsExportingStats] = useState(false);
    const statsRootRef = useRef<HTMLDivElement | null>(null);

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
        if (durationMs > 0) {
            window.setTimeout(() => {
                setToasts(prev => prev.filter(t => t.id !== id));
            }, durationMs);
        }
        return id;
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
        const handleMediaStripped = (event: Event) => {
            const strippedCount = (event as CustomEvent<{ count?: number }>).detail?.count;
            if (!strippedCount || strippedCount < 1) return;
            pushToast('warning', `⚠️ ${strippedCount} photo(s)/son(s) non disponibles hors-ligne (trop volumineuses pour le cache local).`, 8000);
        };

        window.addEventListener('storage-quota-exceeded', handleQuota);
        window.addEventListener('media-stripped-offline', handleMediaStripped);

        return () => {
            window.removeEventListener('storage-quota-exceeded', handleQuota);
            window.removeEventListener('media-stripped-offline', handleMediaStripped);
        };
    }, []);

    useEffect(() => {
        if (isOffline) {
            setConnectionStatus('offline');
        } else {
            setConnectionStatus(prev => prev === 'offline' ? 'online' : prev);
        }
    }, [isOffline]);

    // Auto-dismiss error banner after 10 seconds
    useEffect(() => {
        if (!error) return;
        const timer = setTimeout(() => setError(null), 10000);
        return () => clearTimeout(timer);
    }, [error]);

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
                    const syncResult = await processOfflineQueue();
                    if (syncResult.failed > 0) {
                        setConnectionStatus('degraded');
                        pushToast(
                            'warning',
                            `Synchronisation partielle: ${syncResult.failed}/${syncResult.processed} action(s) en échec.${syncResult.failureReasons.length > 0 ? ` ${syncResult.failureReasons.slice(0, 2).join(' ; ')}` : ''}`,
                            8000
                        );
                    } else if (syncResult.processed > 0) {
                        setConnectionStatus('online');
                        pushToast('success', `${syncResult.processed} action(s) hors-ligne synchronisée(s).`);
                    }
                }

                const loadResult = await getObservations();
                if (!mounted) return;
                setObservations(loadResult.observations);
                setConnectionStatus(
                    isOffline
                        ? 'offline'
                        : loadResult.source === 'cache'
                            ? 'degraded'
                            : 'online'
                );
                if (loadResult.source === 'cache' && loadResult.warning) {
                    pushToast('warning', `Affichage du cache local: ${loadResult.warning}`, 7000);
                }
                setIsLoading(false);

                // Auto-fetch missing images for existing observations
                if (!navigator.onLine) return;
                const startupSelection = selectStartupEnrichmentCandidates(loadResult.observations, ENRICHMENT_BATCH_LIMIT);
                const skippedForAmbiguity = startupSelection.skippedDueToMissingLatin;

                if (skippedForAmbiguity > 0) {
                    console.info(`[startup-enrichment] ${skippedForAmbiguity} observation(s) ignorée(s) (nom latin absent, source ambiguë).`);
                }

                const obsWithMissingImages = startupSelection.candidates;

                if (obsWithMissingImages.length > 0) {
                    const updatedObs = [...loadResult.observations];
                    let hasUpdates = false;
                    let nextIndex = 0;

                    const worker = async () => {
                        while (nextIndex < obsWithMissingImages.length && mounted) {
                            const currentIndex = nextIndex;
                            nextIndex += 1;
                            const obs = obsWithMissingImages[currentIndex];

                            try {
                                const info = await fetchSpeciesInfo(obs.latinName.trim());
                                if (!mounted || !info) continue;

                                const index = updatedObs.findIndex(o => o.id === obs.id);
                                if (index === -1) continue;

                                const nextObservation = {
                                    ...updatedObs[index],
                                    wikipediaImage: info.imageUrl || updatedObs[index].wikipediaImage
                                };

                                const changed = (
                                    nextObservation.wikipediaImage !== updatedObs[index].wikipediaImage
                                );

                                if (!changed) continue;

                                updatedObs[index] = nextObservation;
                                hasUpdates = true;
                                await updateObservation(nextObservation);
                            } catch (err) {
                                console.error(`Failed to fetch info for ${obs.latinName}`, err);
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
                setConnectionStatus(navigator.onLine ? 'degraded' : 'offline');
                setError(`Erreur connexion: ${errorMsg}.`);
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
        window.scrollTo({ top: 0, behavior: 'smooth' });
    };

    const handleEditObservation = (id: string) => {
        const observationToEdit = observations.find(obs => obs.id === id);
        if (observationToEdit) {
            setEditingObservation(observationToEdit);
            setView(View.FORM);
            window.scrollTo({ top: 0, behavior: 'smooth' });
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
                setIsBulkDeleting(true);
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
                } finally {
                    setIsBulkDeleting(false);
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
            window.scrollTo({ top: 0, behavior: 'smooth' });
        } catch (e) {
            const errorMessage = e instanceof Error ? e.message : String(e);
            setError(`Erreur lors de la sauvegarde de l'observation: ${errorMessage}`);
            console.error(e);
            throw e;
        }
    };

    const handleImportRequest = async (importResult: ImportResult): Promise<void> => {
        let importToastId: string | null = null;
        try {
            if (importResult.report.blockingErrors.length > 0) {
                throw new Error(`Le fichier contient ${importResult.report.blockingErrors.length} erreur(s) bloquante(s).`);
            }

            setIsImporting(true);
            importToastId = pushToast('info', "⏳ Import en cours...", 0);

            const mergedById = new Map(observations.map(obs => [obs.id, obs] as [string, Observation]));
            const failureReasons = new Map<string, number>();
            let addedCount = 0;
            let updatedCount = 0;
            let failedCount = 0;
            let regeneratedIds = 0;

            const captureFailure = (reason: string) => {
                failureReasons.set(reason, (failureReasons.get(reason) || 0) + 1);
            };

            const toErrorMessage = (error: unknown): string => {
                if (error instanceof Error && error.message) return error.message;
                return String(error);
            };

            const importPlan = buildImportPersistencePlan(importResult.observations, observations);
            const successfulOps: Observation[] = [];

            const IMPORT_CONCURRENCY = 5;
            let nextIndex = 0;

            const worker = async () => {
                while (nextIndex < importPlan.length) {
                    const i = nextIndex++;
                    const planned = importPlan[i];
                    const observationToPersist = planned.observation;

                    if (planned.regeneratedId && !isUuid(planned.originalId)) {
                        regeneratedIds++;
                    }

                    try {
                        if (planned.mode === 'update') {
                            await updateObservation(observationToPersist, { skipCache: true });
                            successfulOps.push(observationToPersist);
                            updatedCount++;
                        } else {
                            const savedObs = await saveObservation(observationToPersist, { skipCache: true });
                            const persisted = { ...observationToPersist, id: savedObs.id };
                            successfulOps.push(persisted);
                            addedCount++;
                        }
                    } catch (importError) {
                        failedCount++;
                        captureFailure(toErrorMessage(importError));
                    }
                }
            };

            // Exécution en batch concurrent
            await Promise.all(Array.from({ length: IMPORT_CONCURRENCY }, worker));

            const successCount = addedCount + updatedCount;
            const failureSummary = Array.from(failureReasons.entries())
                .sort((a, b) => b[1] - a[1])
                .slice(0, 3)
                .map(([reason, count]) => `${count}× ${reason}`)
                .join(' ; ');

            if (successCount === 0) {
                throw new Error(failureSummary
                    ? `Aucune ligne n'a pu être importée. Échecs: ${failureSummary}`
                    : "Aucune ligne n'a pu être importée.");
            }

            // Cohérence Cache <-> React State
            // 1. Mise à jour massive du cache local (1 écriture)
            bulkUpsertObservationsInCache(successfulOps);

            // 2. Mise à jour de l'état React
            for (const obs of successfulOps) {
                mergedById.set(obs.id, obs);
            }
            const mergedObservations = Array.from(mergedById.values()).sort((a, b) => compareIsoDate(b.date, a.date));
            setObservations(mergedObservations);

            // UI Reset
            setView(View.LIST);
            setError(null);

            pushToast(
                failedCount > 0 ? 'warning' : 'success',
                `Import terminé: ${addedCount} ajoutée(s), ${updatedCount} mise(s) à jour, ${failedCount} échec(s).`,
                failedCount > 0 ? 8000 : 5000
            );

            if (failedCount > 0 && failureSummary) {
                pushToast('error', `⚠️ Échecs : ${failureSummary}`, 10000);
            }

            if (importResult.report.warnings.length > 0) {
                pushToast('warning', `Import avec ${importResult.report.warnings.length} warning(s).`, 7000);
            }
            if (importResult.report.errors.length > 0) {
                pushToast('warning', `${importResult.report.errors.length} erreur(s) de validation détectées.`, 7000);
            }
            if (regeneratedIds > 0) {
                pushToast('info', `${regeneratedIds} ligne(s) ont reçu un nouvel ID (ID source vide ou invalide).`, 7000);
            }

        } catch (e: any) {
            const errorMessage = e instanceof Error ? e.message : String(e);
            setError(`Erreur lors de l'importation : ${errorMessage}`);
            pushToast('error', `Échec de l'import: ${errorMessage}`);
            console.error(e);
            throw e;
        } finally {
            if (importToastId) {
                removeToast(importToastId);
            }
            setIsImporting(false);
        }
    };
    const handleCancel = () => {
        setView(View.LIST);
        setEditingObservation(null);
        window.scrollTo({ top: 0, behavior: 'smooth' });
    };

    const handleRefresh = async () => {
        try {
            setIsLoading(true);
            const loadResult = await getObservations();
            setObservations(loadResult.observations);
            setConnectionStatus(
                isOffline
                    ? 'offline'
                    : loadResult.source === 'cache'
                        ? 'degraded'
                        : 'online'
            );
            pushToast('success', 'Données actualisées.');
        } catch (e) {
            pushToast('error', 'Impossible d\'actualiser les données.');
            console.error(e);
        } finally {
            setIsLoading(false);
        }
    };

    const handleExportStats = async () => {
        if (isExportingStats) return;
        setIsExportingStats(true);
        const toastId = pushToast('info', '⏳ Export Stats en cours (PDF statique + HTML interactif)...', 0);
        try {
            const { exportStatsBundle } = await import('./services/statsExportService');
            const result = await exportStatsBundle({
                observations,
                statsRootElement: statsRootRef.current ?? document.body,
                isDarkMode,
                exportedAt: new Date()
            });
            removeToast(toastId);
            pushToast('success', `Stats exportées: PDF statique + HTML interactif (${result.fileName}).`, 7000);
        } catch (e) {
            removeToast(toastId);
            const message = e instanceof Error ? e.message : String(e);
            pushToast('error', `Échec de l'export Stats: ${message}`, 9000);
        } finally {
            setIsExportingStats(false);
        }
    };

    const handleCreateBackup = async () => {
        if (isCreatingBackup) return;
        setIsCreatingBackup(true);
        const backupToastId = pushToast('info', 'Préparation de la sauvegarde ZIP...', 0);
        try {
            const { createBackup } = await import('./services/backupService');
            const result = await createBackup(observations);
            removeToast(backupToastId);
            pushToast(
                result.failedImages > 0 ? 'warning' : 'success',
                result.failedImages > 0
                    ? `ZIP créé (${result.fileName}) avec ${result.failedImages} image(s) manquante(s).`
                    : `ZIP créé (${result.fileName}).`,
                7000
            );
        } catch (backupError) {
            removeToast(backupToastId);
            const message = backupError instanceof Error ? backupError.message : String(backupError);
            pushToast('error', `Échec de la sauvegarde ZIP: ${message}`, 9000);
            console.error('Backup ZIP error:', backupError);
        } finally {
            setIsCreatingBackup(false);
        }
    };

    const { sortConfig, requestSort, sortedAndFilteredObservations, availableYears } = useObservationFilters(
        observations,
        {
            searchTerm,
            yearFilter,
            taxonomicGroupFilter,
            statusFilter,
            startDateFilter,
            endDateFilter
        }
    );

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

    const statusColorClass = connectionStatus === 'offline'
        ? 'bg-red-500 animate-pulse'
        : connectionStatus === 'degraded'
            ? 'bg-amber-500 animate-pulse'
            : 'bg-green-500';
    const statusBadgeClass = connectionStatus === 'offline'
        ? 'bg-red-100/80 border-red-200 text-red-600'
        : connectionStatus === 'degraded'
            ? 'bg-amber-100/80 border-amber-200 text-amber-700'
            : 'bg-green-100/80 border-green-200 text-green-700';
    const statusLabel = connectionStatus === 'offline'
        ? 'Offline'
        : connectionStatus === 'degraded'
            ? 'Dégradé'
            : 'Online';
    const statusTitle = connectionStatus === 'offline'
        ? 'Application hors-ligne'
        : connectionStatus === 'degraded'
            ? 'Connexion partielle: affichage du cache ou synchronisation incomplète'
            : 'Connecté au serveur';

    const lazyFallback = (
        <div className={`flex items-center justify-center py-12 ${isMobileView ? 'pb-20' : ''}`}>
            <p>Chargement de la vue...</p>
        </div>
    );

    return (
        <div className={`min-h-screen font-sans transition-colors duration-500 bg-gradient-to-br from-nature-beige to-white dark:from-nature-dark-bg dark:to-nature-dark-surface text-nature-dark dark:text-nature-dark-text ${isMobileView ? 'pb-20' : ''}`}>

            {/* Mobile Layout: Glass Header */}
            {isMobileView ? (
                <header className="fixed top-0 left-0 right-0 z-50 px-4 py-2 bg-white/70 dark:bg-nature-dark-surface/70 backdrop-blur-md border-b border-white/20 dark:border-white/5 shadow-sm flex items-center justify-between transition-all duration-300">
                    <UserProfile />
                    <div className="flex items-center gap-1.5">
                        {/* Server Status Mobile */}
                        <div className={`w-2.5 h-2.5 rounded-full ${statusColorClass}`} title={statusTitle}></div>

                        <button
                            onClick={handleRefresh}
                            className="p-1.5 rounded-full bg-white/50 dark:bg-white/10 hover:bg-white/80 dark:hover:bg-white/20 transition-all text-gray-500 dark:text-gray-400"
                            title="Actualiser les données"
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
                        </button>

                        <button
                            onClick={() => setIsDarkMode(!isDarkMode)}
                            className="p-1.5 rounded-full bg-white/50 dark:bg-white/10 hover:bg-white/80 dark:hover:bg-white/20 transition-all text-gray-500 dark:text-gray-400"
                            title={isDarkMode ? 'Mode Clair' : 'Mode Sombre'}
                        >
                            {isDarkMode
                                ? <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" /></svg>
                                : <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" /></svg>
                            }
                        </button>
                    </div>
                </header>
            ) : (
                /* Desktop Layout: Floating Buttons */
                <>
                    <div className="fixed top-6 left-6 z-50">
                        <UserProfile />
                    </div>

                    <div className="fixed top-6 right-6 z-50 flex items-center gap-3">
                        <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full backdrop-blur-md border shadow-sm transition-all ${statusBadgeClass}`} title={statusTitle}>
                            <div className={`w-2 h-2 rounded-full ${statusColorClass}`}></div>
                            <span className="text-xs font-bold hidden md:inline">{statusLabel}</span>
                        </div>

                        <button
                            onClick={handleRefresh}
                            className="p-3 rounded-full bg-white/80 dark:bg-nature-dark-surface/80 backdrop-blur-md shadow-ios hover:shadow-ios-hover transition-all duration-300 transform hover:scale-105 border border-white/20 dark:border-white/10 text-gray-500 dark:text-gray-400"
                            title="Actualiser les données"
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
                        </button>

                        <button
                            onClick={() => setIsDarkMode(!isDarkMode)}
                            className="p-3 rounded-full bg-white/80 dark:bg-nature-dark-surface/80 backdrop-blur-md shadow-ios hover:shadow-ios-hover transition-all duration-300 transform hover:scale-105 border border-white/20 dark:border-white/10 text-gray-500 dark:text-gray-400"
                            title={isDarkMode ? "Mode Clair" : "Mode Sombre"}
                        >
                            {isDarkMode
                                ? <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" /></svg>
                                : <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" /></svg>
                            }
                        </button>
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
                    onClick={handleCreateBackup}
                    disabled={isCreatingBackup}
                    className="fixed bottom-6 left-6 z-50 p-3 rounded-full bg-white/80 dark:bg-nature-dark-surface/80 backdrop-blur-md shadow-ios hover:shadow-ios-hover transition-all duration-300 transform hover:scale-105 border border-white/20 dark:border-white/10 text-nature-dark dark:text-white disabled:opacity-60 disabled:cursor-not-allowed"
                    title="Sauvegarde Complète (ZIP)"
                >
                    {isCreatingBackup
                        ? <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
                        : <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" /></svg>
                    }
                </button>
            )}

            <div
                className={`container mx-auto p-4 md:p-8 max-w-7xl ${isMobileView ? 'px-2' : ''}`}
                style={isMobileView ? { paddingTop: '6rem' } : undefined}
            >
                {/* Navigation Tabs - Desktop Only */}
                {!isMobileView && view !== View.FORM && (
                    <div className="flex justify-center mb-10 sticky top-4 z-40">
                        <div className="bg-white/70 dark:bg-nature-dark-surface/70 backdrop-blur-xl rounded-full p-1.5 shadow-ios border border-white/20 dark:border-white/5 flex gap-1 overflow-x-auto max-w-full">
                            {[
                                {
                                    id: View.LIST, label: 'Liste',
                                    icon: <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 10h16M4 14h16M4 18h16" /></svg>
                                },
                                {
                                    id: View.MAP, label: 'Carte',
                                    icon: <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" /></svg>
                                },
                                {
                                    id: View.STATS, label: 'Stats',
                                    icon: <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg>
                                },
                                {
                                    id: View.CALENDAR, label: 'Calendrier',
                                    icon: <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                                },
                                {
                                    id: View.GALLERY, label: 'Galerie',
                                    icon: <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                                },
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
                                    {tab.icon}
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

                <Suspense fallback={lazyFallback}>
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
                            isBulkDeleting={isBulkDeleting}
                            isImporting={isImporting}
                        />
                    ) : view === View.MAP ? (
                        <div className={`space-y-6 ${isMobileView ? 'pb-20' : ''}`}>
                            <FilterBar
                                searchTerm={searchTerm}
                                onSearchChange={setSearchTerm}
                                yearFilter={yearFilter}
                                onYearChange={setYearFilter}
                                statusFilter={statusFilter}
                                onStatusChange={setStatusFilter}
                                availableYears={availableYears}
                                isMobileView={isMobileView}
                                searchId="search-input-map"
                            />

                            <ObservationMap
                                observations={sortedAndFilteredObservations}
                                isDarkMode={isDarkMode}
                                isMobileView={isMobileView}
                                onToast={pushToast}
                                onEdit={handleEditObservation}
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
                        <ObservationStats
                            observations={observations}
                            isMobileView={isMobileView}
                            onExportStats={handleExportStats}
                            isExportingStats={isExportingStats}
                            statsRootRef={statsRootRef}
                        />
                    ) : view === View.CALENDAR ? (
                        <ObservationCalendar
                            observations={observations}
                            onEdit={handleEditObservation}
                            onDelete={handleDeleteRequest}
                            isMobileView={isMobileView}
                        />
                    ) : view === View.GALLERY ? (
                        <div className={`space-y-6 ${isMobileView ? 'pb-20' : ''}`}>
                            {/* Filters for Gallery view */}
                            <FilterBar
                                searchTerm={searchTerm}
                                onSearchChange={setSearchTerm}
                                yearFilter={yearFilter}
                                onYearChange={setYearFilter}
                                statusFilter={statusFilter}
                                onStatusChange={setStatusFilter}
                                availableYears={availableYears}
                                isMobileView={isMobileView}
                                searchId="search-input-gallery"
                            />
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
                </Suspense>
            </div>
        </div>
    );
};

export default App;
