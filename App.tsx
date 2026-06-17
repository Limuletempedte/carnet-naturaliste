import React, { Suspense, lazy, startTransition, useState, useEffect, useRef, useCallback } from 'react';
import { useAccessibleDialog } from './hooks/useAccessibleDialog';
import { Observation, View } from './types';
import { getObservations, saveObservation, updateObservation, deleteObservation, processOfflineQueue, getOfflineQueueSnapshot, setObservationWikipediaImage } from './services/storageService';
import ObservationList from './components/ObservationList';
import ConfirmationDialog from './components/ConfirmationDialog';
import BottomNavigation from './components/BottomNavigation';
import { fetchSpeciesInfo } from './services/speciesService';
import FilterBar from './components/FilterBar';
import ToastContainer, { ToastItem, ToastType } from './components/ToastContainer';
import { generateUUID } from './utils/uuidUtils';
import { useObservationFilters } from './hooks/useObservationFilters';
import { useFilterControls } from './hooks/useFilterControls';
import { useSyncQueue } from './hooks/useSyncQueue';
import { useBulkDelete } from './hooks/useBulkDelete';
import { useImportObservations } from './hooks/useImportObservations';
import { selectStartupEnrichmentCandidates } from './services/startupEnrichmentUtils';
import SyncCenterDialog from './components/SyncCenterDialog';
import AdvancedFilterDialog from './components/AdvancedFilterDialog';
import StatsExportDialog, { StatsExportDialogState } from './components/StatsExportDialog';
import ErrorBoundary from './components/ErrorBoundary';
import StorageConsentBanner from './components/StorageConsentBanner';
import { logger } from './utils/logger';
import { mapUserFacingError } from './utils/userFacingError';
import { CHUNK_LOAD_USER_MESSAGE, isChunkLoadError } from './utils/chunkLoadError';
import { safeGet, safeSet } from './utils/safeStorage';
import { useOfflineQueue } from './hooks/useOfflineQueue';
import { useStorageQuotaToasts } from './hooks/useStorageQuotaToasts';
import { useBadgeUnlockToasts } from './hooks/useBadgeUnlockToasts';

type AppConnectionStatus = 'online' | 'offline' | 'degraded';

import Login from './components/Auth/Login';
import ResetPassword from './components/Auth/ResetPassword';
import UserProfile from './components/Auth/UserProfile';
import { useAuth } from './contexts/AuthContext';
import { supabaseConfigError } from './supabaseClient';

const ObservationForm = lazy(() => import('./components/ObservationForm'));
const ObservationMap = lazy(() => import('./components/ObservationMap'));
const ObservationStats = lazy(() => import('./components/ObservationStats'));
const ObservationGallery = lazy(() => import('./components/ObservationGallery'));
const ObservationCalendar = lazy(() => import('./components/ObservationCalendar'));
const LegalPages = lazy(() => import('./components/LegalPages').then(m => ({ default: m.PrivacyPolicy })));
const LegalTerms = lazy(() => import('./components/LegalPages').then(m => ({ default: m.TermsOfService })));
const LegalNotices = lazy(() => import('./components/LegalPages').then(m => ({ default: m.MentionsLegales })));
const HelpPage = lazy(() => import('./components/HelpPage'));
const OnboardingTour = lazy(() => import('./components/OnboardingTour'));

const createDefaultStatsExportDialogState = (): StatsExportDialogState => ({
    startDate: '',
    endDate: '',
    includeVisualAssets: true
});

const ENRICHMENT_BATCH_LIMIT = 10;
const ENRICHMENT_CONCURRENCY = 3;

const App: React.FC = () => {
    const { user, loading: authLoading, isOffline, passwordRecovery } = useAuth();
    // Identité stable de l'utilisateur (cf. H6) : l'objet `user` change de
    // référence à chaque rafraîchissement de token, pas son id.
    const userId = user?.id;
    const hasLoadedOnceRef = useRef(false);
    const { offlineQueueItems, refreshOfflineQueueSnapshot } = useOfflineQueue(user);
    const [observations, setObservations] = useState<Observation[]>([]);
    const [view, setView] = useState<View>(View.LIST);
    const [editingObservation, setEditingObservation] = useState<Observation | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    // SR-12 : bandeau d'erreurs critiques persistant (pas d'auto-dismiss)
    const [criticalError, setCriticalError] = useState<string | null>(null);
    // VP-18 : affichage du tour guidé (piloté par localStorage onboarding-seen-v1)
    const [showOnboarding, setShowOnboarding] = useState(false);
    const [confirmation, setConfirmation] = useState<{ title: string; message: string; onConfirm: () => void; } | null>(null);
    const [toasts, setToasts] = useState<ToastItem[]>([]);
    const [connectionStatus, setConnectionStatus] = useState<AppConnectionStatus>(isOffline ? 'offline' : 'online');
    const [isCreatingBackup, setIsCreatingBackup] = useState(false);
    const [isDeleteAccountOpen, setIsDeleteAccountOpen] = useState(false);
    const [deleteConfirmText, setDeleteConfirmText] = useState('');
    const [isDeletingAccount, setIsDeletingAccount] = useState(false);
    const [isExportingStats, setIsExportingStats] = useState(false);
    const [isStatsExportDialogOpen, setIsStatsExportDialogOpen] = useState(false);
    const [statsExportDialogState, setStatsExportDialogState] = useState<StatsExportDialogState>(() => createDefaultStatsExportDialogState());
    const statsRootRef = useRef<HTMLDivElement | null>(null);
    const [isSyncCenterOpen, setIsSyncCenterOpen] = useState(false);
    const [isAdvancedFilterOpen, setIsAdvancedFilterOpen] = useState(false);

    const [isDarkMode, setIsDarkMode] = useState(() => safeGet('darkMode') === 'true');
    const closeDeleteAccountDialog = useCallback(() => { setIsDeleteAccountOpen(false); setDeleteConfirmText(''); }, []);
    const { dialogRef: deleteAccountDialogRef, dialogProps: deleteAccountDialogProps } = useAccessibleDialog({ isOpen: isDeleteAccountOpen, onClose: closeDeleteAccountDialog, titleId: 'delete-account-dialog-title' });

    useEffect(() => {
        try { safeSet('darkMode', String(isDarkMode)); } catch { /* non-critical */ }
    }, [isDarkMode]);

    const removeToast = useCallback((id: string) => {
        setToasts(prev => prev.filter(t => t.id !== id));
    }, []);

    // Bascule de vue via navigation (barre du bas mobile ou onglets desktop) :
    // marque la mise à jour comme "transition" React pour que la bascule entre
    // vues lazy reste fluide (pas de flash du fallback Suspense quand possible,
    // React garde l'ancienne vue visible jusqu'à ce que la nouvelle soit prête).
    // NE PAS utiliser pour les changements de vue programmatiques post-action
    // (ex. retour à la liste après sauvegarde) : ceux-là doivent être immédiats.
    const handleViewChange = useCallback((nextView: View) => {
        startTransition(() => {
            setView(nextView);
        });
    }, []);

    const pushToast = useCallback((type: ToastType, message: string, durationMs = 4500) => {
        const id = generateUUID();
        setToasts(prev => [...prev, { id, type, message }]);
        if (durationMs > 0) {
            window.setTimeout(() => {
                setToasts(prev => prev.filter(t => t.id !== id));
            }, durationMs);
        }
        return id;
    }, []);

    // Filtres + presets extraits dans un hook dédié (les setters gardent les
    // noms de useState pour être branchés tels quels dans le JSX).
    const {
        searchTerm, setSearchTerm,
        yearFilter, setYearFilter,
        taxonomicGroupFilter, setTaxonomicGroupFilter,
        statusFilter, setStatusFilter,
        startDateFilter, setStartDateFilter,
        endDateFilter, setEndDateFilter,
        advancedFilterState, setAdvancedFilterState,
        filterPresets,
        filters,
        additionalSorts,
        resetAdvancedFilters,
        saveFilterPreset,
        applyFilterPreset,
        deleteFilterPreset,
    } = useFilterControls({ onToast: pushToast });

    // Synchronisation manuelle de la file hors-ligne (centre de synchro) extraite
    // dans un hook dédié. La logique de stockage reste dans storageService.
    const {
        lastSyncResult,
        isSyncingQueue,
        syncProgress,
        resyncAll,
        retryQueueItem,
    } = useSyncQueue({
        refreshOfflineQueueSnapshot,
        setObservations,
        setConnectionStatus,
        onToast: pushToast,
    });

    // Import (Excel/JSON) et suppression en masse extraits en hooks dédiés.
    const { isImporting, handleImportRequest } = useImportObservations({
        observations,
        setObservations,
        setView,
        setError,
        onToast: pushToast,
        removeToast,
        refreshOfflineQueueSnapshot,
    });
    const { isBulkDeleting, handleBulkDeleteRequest } = useBulkDelete({
        observations,
        setObservations,
        setConfirmation,
        setError,
        onToast: pushToast,
        removeToast,
        refreshOfflineQueueSnapshot,
    });

    useEffect(() => {
        if (isDarkMode) {
            document.documentElement.classList.add('dark');
        } else {
            document.documentElement.classList.remove('dark');
        }
    }, [isDarkMode]);

    useStorageQuotaToasts(pushToast);
    useBadgeUnlockToasts(observations, pushToast);

    // VP-18 — afficher le tour guidé au 1er run pour un utilisateur connecté sans observation
    useEffect(() => {
        if (!user) return;
        if (isLoading) return;
        try {
            const seen = localStorage.getItem('onboarding-seen-v1') === 'true';
            if (!seen && observations.length === 0) setShowOnboarding(true);
        } catch {
            // accès localStorage bloqué : on n'affiche simplement pas le tour
        }
    }, [user, isLoading, observations.length]);

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
        // supabaseConfigError is a module-level constant (never changes at runtime),
        // so it does not need to be in the dependency array.
        // Audit v2 (H6) : on dépend de `userId` (identité stable) et NON de l'objet
        // `user`, recréé à chaque TOKEN_REFRESHED (~1×/h) — sinon l'app se
        // rechargeait entièrement toutes les heures, effaçant la saisie en cours.
        if (authLoading || !userId || supabaseConfigError) {
            return;
        }

        let mounted = true;

        const loadData = async () => {
            // N'afficher l'écran plein « Chargement… » qu'au tout premier chargement.
            // Sur un re-run (bascule online/offline), garder l'UI montée pour ne pas
            // perdre l'état (formulaire, position de défilement).
            if (!hasLoadedOnceRef.current) setIsLoading(true);
            try {
                // Try to sync if online (PE-15: skip if queue empty to avoid unnecessary auth call)
                const pendingQueue = getOfflineQueueSnapshot();
                if (navigator.onLine && pendingQueue.length > 0) {
                    const syncResult = await processOfflineQueue();
                    if (syncResult.failed > 0) {
                        setConnectionStatus('degraded');
                        const remainingQueue = getOfflineQueueSnapshot();
                        const remaining = remainingQueue.length;
                        pushToast(
                            'warning',
                            `Sync partielle : ${syncResult.failed}/${syncResult.processed} échec(s).${remaining > 0 ? ` ${remaining} action(s) encore en file.` : ''}${syncResult.failureReasons.length > 0 ? ` Raison : ${syncResult.failureReasons.slice(0, 2).join(' ; ')}` : ''}`,
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
                hasLoadedOnceRef.current = true;
                refreshOfflineQueueSnapshot();

                // Auto-fetch missing images for existing observations
                if (!navigator.onLine) return;
                const startupSelection = selectStartupEnrichmentCandidates(loadResult.observations, ENRICHMENT_BATCH_LIMIT);
                const skippedForAmbiguity = startupSelection.skippedDueToMissingLatin;

                if (skippedForAmbiguity > 0) {
                    logger.info(`[startup-enrichment] ${skippedForAmbiguity} observation(s) ignorée(s) (nom latin absent, source ambiguë).`);
                }

                const obsWithMissingImages = startupSelection.candidates;

                if (obsWithMissingImages.length > 0) {
                    let nextIndex = 0;

                    const worker = async () => {
                        while (nextIndex < obsWithMissingImages.length && mounted) {
                            const currentIndex = nextIndex;
                            nextIndex += 1;
                            const obs = obsWithMissingImages[currentIndex];

                            try {
                                const info = await fetchSpeciesInfo(obs.latinName.trim());
                                if (!mounted || !info?.imageUrl) continue;
                                const wikipediaImage = info.imageUrl;

                                // H9 : ne persister QUE le champ image (pas la ligne entière)
                                // pour ne pas écraser une édition concurrente de l'utilisateur.
                                await setObservationWikipediaImage(obs.id, wikipediaImage);
                                if (!mounted) continue;

                                // Mise à jour fonctionnelle ciblée : ne touche que cette
                                // observation et seulement si elle n'a pas reçu d'image
                                // entre-temps — préserve ajouts / suppressions / éditions
                                // faits par l'utilisateur pendant l'enrichissement.
                                setObservations(prev => prev.map(o =>
                                    o.id === obs.id && !o.wikipediaImage ? { ...o, wikipediaImage } : o
                                ));
                            } catch (err) {
                                logger.error(`Failed to fetch info for ${obs.latinName}`, err);
                            }
                            await new Promise(resolve => setTimeout(resolve, 200));
                        }
                    };

                    await Promise.all(
                        Array.from({ length: Math.min(ENRICHMENT_CONCURRENCY, obsWithMissingImages.length) }, () => worker())
                    );
                }
            } catch (e: unknown) {
                if (!mounted) return;
                setConnectionStatus(navigator.onLine ? 'degraded' : 'offline');
                setError(mapUserFacingError(e));
                logger.error(e);
                setIsLoading(false);
                hasLoadedOnceRef.current = true;
                refreshOfflineQueueSnapshot();
            }
        };
        loadData();

        return () => { mounted = false; };
    }, [authLoading, isOffline, refreshOfflineQueueSnapshot, userId, pushToast]);

    const handleAddObservation = useCallback(() => {
        setEditingObservation(null);
        setView(View.FORM);
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }, []);

    const handleEditObservation = useCallback((id: string) => {
        const observationToEdit = observations.find(obs => obs.id === id);
        if (observationToEdit) {
            setEditingObservation(observationToEdit);
            setView(View.FORM);
            window.scrollTo({ top: 0, behavior: 'smooth' });
        }
    }, [observations]);

    const handleDeleteRequest = useCallback((id: string) => {
        if (isImporting) return;
        const obs = observations.find(o => o.id === id);
        const obsLabel = obs ? `${obs.speciesName} du ${obs.date}` : 'cette observation';
        setConfirmation({
            title: "Confirmer la suppression",
            message: `Supprimer l'observation de ${obsLabel} ? Cette action est irréversible.`,
            onConfirm: async () => {
                try {
                    await deleteObservation(id);
                    setObservations(prev => prev.filter(obs => obs.id !== id));
                    refreshOfflineQueueSnapshot();
                } catch (e) {
                    setError("Erreur lors de la suppression de l'observation.");
                    logger.error(e);
                } finally {
                    setConfirmation(null);
                }
            }
        });
    }, [observations, isImporting, refreshOfflineQueueSnapshot]);

    const handleSaveObservation = async (observation: Observation) => {
        if (isImporting) throw new Error('Un import est en cours. Veuillez patienter.');
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
            refreshOfflineQueueSnapshot();
            setView(View.LIST);
            setEditingObservation(null);
            window.scrollTo({ top: 0, behavior: 'smooth' });
        } catch (e) {
            setError(`Échec de l'enregistrement de l'observation. ${mapUserFacingError(e)}`);
            logger.error(e);
            throw e;
        }
    };

    const handleCancel = useCallback(() => {
        setView(View.LIST);
        setEditingObservation(null);
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }, []);

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
            refreshOfflineQueueSnapshot();
        } catch (e) {
            pushToast('error', 'Impossible d\'actualiser les données.');
            logger.error(e);
        } finally {
            setIsLoading(false);
        }
    };

    const handleOpenSyncCenter = () => {
        refreshOfflineQueueSnapshot();
        setIsSyncCenterOpen(true);
    };


    const handleExportStats = async () => {
        setIsStatsExportDialogOpen(true);
    };

    const handleConfirmStatsExport = async () => {
        if (isExportingStats) return;
        setIsExportingStats(true);
        const toastId = pushToast('info', '⏳ Export Stats en cours...', 0);
        try {
            const { exportStatsBundle } = await import('./services/statsExportService');
            const result = await exportStatsBundle({
                observations,
                statsRootElement: statsRootRef.current ?? document.body,
                isDarkMode,
                exportedAt: new Date(),
                includeVisualAssets: statsExportDialogState.includeVisualAssets,
                dateRange: {
                    startDate: statsExportDialogState.startDate || undefined,
                    endDate: statsExportDialogState.endDate || undefined
                }
            });
            removeToast(toastId);
            pushToast('success', `Stats exportées (${result.fileName}) • ${result.exportedCount} observation(s).`, 7000);
            setIsStatsExportDialogOpen(false);
            setStatsExportDialogState(createDefaultStatsExportDialogState());
        } catch (e) {
            removeToast(toastId);
            const message = isChunkLoadError(e) ? CHUNK_LOAD_USER_MESSAGE : (e instanceof Error ? e.message : String(e));
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
            const { createBackup, estimateBackupSize, BACKUP_WARN_SIZE_BYTES } = await import('./services/backupService');
            // SR-04 : au-delà du seuil, proposer d'exclure les images.
            const estimated = estimateBackupSize(observations);
            let includeImages = true;
            if (estimated > BACKUP_WARN_SIZE_BYTES) {
                const mb = Math.round(estimated / (1024 * 1024));
                includeImages = window.confirm(
                    `La sauvegarde risque d'être volumineuse (~${mb} Mo). Cliquez sur OK pour l'inclure tout de même, ou sur Annuler pour la créer sans les images.`,
                );
            }
            const result = await createBackup(observations, { includeImages });
            removeToast(backupToastId);
            pushToast(
                result.failedImages > 0 ? 'warning' : 'success',
                result.skippedImages
                    ? `ZIP créé sans les images (${result.fileName}).`
                    : result.failedImages > 0
                        ? `ZIP créé (${result.fileName}) avec ${result.failedImages} image(s) manquante(s).`
                        : `ZIP créé (${result.fileName}).`,
                7000
            );
        } catch (backupError) {
            removeToast(backupToastId);
            const message = isChunkLoadError(backupError) ? CHUNK_LOAD_USER_MESSAGE : (backupError instanceof Error ? backupError.message : String(backupError));
            pushToast('error', `Échec de la sauvegarde ZIP: ${message}`, 9000);
            logger.error('Backup ZIP error:', backupError);
        } finally {
            setIsCreatingBackup(false);
        }
    };

    const handleExportUserData = async () => {
        pushToast('info', 'Export de vos données (RGPD)...', 0);
        try {
            const { createBackup } = await import('./services/backupService');
            const result = await createBackup(observations);
            pushToast('success', `Export RGPD terminé : ${result.fileName}`, 7000);
        } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            pushToast('error', `Échec de l'export : ${message}`, 9000);
        }
    };

    const handleDeleteAccount = async () => {
        if (isDeletingAccount) return;
        setIsDeletingAccount(true);
        try {
            const { deleteAccount } = await import('./services/accountService');
            await deleteAccount();
            pushToast('success', 'Compte supprimé avec succès.', 5000);
        } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            pushToast('error', `Échec de la suppression : ${message}`, 9000);
        } finally {
            setIsDeletingAccount(false);
            setIsDeleteAccountOpen(false);
            setDeleteConfirmText('');
        }
    };

    const { sortConfig, requestSort, sortedAndFilteredObservations, availableYears } = useObservationFilters(
        observations,
        filters,
        additionalSorts
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
        return <div role="status" className="flex items-center justify-center h-screen"><p>Chargement de la session...</p></div>;
    }

    // H13 : retour du lien « mot de passe oublié » — priorité sur tout le reste,
    // même si une session de récupération a été créée (user non nul).
    if (passwordRecovery) {
        return <ResetPassword />;
    }

    if (!user) {
        // If offline and no cached user, show offline message instead of broken Login form
        if (isOffline) {
            return (
                <div className="flex flex-col items-center justify-center min-h-screen bg-gradient-to-br from-nature-beige to-white dark:from-nature-dark-bg dark:to-nature-dark-surface p-4">
                    <div className="w-full max-w-md bg-white/80 dark:bg-nature-dark-surface/80 backdrop-blur-xl rounded-2xl shadow-ios p-8 border border-white/20 text-center">
                        <h1 className="text-3xl font-bold mb-2 text-nature-dark dark:text-white">Carnet Naturaliste</h1>
                        <div className="text-6xl mb-4" aria-hidden="true">📡</div>
                        <p className="text-gray-600 dark:text-gray-400 mb-4">Vous êtes hors-ligne. Connectez-vous à Internet pour vous identifier.</p>
                        <p className="text-sm text-gray-400 dark:text-gray-500">Une fois connecté, vos données seront disponibles hors-ligne.</p>
                    </div>
                </div>
            );
        }
        return <Login />;
    }

    if (isLoading) {
        return <div role="status" className="flex items-center justify-center h-screen"><p>Chargement des données...</p></div>;
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

    // Fallback Suspense léger : avec startTransition sur handleViewChange, React 19
    // garde l'ancienne vue visible tant que la nouvelle n'est pas prête. Ce fallback
    // n'apparaît qu'au tout premier chargement d'un bundle lazy (chunk pas encore en cache).
    const lazyFallback = (
        <div className={`flex items-center justify-center py-12 ${isMobileView ? 'pb-20' : ''}`} role="status" aria-live="polite">
            <svg className="w-5 h-5 animate-spin text-nature-green mr-2" fill="none" viewBox="0 0 24 24" aria-hidden="true">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
            <p className="text-sm text-gray-500 dark:text-gray-400">Chargement de la vue…</p>
        </div>
    );

    return (
        <div className={`min-h-screen font-sans transition-colors duration-500 bg-gradient-to-br from-nature-beige to-white dark:from-nature-dark-bg dark:to-nature-dark-surface text-nature-dark dark:text-nature-dark-text ${isMobileView ? 'pb-20' : ''}`}>

            {/* Mobile Layout: Glass Header */}
            {isMobileView ? (
                <header className="fixed top-0 left-0 right-0 z-50 px-4 py-2 bg-white/70 dark:bg-nature-dark-surface/70 backdrop-blur-md border-b border-white/20 dark:border-white/5 shadow-sm flex items-center justify-between transition-all duration-300">
                    <UserProfile onExportData={handleExportUserData} onDeleteAccount={() => setIsDeleteAccountOpen(true)} />
                    <div className="flex items-center gap-1.5">
                        {/* Server Status Mobile — pastille + libellé accessible (UIA-05) */}
                        <span role="status" className="flex items-center" title={statusTitle}>
                            <span aria-hidden="true" className={`w-2.5 h-2.5 rounded-full ${statusColorClass}`}></span>
                            <span className="sr-only">{statusTitle}</span>
                        </span>

                        <button
                            onClick={handleOpenSyncCenter}
                            className="relative p-1.5 min-w-[44px] min-h-[44px] flex items-center justify-center rounded-full bg-white/50 dark:bg-white/10 hover:bg-white/80 dark:hover:bg-white/20 transition-all text-gray-500 dark:text-gray-400"
                            title="Centre de synchronisation"
                            aria-label="Centre de synchronisation"
                        >
                            <svg aria-hidden="true" xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M3 15a4 4 0 004 4h9a5 5 0 10-.1-9.999 5.002 5.002 0 10-9.78 2.096A4.001 4.001 0 003 15z" /><path strokeLinecap="round" strokeLinejoin="round" d="M12 12v6m0-6l-2 2m2-2l2 2" /></svg>
                            {offlineQueueItems.length > 0 && (
                                <span className="absolute -top-1 -right-1 min-w-[16px] h-4 px-1 rounded-full bg-red-500 text-white text-[10px] font-bold leading-4 text-center">
                                    {offlineQueueItems.length}
                                </span>
                            )}
                        </button>

                        <button
                            onClick={() => setIsAdvancedFilterOpen(true)}
                            className="p-1.5 min-w-[44px] min-h-[44px] flex items-center justify-center rounded-full bg-white/50 dark:bg-white/10 hover:bg-white/80 dark:hover:bg-white/20 transition-all text-gray-500 dark:text-gray-400"
                            title="Filtres avancés"
                            aria-label="Filtres avancés"
                        >
                            <svg aria-hidden="true" xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M3 4h18M6 12h12M10 20h4" /></svg>
                        </button>

                        <button
                            onClick={handleRefresh}
                            className="p-1.5 min-w-[44px] min-h-[44px] flex items-center justify-center rounded-full bg-white/50 dark:bg-white/10 hover:bg-white/80 dark:hover:bg-white/20 transition-all text-gray-500 dark:text-gray-400"
                            title="Actualiser les données"
                            aria-label="Actualiser les données"
                        >
                            <svg aria-hidden="true" xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
                        </button>

                        <button
                            onClick={() => setIsDarkMode(!isDarkMode)}
                            className="p-1.5 min-w-[44px] min-h-[44px] flex items-center justify-center rounded-full bg-white/50 dark:bg-white/10 hover:bg-white/80 dark:hover:bg-white/20 transition-all text-gray-500 dark:text-gray-400"
                            title={isDarkMode ? 'Mode Clair' : 'Mode Sombre'}
                            aria-label={isDarkMode ? 'Activer le mode clair' : 'Activer le mode sombre'}
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
                        <UserProfile onExportData={handleExportUserData} onDeleteAccount={() => setIsDeleteAccountOpen(true)} />
                    </div>

                    <div className="fixed top-6 right-6 z-50 flex items-center gap-3">
                        <div role="status" className={`flex items-center gap-2 px-3 py-1.5 rounded-full backdrop-blur-md border shadow-sm transition-all ${statusBadgeClass}`} title={statusTitle}>
                            <div aria-hidden="true" className={`w-2 h-2 rounded-full ${statusColorClass}`}></div>
                            <span className="text-xs font-bold hidden md:inline">{statusLabel}</span>
                            <span className="sr-only">{statusTitle}</span>
                        </div>

                        <button
                            onClick={handleOpenSyncCenter}
                            className="relative p-3 rounded-full bg-white/80 dark:bg-nature-dark-surface/80 backdrop-blur-md shadow-ios hover:shadow-ios-hover transition-all duration-300 transform hover:scale-105 border border-white/20 dark:border-white/10 text-gray-500 dark:text-gray-400"
                            title="Centre de synchronisation"
                            aria-label="Centre de synchronisation"
                        >
                            <svg aria-hidden="true" xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M3 15a4 4 0 004 4h9a5 5 0 10-.1-9.999 5.002 5.002 0 10-9.78 2.096A4.001 4.001 0 003 15z" /><path strokeLinecap="round" strokeLinejoin="round" d="M12 12v6m0-6l-2 2m2-2l2 2" /></svg>
                            {offlineQueueItems.length > 0 && (
                                <span className="absolute -top-1 -right-1 min-w-[18px] h-5 px-1 rounded-full bg-red-500 text-white text-[11px] font-bold leading-5 text-center">
                                    {offlineQueueItems.length}
                                </span>
                            )}
                        </button>

                        <button
                            onClick={() => setIsAdvancedFilterOpen(true)}
                            className="p-3 rounded-full bg-white/80 dark:bg-nature-dark-surface/80 backdrop-blur-md shadow-ios hover:shadow-ios-hover transition-all duration-300 transform hover:scale-105 border border-white/20 dark:border-white/10 text-gray-500 dark:text-gray-400"
                            title="Filtres avancés"
                            aria-label="Filtres avancés"
                        >
                            <svg aria-hidden="true" xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M3 4h18M6 12h12M10 20h4" /></svg>
                        </button>

                        <button
                            onClick={handleRefresh}
                            className="p-3 rounded-full bg-white/80 dark:bg-nature-dark-surface/80 backdrop-blur-md shadow-ios hover:shadow-ios-hover transition-all duration-300 transform hover:scale-105 border border-white/20 dark:border-white/10 text-gray-500 dark:text-gray-400"
                            title="Actualiser les données"
                            aria-label="Actualiser les données"
                        >
                            <svg aria-hidden="true" xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
                        </button>

                        <button
                            onClick={() => setIsDarkMode(!isDarkMode)}
                            className="p-3 rounded-full bg-white/80 dark:bg-nature-dark-surface/80 backdrop-blur-md shadow-ios hover:shadow-ios-hover transition-all duration-300 transform hover:scale-105 border border-white/20 dark:border-white/10 text-gray-500 dark:text-gray-400"
                            title={isDarkMode ? "Mode Clair" : "Mode Sombre"}
                            aria-label={isDarkMode ? 'Activer le mode clair' : 'Activer le mode sombre'}
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
            {isDeleteAccountOpen && (
                <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex justify-center items-center p-4">
                    <div ref={deleteAccountDialogRef} {...deleteAccountDialogProps} className="bg-white/80 dark:bg-nature-dark-surface/90 backdrop-blur-md rounded-xl shadow-2xl p-8 w-full max-w-md">
                        <h3 id="delete-account-dialog-title" className="text-2xl font-serif font-bold text-red-600">Supprimer mon compte</h3>
                        <p className="mt-4 text-gray-700 dark:text-gray-300">
                            Cette action est <strong>irréversible</strong>. Toutes vos observations, photos et données seront définitivement supprimées.
                        </p>
                        <p className="mt-3 text-sm text-gray-500 dark:text-gray-400">
                            Tapez <strong className="text-red-600">SUPPRIMER</strong> pour confirmer :
                        </p>
                        <input
                            type="text"
                            value={deleteConfirmText}
                            onChange={(e) => setDeleteConfirmText(e.target.value)}
                            className="mt-2 w-full px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-nature-dark-bg dark:text-white focus:ring-2 focus:ring-red-500 focus:border-transparent"
                            placeholder="SUPPRIMER"
                        />
                        <div className="mt-6 flex justify-end space-x-4">
                            <button
                                onClick={closeDeleteAccountDialog}
                                className="px-6 py-2 rounded-md shadow-sm font-semibold text-gray-800 bg-gray-400 hover:bg-gray-500 transition-all"
                            >
                                Annuler
                            </button>
                            <button
                                onClick={handleDeleteAccount}
                                disabled={deleteConfirmText !== 'SUPPRIMER' || isDeletingAccount}
                                className="px-6 py-2 rounded-md shadow-sm font-semibold text-white bg-red-600 hover:bg-red-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                {isDeletingAccount ? 'Suppression...' : 'Supprimer définitivement'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
            {error && (
                <div role="alert" className={`fixed left-1/2 transform -translate-x-1/2 z-50 bg-red-100/90 backdrop-blur-md border border-red-200 text-red-700 px-6 py-4 rounded-2xl shadow-ios flex items-center gap-3 animate-fadeIn w-[90%] md:w-auto ${isMobileView ? 'top-24' : 'top-20'}`}>
                    <strong className="font-bold">Erreur:</strong>
                    <span className="block sm:inline"> {error}</span>
                    <button onClick={() => setError(null)} className="ml-4 text-red-500 hover:text-red-700">
                        <svg className="fill-current h-6 w-6" role="button" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20"><title>Close</title><path d="M14.348 14.849a1.2 1.2 0 0 1-1.697 0L10 11.819l-2.651 3.029a1.2 1.2 0 1 1-1.697-1.697l2.758-3.15-2.759-3.152a1.2 1.2 0 1 1 1.697-1.697L10 8.183l2.651-3.031a1.2 1.2 0 1 1 1.697 1.697l-2.758 3.152 2.758 3.15a1.2 1.2 0 0 1 0 1.698z" /></svg>
                    </button>
                </div>
            )}
            {criticalError && (
                <div role="alert" aria-live="assertive" className="fixed top-0 left-0 right-0 z-[60] bg-red-700 text-white px-6 py-3 shadow-lg flex items-start gap-3">
                    <svg className="h-5 w-5 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" /></svg>
                    <div className="flex-1 min-w-0">
                        <strong className="font-bold">Erreur critique :</strong> <span className="block sm:inline">{criticalError}</span>
                    </div>
                    <button onClick={() => setCriticalError(null)} className="ml-4 text-white hover:text-red-100 flex-shrink-0" aria-label="Fermer le bandeau d'erreur critique">
                        <svg className="fill-current h-5 w-5" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20"><title>Close</title><path d="M14.348 14.849a1.2 1.2 0 0 1-1.697 0L10 11.819l-2.651 3.029a1.2 1.2 0 1 1-1.697-1.697l2.758-3.15-2.759-3.152a1.2 1.2 0 1 1 1.697-1.697L10 8.183l2.651-3.031a1.2 1.2 0 1 1 1.697 1.697l-2.758 3.152 2.758 3.15a1.2 1.2 0 0 1 0 1.698z" /></svg>
                    </button>
                </div>
            )}
            <ToastContainer toasts={toasts} onDismiss={removeToast} />
            <SyncCenterDialog
                isOpen={isSyncCenterOpen}
                queueItems={offlineQueueItems}
                lastResult={lastSyncResult}
                isSyncing={isSyncingQueue}
                syncProgress={syncProgress}
                onClose={() => setIsSyncCenterOpen(false)}
                onResyncAll={() => void resyncAll()}
                onRetryItem={(itemId) => void retryQueueItem(itemId)}
            />
            <AdvancedFilterDialog
                isOpen={isAdvancedFilterOpen}
                state={advancedFilterState}
                presets={filterPresets}
                onClose={() => setIsAdvancedFilterOpen(false)}
                onStateChange={setAdvancedFilterState}
                onReset={resetAdvancedFilters}
                onSavePreset={saveFilterPreset}
                onApplyPreset={applyFilterPreset}
                onDeletePreset={deleteFilterPreset}
            />
            <StatsExportDialog
                isOpen={isStatsExportDialogOpen}
                isExporting={isExportingStats}
                state={statsExportDialogState}
                onStateChange={setStatsExportDialogState}
                onClose={() => setIsStatsExportDialogOpen(false)}
                onConfirm={() => void handleConfirmStatsExport()}
            />

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

            <div aria-live="polite" className="sr-only" role="status">
                {view === View.LIST ? 'Vue liste active' : view === View.MAP ? 'Vue carte active' : view === View.STATS ? 'Vue statistiques active' : view === View.CALENDAR ? 'Vue calendrier active' : view === View.GALLERY ? 'Vue galerie active' : view === View.FORM ? 'Formulaire actif' : ''}
            </div>
            <main
                id="main-content"
                className={`container mx-auto p-4 md:p-8 max-w-7xl ${isMobileView ? 'px-2' : ''}`}
                style={isMobileView ? { paddingTop: '6rem' } : undefined}
            >
                {/* Navigation Tabs - Desktop Only */}
                {!isMobileView && view !== View.FORM && (
                    <nav aria-label="Navigation principale" className="flex justify-center mb-10 sticky top-4 z-40">
                        <div role="tablist" aria-label="Vues" className="bg-white/70 dark:bg-nature-dark-surface/70 backdrop-blur-xl rounded-full p-1.5 shadow-ios border border-white/20 dark:border-white/5 flex gap-1 overflow-x-auto max-w-full">
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
                                    role="tab"
                                    aria-selected={view === tab.id}
                                    onClick={() => handleViewChange(tab.id)}
                                    className={`
                                        px-5 py-2.5 rounded-full text-sm font-semibold transition-all duration-300 flex items-center gap-2 whitespace-nowrap
                                        ${view === tab.id
                                            ? 'bg-white dark:bg-nature-dark-bg text-nature-dark dark:text-white shadow-sm scale-105'
                                            : 'text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200 hover:bg-white/30 dark:hover:bg-white/5'}
                                    `}
                                >
                                    <span aria-hidden="true">{tab.icon}</span>
                                    {tab.label}
                                </button>
                            ))}
                        </div>
                    </nav>
                )}

                {/* Bottom Navigation - Mobile Only */}
                {isMobileView && view !== View.FORM && (
                    <BottomNavigation currentView={view} onViewChange={handleViewChange} />
                )}

                <ErrorBoundary fallbackLabel="cette vue" onReset={() => setView(View.LIST)}>
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
                    ) : view === View.PRIVACY ? (
                        <LegalPages onBack={() => setView(View.LIST)} />
                    ) : view === View.TERMS ? (
                        <LegalTerms onBack={() => setView(View.LIST)} />
                    ) : view === View.LEGAL_NOTICES ? (
                        <LegalNotices onBack={() => setView(View.LIST)} />
                    ) : view === View.HELP ? (
                        <HelpPage
                            onBack={() => setView(View.LIST)}
                            onReplayTour={() => {
                                try { localStorage.removeItem('onboarding-seen-v1'); } catch { /* noop */ }
                                setShowOnboarding(true);
                                setView(View.LIST);
                            }}
                        />
                    ) : (
                        <ObservationForm
                            onSave={handleSaveObservation}
                            onCancel={handleCancel}
                            initialData={editingObservation}
                            onToast={pushToast}
                        />
                    )}
                </Suspense>
                </ErrorBoundary>

                {/* Legal footer links */}
                <footer className="text-center text-xs text-gray-400 dark:text-gray-500 py-4 space-x-2">
                    <button onClick={() => handleViewChange(View.HELP)} className="hover:text-nature-green transition-colors">Aide</button>
                    <span>|</span>
                    <button onClick={() => handleViewChange(View.PRIVACY)} className="hover:text-nature-green transition-colors">Politique de confidentialite</button>
                    <span>|</span>
                    <button onClick={() => handleViewChange(View.TERMS)} className="hover:text-nature-green transition-colors">CGU</button>
                    <span>|</span>
                    <button onClick={() => handleViewChange(View.LEGAL_NOTICES)} className="hover:text-nature-green transition-colors">Mentions legales</button>
                </footer>
            </main>
            <StorageConsentBanner />
            {showOnboarding && (
                <Suspense fallback={null}>
                    <OnboardingTour isOpen={showOnboarding} onClose={() => setShowOnboarding(false)} />
                </Suspense>
            )}
        </div>
    );
};

export default App;
