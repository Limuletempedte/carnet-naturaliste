import React, { useRef, useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Observation, TaxonomicGroup, Status } from '../types';
import ObservationRow from './ObservationRow';
import ObservationCard from './ObservationCard';
import { TAXON_LOGOS } from '../constants';
import { ImportResult } from '../services/excelImportService';
import { parseJsonImport } from '../services/jsonImportValidation';
import ImportPreviewDialog from './ImportPreviewDialog';
import { ToastType } from './ToastContainer';
import ExportScopeDialog from './ExportScopeDialog';
import { ObservationExportType, runObservationExport } from '../services/observationExportService';
import { buildImportPersistencePlan, ImportConflictMode } from '../services/importPolicy';
import { logger } from '../utils/logger';
import { CHUNK_LOAD_USER_MESSAGE, isChunkLoadError } from '../utils/chunkLoadError';
import { useLiquidGlassRefraction } from './LiquidGlass';
import { SpinnerIcon, PlusIcon } from './icons';
import EmptyState from './EmptyState';

interface ObservationListProps {
    observations: Observation[];
    allObservations: Observation[];
    onAdd: () => void;
    // EE-2 : le clic sur une carte/ligne ouvre la vue détail (lecture seule).
    onView: (id: string) => void;
    onEdit: (id: string) => void;
    onDelete: (id: string) => void;
    onBulkDelete: (ids: string[]) => void;
    onImport: (result: ImportResult, options?: { conflictMode: ImportConflictMode }) => Promise<void>;
    onToast: (type: ToastType, message: string) => void;
    searchTerm: string;
    onSearchChange: (value: string) => void;
    yearFilter: string;
    onYearChange: (value: string) => void;
    startDateFilter: string;
    onStartDateChange: (value: string) => void;
    endDateFilter: string;
    onEndDateChange: (value: string) => void;
    taxonomicGroupFilter: TaxonomicGroup | 'all';
    onTaxonomicGroupChange: (group: TaxonomicGroup | 'all') => void;
    statusFilter: Status | 'all';
    onStatusChange: (status: Status | 'all') => void;
    availableYears: string[];
    sortConfig: { key: keyof Observation | ''; direction: 'ascending' | 'descending' };
    requestSort: (key: keyof Observation) => void;
    isMobileView: boolean;
    isBulkDeleting?: boolean;
    isImporting: boolean;
}

const ObservationList: React.FC<ObservationListProps> = ({
    observations,
    allObservations,
    onAdd,
    onView,
    onEdit,
    onDelete,
    onBulkDelete,
    onImport,
    onToast,
    searchTerm,
    onSearchChange,
    yearFilter,
    onYearChange,
    startDateFilter,
    onStartDateChange,
    endDateFilter,
    onEndDateChange,
    taxonomicGroupFilter,
    onTaxonomicGroupChange,
    statusFilter,
    onStatusChange,
    availableYears,
    sortConfig,
    requestSort,
    isMobileView,
    isBulkDeleting = false,
    isImporting
}) => {
    const fileInputRef = useRef<HTMLInputElement>(null);
    const tableRef = useRef<HTMLDivElement>(null);
    const [isParsingImport, setIsParsingImport] = React.useState(false);
    const [previewImportResult, setPreviewImportResult] = React.useState<ImportResult | null>(null);
    const [previewImportFileName, setPreviewImportFileName] = React.useState('');
    const [importConflictMode, setImportConflictMode] = React.useState<ImportConflictMode>('merge');
    const [pendingExportType, setPendingExportType] = React.useState<ObservationExportType | null>(null);
    const [isExporting, setIsExporting] = React.useState(false);
    const [showMobileExportMenu, setShowMobileExportMenu] = React.useState(false);
    // Position (top + right) calculée à l'ouverture pour rendre le menu via un Portal
    // dans document.body. Sans cela, le `backdrop-blur-md` du wrapper toolbar (ligne ~269)
    // crée un stacking context qui piège le menu derrière les cartes d'observation.
    const [mobileExportMenuPos, setMobileExportMenuPos] = React.useState<{ top: number; right: number } | null>(null);
    const exporterButtonRef = React.useRef<HTMLButtonElement>(null);
    const mobileExportMenuRef = React.useRef<HTMLDivElement>(null);
    // EE-4 : réfraction Liquid Glass sur le menu d'export (Chromium uniquement).
    const exportMenuGlassRef = useLiquidGlassRefraction<HTMLDivElement>();

    // Click-outside custom qui couvre à la fois le bouton Exporter ET le menu rendu dans le portail.
    React.useEffect(() => {
        if (!showMobileExportMenu) return;
        const handlePointerDownOutside = (event: MouseEvent | TouchEvent) => {
            const target = event.target;
            if (!(target instanceof Node)) return;
            if (exporterButtonRef.current?.contains(target)) return;
            if (mobileExportMenuRef.current?.contains(target)) return;
            setShowMobileExportMenu(false);
        };
        document.addEventListener('mousedown', handlePointerDownOutside);
        document.addEventListener('touchstart', handlePointerDownOutside);
        return () => {
            document.removeEventListener('mousedown', handlePointerDownOutside);
            document.removeEventListener('touchstart', handlePointerDownOutside);
        };
    }, [showMobileExportMenu]);

    const toggleMobileExportMenu = () => {
        if (!showMobileExportMenu && exporterButtonRef.current) {
            const rect = exporterButtonRef.current.getBoundingClientRect();
            setMobileExportMenuPos({
                top: rect.bottom + 4,
                right: Math.max(8, window.innerWidth - rect.right),
            });
        }
        setShowMobileExportMenu(v => !v);
    };

    // FAB visibility on scroll
    const [showFab, setShowFab] = useState(false);
    useEffect(() => {
        const onScroll = () => setShowFab(window.scrollY > 150);
        window.addEventListener('scroll', onScroll, { passive: true });
        return () => window.removeEventListener('scroll', onScroll);
    }, []);

    const resolveExportData = (scope: 'filtered' | 'all' | 'selected'): Observation[] => {
        if (scope === 'selected') {
            return observations.filter(obs => selectedIds.has(obs.id));
        }
        return scope === 'filtered' ? observations : allObservations;
    };

    const runExport = async (scope: 'filtered' | 'all' | 'selected') => {
        if (!pendingExportType) return;

        const exportData = resolveExportData(scope);
        setPendingExportType(null);
        setIsExporting(true);
        try {
            await runObservationExport(pendingExportType, exportData);
        } catch (error) {
            logger.error('Erreur export:', error);
            onToast('error', isChunkLoadError(error) ? CHUNK_LOAD_USER_MESSAGE : "Impossible d'exporter les observations.");
        } finally {
            setIsExporting(false);
        }
    };

    const openExportDialog = (type: ObservationExportType) => {
        setPendingExportType(type);
    };

    const handleImportClick = () => {
        fileInputRef.current?.click();
    };

    const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (file) {
            try {
                setIsParsingImport(true);
                let importResult: ImportResult;

                const lowerName = file.name.toLowerCase();
                if (lowerName.endsWith('.json')) {
                    const text = await file.text();
                    const parsed = JSON.parse(text) as unknown;
                    importResult = parseJsonImport(parsed);
                } else if (lowerName.endsWith('.xlsx') || lowerName.endsWith('.xls')) {
                    const { parseExcel } = await import('../services/excelImportService');
                    importResult = await parseExcel(file);
                } else if (lowerName.endsWith('.zip')) {
                    // SR-01 : restauration depuis un backup ZIP
                    const { readBackupZip } = await import('../services/backupService');
                    importResult = await readBackupZip(file);
                } else {
                    onToast('warning', "Format non supporté. Utilisez JSON, Excel (.xlsx, .xls) ou un backup ZIP.");
                    return;
                }

                if (importResult.report.warnings.length > 0) {
                    logger.warn(`Import: ${importResult.report.warnings.length} warning(s)`, importResult.report.warnings);
                }
                if (importResult.report.errors.length > 0) {
                    onToast('warning', `${importResult.report.errors.length} erreur(s) de validation détectée(s).`);
                }
                if (importResult.report.blockingErrors.length > 0) {
                    onToast('error', `${importResult.report.blockingErrors.length} erreur(s) bloquante(s) avant import.`);
                }

                setPreviewImportFileName(file.name);
                setPreviewImportResult(importResult);
            } catch (error) {
                logger.error("Erreur d'import:", error);
                onToast('error', isChunkLoadError(error) ? CHUNK_LOAD_USER_MESSAGE : "Erreur lors de l'importation du fichier. Vérifiez le format.");
            } finally {
                setIsParsingImport(false);
            }
        }
        if (fileInputRef.current) {
            fileInputRef.current.value = '';
        }
    };

    const handleCancelPreview = () => {
        setPreviewImportResult(null);
        setPreviewImportFileName('');
        setImportConflictMode('merge');
    };

    const currentImportPlan = React.useMemo(() => {
        if (!previewImportResult) return [];
        return buildImportPersistencePlan(previewImportResult.observations, allObservations, { conflictMode: importConflictMode });
    }, [allObservations, importConflictMode, previewImportResult]);

    const importPlanSummary = React.useMemo(() => {
        const existingIds = new Set(allObservations.map(obs => obs.id));
        const collisionsWithExisting = previewImportResult
            ? previewImportResult.observations.filter(obs => existingIds.has(obs.id)).length
            : 0;
        let plannedInserts = 0;
        let plannedUpdates = 0;
        currentImportPlan.forEach(step => {
            if (step.mode === 'update') plannedUpdates += 1;
            else plannedInserts += 1;
        });
        return {
            collisionsWithExisting,
            plannedInserts,
            plannedUpdates
        };
    }, [allObservations, currentImportPlan, previewImportResult]);

    const handleConfirmPreview = async () => {
        if (!previewImportResult) return;
        if (previewImportResult.report.blockingErrors.length > 0) {
            onToast('error', "Corrigez les erreurs bloquantes avant de confirmer l'import.");
            return;
        }
        try {
            await onImport(previewImportResult, { conflictMode: importConflictMode });
            setPreviewImportResult(null);
            setPreviewImportFileName('');
            setImportConflictMode('merge');
        } catch (error) {
            logger.error(error);
            onToast('error', "L'import a échoué. Vérifiez les messages d'erreur.");
        }
    };

    const getSortIndicator = (key: keyof Observation) => {
        if (sortConfig.key === key) {
            return sortConfig.direction === 'ascending' ? ' ▲' : ' ▼';
        }
        return '';
    };

    // UIA-03 : en-tête de tri accessible (clavier + aria-sort). Le <button> rend
    // le tri activable au clavier et l'attribut aria-sort annonce l'état courant
    // aux lecteurs d'écran (le ▲/▼ visuel reste pour les voyants).
    const SortableHeader: React.FC<{ sortKey: keyof Observation; label: string; thClassName?: string }> = ({ sortKey, label, thClassName = '' }) => {
        const isActive = sortConfig.key === sortKey;
        const ariaSort = isActive ? (sortConfig.direction === 'ascending' ? 'ascending' : 'descending') : 'none';
        return (
            <th aria-sort={ariaSort} className={`p-6 text-xs font-bold uppercase tracking-widest text-gray-500 dark:text-gray-400 ${thClassName}`}>
                <button
                    type="button"
                    onClick={() => requestSort(sortKey)}
                    className="w-full text-left uppercase hover:text-nature-green transition-colors"
                >
                    {label}{getSortIndicator(sortKey)}
                </button>
            </th>
        );
    };

    const buttonClass = "px-4 py-2 rounded-full shadow-ios font-semibold text-white transition-all duration-300 transform hover:scale-105 active:scale-95";
    const primaryButtonClass = `${buttonClass} bg-nature-green hover:bg-green-600`;
    const secondaryButtonClass = `${buttonClass} bg-nature-gray hover:bg-gray-600`;
    const taxonFilterEntries = Object.entries(TAXON_LOGOS) as Array<[TaxonomicGroup, string]>;

    const [selectedIds, setSelectedIds] = React.useState<Set<string>>(new Set());

    // Prune selection to keep only IDs visible in current filtered list
    React.useEffect(() => {
        setSelectedIds(prev => {
            const visibleIds = new Set(observations.map(o => o.id));
            const pruned = new Set([...prev].filter(id => visibleIds.has(id)));
            return pruned.size === prev.size ? prev : pruned;
        });
    }, [observations]);

    const handleToggleSelection = (id: string) => {
        const newSelected = new Set(selectedIds);
        if (newSelected.has(id)) {
            newSelected.delete(id);
        } else {
            newSelected.add(id);
        }
        setSelectedIds(newSelected);
    };

    const handleSelectAll = () => {
        if (selectedIds.size === observations.length) {
            setSelectedIds(new Set());
        } else {
            setSelectedIds(new Set(observations.map(obs => obs.id)));
        }
    };

    const handleDeleteSelected = () => {
        if (selectedIds.size === 0 || isBulkDeleting) return;
        onBulkDelete(Array.from(selectedIds));
    };

    if (isMobileView) {
        return (
            <>
                <div className="space-y-4 pb-20">
                    {/* Mobile Header & Filters */}
                    {/* -mx-2 annule pile le px-2 du <main> mobile (8 px) pour un bandeau
                        pleine largeur. -mx-4 (ancien) dépassait de 16 px → page plus large
                        que l'écran = léger zoom + bords coupés sur iOS ET Android (BUG-E5). */}
                    <div className="bg-white/90 dark:bg-nature-dark-bg/90 backdrop-blur-md p-3 -mx-2 shadow-sm space-y-2">
                        <div className="flex justify-between items-center">
                            <h2 className="text-lg font-bold text-nature-dark dark:text-white">Observations</h2>
                            <div className="flex gap-2">
                                {selectedIds.size > 0 && (
                                    <button onClick={handleDeleteSelected} disabled={isBulkDeleting} aria-label={`Supprimer la sélection (${selectedIds.size})`} title="Supprimer la sélection" className="bg-red-500 text-white p-2 min-w-[44px] min-h-[44px] flex items-center justify-center rounded-full shadow-lg disabled:opacity-50">
                                        {isBulkDeleting ? (
                                            <SpinnerIcon className="animate-spin w-6 h-6" />
                                        ) : (
                                            <svg aria-hidden="true" className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
                                        )}
                                    </button>
                                )}
                                <button onClick={onAdd} aria-label="Ajouter une observation" title="Ajouter une observation" className="bg-nature-green text-white p-2 min-w-[44px] min-h-[44px] flex items-center justify-center rounded-full shadow-lg">
                                    <svg aria-hidden="true" className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4"></path></svg>
                                </button>
                            </div>
                        </div>

                        <input
                            type="file"
                            ref={fileInputRef}
                            onChange={handleFileChange}
                            className="hidden"
                            accept=".json,.xlsx,.xls,.zip"
                        />

                        {/* Desktop : rangée horizontale complète Importer + 5 exports */}
                        <div className="hidden md:flex gap-2 overflow-x-auto no-scrollbar pb-0.5">
                            <button
                                onClick={handleImportClick}
                                disabled={isParsingImport}
                                className="h-8 px-3 rounded-lg text-xs font-medium bg-gray-500 text-white disabled:opacity-60 flex-shrink-0 inline-flex items-center"
                            >
                                {isParsingImport ? 'Analyse...' : 'Importer'}
                            </button>
                            <button
                                onClick={() => openExportDialog('json')}
                                disabled={isExporting}
                                className="h-8 px-3 rounded-lg text-xs font-medium bg-blue-500 text-white disabled:opacity-60 flex-shrink-0 inline-flex items-center"
                            >
                                {isExporting && pendingExportType === 'json' ? 'Export...' : 'JSON'}
                            </button>
                            <button
                                onClick={() => openExportDialog('excel')}
                                disabled={isExporting}
                                className="h-8 px-3 rounded-lg text-xs font-medium bg-emerald-500 text-white disabled:opacity-60 flex-shrink-0 inline-flex items-center"
                            >
                                {isExporting && pendingExportType === 'excel' ? 'Export...' : 'Excel'}
                            </button>
                            <button
                                onClick={() => openExportDialog('pdf')}
                                disabled={isExporting}
                                className="h-8 px-3 rounded-lg text-xs font-medium bg-red-500 text-white disabled:opacity-60 flex-shrink-0 inline-flex items-center"
                            >
                                {isExporting && pendingExportType === 'pdf' ? 'Export...' : 'PDF'}
                            </button>
                            <button
                                onClick={() => openExportDialog('darwincore')}
                                disabled={isExporting}
                                title="Darwin Core — standard international GBIF/TDWG"
                                className="h-8 px-3 rounded-lg text-xs font-medium bg-amber-600 text-white disabled:opacity-60 flex-shrink-0 inline-flex items-center"
                            >
                                {isExporting && pendingExportType === 'darwincore' ? 'Export...' : 'DwC'}
                            </button>
                            <button
                                onClick={() => openExportDialog('geojson')}
                                disabled={isExporting}
                                title="GeoJSON — ouvrable dans QGIS / geojson.io"
                                className="h-8 px-3 rounded-lg text-xs font-medium bg-indigo-500 text-white disabled:opacity-60 flex-shrink-0 inline-flex items-center"
                            >
                                {isExporting && pendingExportType === 'geojson' ? 'Export...' : 'GeoJSON'}
                            </button>
                        </div>

                        {/* Mobile : Importer + dropdown Exporter regroupant les 5 formats */}
                        <div className="flex md:hidden gap-2 pb-0.5">
                            <button
                                onClick={handleImportClick}
                                disabled={isParsingImport}
                                className="h-8 px-3 rounded-lg text-xs font-medium bg-gray-500 text-white disabled:opacity-60 inline-flex items-center"
                            >
                                {isParsingImport ? 'Analyse...' : 'Importer'}
                            </button>
                            <div className="flex-1">
                                <button
                                    ref={exporterButtonRef}
                                    type="button"
                                    onClick={toggleMobileExportMenu}
                                    disabled={isExporting}
                                    aria-expanded={showMobileExportMenu}
                                    aria-haspopup="menu"
                                    className="w-full h-8 px-3 rounded-lg text-xs font-medium bg-nature-green text-white disabled:opacity-60 inline-flex items-center justify-between gap-1"
                                >
                                    <span>{isExporting ? 'Export en cours...' : 'Exporter'}</span>
                                    <svg className={`w-3 h-3 transition-transform ${showMobileExportMenu ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
                                    </svg>
                                </button>
                            </div>
                        </div>

                        {/* Dropdown Exporter rendu via React Portal dans document.body :
                            nécessaire parce que la toolbar parente a `backdrop-blur-md` qui crée
                            un stacking context, empêchant un z-index local de dépasser les cartes. */}
                        {showMobileExportMenu && mobileExportMenuPos && createPortal(
                            <div
                                ref={(node) => { mobileExportMenuRef.current = node; exportMenuGlassRef(node); }}
                                role="menu"
                                className="fixed z-[9999] w-48 liquid-glass liquid-glass-sheen animate-scaleIn rounded-xl overflow-hidden"
                                style={{ top: mobileExportMenuPos.top, right: mobileExportMenuPos.right }}
                            >
                                {([
                                    { type: 'json' as const, label: 'JSON', hint: 'Sauvegarde brute', color: 'text-blue-600' },
                                    { type: 'excel' as const, label: 'Excel', hint: 'Tableur (.xlsx)', color: 'text-emerald-600' },
                                    { type: 'pdf' as const, label: 'PDF', hint: 'Document imprimable', color: 'text-red-600' },
                                    { type: 'darwincore' as const, label: 'Darwin Core', hint: 'Standard GBIF/TDWG', color: 'text-amber-600' },
                                    { type: 'geojson' as const, label: 'GeoJSON', hint: 'QGIS / geojson.io', color: 'text-indigo-600' }
                                ]).map(item => (
                                    <button
                                        key={item.type}
                                        type="button"
                                        role="menuitem"
                                        onClick={() => { setShowMobileExportMenu(false); openExportDialog(item.type); }}
                                        className="w-full px-3 py-2 text-left text-sm hover:bg-gray-50 dark:hover:bg-white/5 flex flex-col border-b border-gray-100 dark:border-white/5 last:border-b-0"
                                    >
                                        <span className={`font-semibold ${item.color}`}>{item.label}</span>
                                        <span className="text-xs text-gray-500 dark:text-gray-400">{item.hint}</span>
                                    </button>
                                ))}
                            </div>,
                            document.body
                        )}

                        {/* Search Bar */}
                        <div className="relative">
                            <input
                                type="text"
                                placeholder="Rechercher..."
                                aria-label="Rechercher une observation"
                                value={searchTerm}
                                onChange={e => onSearchChange(e.target.value)}
                                className="w-full pl-10 pr-4 py-2 bg-gray-100 dark:bg-white/10 rounded-xl text-base focus:ring-2 focus:ring-nature-green/50 outline-none dark:text-white"
                            />
                            <svg className="w-4 h-4 text-gray-400 absolute left-3 top-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path></svg>
                        </div>

                        {/* Horizontal Filter Scroll */}
                        <div className="flex flex-wrap gap-2 pt-1.5 no-scrollbar">
                            <button
                                onClick={handleSelectAll}
                                className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap border-none outline-none ${selectedIds.size === observations.length && observations.length > 0 ? 'bg-nature-green text-white' : 'bg-gray-100 dark:bg-white/10 dark:text-white'}`}
                            >
                                {selectedIds.size === observations.length && observations.length > 0 ? 'Tout désélectionner' : 'Tout sélectionner'}
                            </button>
                            <select
                                value={yearFilter}
                                onChange={e => onYearChange(e.target.value)}
                                aria-label="Filtrer par année"
                                className="bg-gray-100 dark:bg-white/10 px-3 py-1.5 rounded-lg text-base font-medium whitespace-nowrap dark:text-white border-none outline-none"
                            >
                                <option value="all">Toutes années</option>
                                {availableYears.map(year => (
                                    <option key={year} value={year}>{year}</option>
                                ))}
                            </select>
                            <select
                                value={statusFilter}
                                onChange={e => onStatusChange(e.target.value as Status | 'all')}
                                aria-label="Filtrer par statut de conservation"
                                className="bg-gray-100 dark:bg-white/10 px-3 py-1.5 rounded-lg text-base font-medium whitespace-nowrap dark:text-white border-none outline-none"
                            >
                                <option value="all">Tous statuts</option>
                                {Object.values(Status).map(status => (
                                    <option key={status} value={status}>{status}</option>
                                ))}
                            </select>
                        </div>
                    </div>

                    {/* Mobile List */}
                    <div className="space-y-4">
                        {observations.length > 0 ? (
                            observations.map(obs => (
                                <ObservationCard
                                    key={obs.id}
                                    observation={obs}
                                    onView={onView}
                                    onEdit={onEdit}
                                    onDelete={onDelete}
                                    selected={selectedIds.has(obs.id)}
                                    onToggle={handleToggleSelection}
                                />
                            ))
                        ) : (
                            <EmptyState variant="search" title="Aucune observation trouvée." className="py-10" />
                        )}
                    </div>
                </div>

                {/* Floating Action Button — bottom-28 (112px) laisse ~40px au-dessus de
                    la BottomNavigation mobile (qui fait ~72px avec pb-safe + pt-2). */}
                {showFab && (
                    <button
                        onClick={onAdd}
                        className="fixed bottom-28 right-4 z-40 w-16 h-16 liquid-glass-green liquid-glass-sheen text-white rounded-full flex items-center justify-center hover:scale-110 active:scale-95 hover:brightness-110 transition-all duration-200 animate-fade-in"
                        title="Ajouter une observation"
                    >
                        <PlusIcon className="w-8 h-8" strokeWidth={2.5} />
                    </button>
                )}
                <ImportPreviewDialog
                    isOpen={!!previewImportResult}
                    fileName={previewImportFileName}
                    result={previewImportResult}
                    isImporting={isImporting}
                    conflictMode={importConflictMode}
                    onConflictModeChange={setImportConflictMode}
                    collisionsWithExisting={importPlanSummary.collisionsWithExisting}
                    plannedInserts={importPlanSummary.plannedInserts}
                    plannedUpdates={importPlanSummary.plannedUpdates}
                    onCancel={handleCancelPreview}
                    onConfirm={handleConfirmPreview}
                />
                <ExportScopeDialog
                    isOpen={pendingExportType !== null}
                    filteredCount={observations.length}
                    totalCount={allObservations.length}
                    selectedCount={selectedIds.size}
                    onCancel={() => setPendingExportType(null)}
                    onSelectFiltered={() => void runExport('filtered')}
                    onSelectAll={() => void runExport('all')}
                    onSelectSelected={() => void runExport('selected')}
                />
            </>
        );
    }

    return (
        <>
            <div className="relative w-full">
                {/* ... (existing desktop layout) ... */}
                {/* Liquid Background Elements */}
                <div className="absolute top-0 left-0 w-full h-full overflow-hidden -z-10 pointer-events-none">
                    <div className="absolute inset-0 bg-topography opacity-[0.03]"></div>
                    <div className="absolute inset-0 bg-noise opacity-[0.03]"></div>
                    <div className="absolute top-[-10%] left-[20%] w-72 h-72 bg-purple-400/30 rounded-full mix-blend-multiply filter blur-3xl animate-blob"></div>
                    <div className="absolute top-[20%] right-[20%] w-72 h-72 bg-yellow-400/30 rounded-full mix-blend-multiply filter blur-3xl animate-blob animation-delay-2000"></div>
                    <div className="absolute bottom-[-10%] left-[30%] w-72 h-72 bg-pink-400/30 rounded-full mix-blend-multiply filter blur-3xl animate-blob animation-delay-4000"></div>
                </div>

                <div className="space-y-8 animate-fadeIn relative z-10">
                    <header className="flex flex-col md:flex-row justify-between items-center space-y-4 md:space-y-0 p-4 md:p-8 glass-panel rounded-[2rem]">
                        <h1 className="text-4xl font-bold tracking-tight text-nature-dark dark:text-white drop-shadow-sm">
                            Carnet <span className="text-transparent bg-clip-text bg-gradient-to-r from-nature-green to-emerald-600">Naturaliste</span>
                        </h1>
                        <div className="flex items-center flex-wrap gap-3">
                            {selectedIds.size > 0 && (
                                <button onClick={handleDeleteSelected} disabled={isBulkDeleting} className={`${secondaryButtonClass} bg-red-500/80 hover:bg-red-600 backdrop-blur-md disabled:opacity-50 disabled:cursor-not-allowed`}>
                                    {isBulkDeleting ? 'Suppression...' : `Supprimer (${selectedIds.size})`}
                                </button>
                            )}
                            <input
                                type="file"
                                ref={fileInputRef}
                                onChange={handleFileChange}
                                className="hidden"
                                accept=".json,.xlsx,.xls,.zip"
                            />
                            <button
                                onClick={handleImportClick}
                                disabled={isParsingImport}
                                className={`${secondaryButtonClass} bg-gray-500/80 hover:bg-gray-600 backdrop-blur-md disabled:opacity-60 disabled:cursor-not-allowed`}
                            >
                                {isParsingImport ? 'Analyse...' : 'Importer'}
                            </button>
                            <button onClick={() => openExportDialog('json')} disabled={isExporting} className={`${secondaryButtonClass} bg-blue-500/80 hover:bg-blue-600 backdrop-blur-md disabled:opacity-60`}>JSON</button>
                            <button onClick={() => openExportDialog('excel')} disabled={isExporting} className={`${secondaryButtonClass} bg-emerald-500/80 hover:bg-emerald-600 backdrop-blur-md disabled:opacity-60`}>Excel</button>
                            <button onClick={() => openExportDialog('pdf')} disabled={isExporting} className={`${secondaryButtonClass} bg-red-500/80 hover:bg-red-600 backdrop-blur-md disabled:opacity-60`}>PDF</button>
                            <button onClick={() => openExportDialog('darwincore')} disabled={isExporting} title="Darwin Core — standard GBIF/TDWG" className={`${secondaryButtonClass} bg-amber-600/80 hover:bg-amber-700 backdrop-blur-md disabled:opacity-60`}>DwC</button>
                            <button onClick={() => openExportDialog('geojson')} disabled={isExporting} title="GeoJSON — QGIS / geojson.io" className={`${secondaryButtonClass} bg-indigo-500/80 hover:bg-indigo-600 backdrop-blur-md disabled:opacity-60`}>GeoJSON</button>
                            <button onClick={onAdd} className={`${primaryButtonClass} shadow-lg shadow-nature-green/30`}>
                                <span className="mr-1">+</span> Observation
                            </button>
                        </div>
                    </header>

                    <div className="p-4 md:p-8 glass-panel rounded-[2rem] space-y-8">
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 items-end">
                            <div className="relative md:col-span-1 group">
                                <label htmlFor="search-input" className="block text-xs font-bold uppercase tracking-widest text-gray-500 dark:text-gray-400 mb-3 ml-1 group-focus-within:text-nature-green transition-colors">Recherche</label>
                                <div className="relative">
                                    <span className="absolute inset-y-0 left-0 flex items-center pl-4 pointer-events-none">
                                        <svg className="w-5 h-5 text-gray-400 group-focus-within:text-nature-green transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path></svg>
                                    </span>
                                    <input
                                        type="text"
                                        id="search-input"
                                        placeholder="Rechercher..."
                                        value={searchTerm}
                                        onChange={e => onSearchChange(e.target.value)}
                                        className="w-full pl-12 pr-4 py-4 glass-input rounded-2xl focus:ring-2 focus:ring-nature-green/50 focus:border-nature-green/50 transition-all dark:text-white placeholder-gray-400 outline-none"
                                    />
                                </div>
                            </div>
                            <div className="group">
                                <label htmlFor="year-filter" className="block text-xs font-bold uppercase tracking-widest text-gray-500 dark:text-gray-400 mb-3 ml-1 group-focus-within:text-nature-green transition-colors">Année</label>
                                <div className="relative">
                                    <select
                                        id="year-filter"
                                        value={yearFilter}
                                        onChange={e => onYearChange(e.target.value)}
                                        className="w-full py-4 px-5 glass-input rounded-2xl focus:ring-2 focus:ring-nature-green/50 focus:border-nature-green/50 transition-all dark:text-white appearance-none cursor-pointer outline-none"
                                    >
                                        <option value="all">Toutes les années</option>
                                        {availableYears.map(year => (
                                            <option key={year} value={year} className="text-gray-900 dark:text-white bg-white dark:bg-nature-dark-surface">{year}</option>
                                        ))}
                                    </select>
                                    <div className="absolute inset-y-0 right-0 flex items-center px-4 pointer-events-none">
                                        <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path></svg>
                                    </div>
                                </div>
                            </div>
                            <div className="group">
                                <label className="block text-xs font-bold uppercase tracking-widest text-gray-500 dark:text-gray-400 mb-3 ml-1 group-focus-within:text-nature-green transition-colors">Période</label>
                                <div className="flex gap-2">
                                    <input
                                        type="date"
                                        value={startDateFilter}
                                        onChange={e => onStartDateChange(e.target.value)}
                                        className="w-full py-4 px-3 glass-input rounded-2xl focus:ring-2 focus:ring-nature-green/50 focus:border-nature-green/50 transition-all dark:text-white outline-none text-xs"
                                        placeholder="Du"
                                    />
                                    <input
                                        type="date"
                                        value={endDateFilter}
                                        onChange={e => onEndDateChange(e.target.value)}
                                        className="w-full py-4 px-3 glass-input rounded-2xl focus:ring-2 focus:ring-nature-green/50 focus:border-nature-green/50 transition-all dark:text-white outline-none text-xs"
                                        placeholder="Au"
                                    />
                                </div>
                            </div>
                            <div className="group">
                                <label htmlFor="status-filter" className="block text-xs font-bold uppercase tracking-widest text-gray-500 dark:text-gray-400 mb-3 ml-1 group-focus-within:text-nature-green transition-colors">Statut</label>
                                <div className="relative">
                                    <select
                                        id="status-filter"
                                        value={statusFilter}
                                        onChange={e => onStatusChange(e.target.value as Status | 'all')}
                                        className="w-full py-4 px-5 glass-input rounded-2xl focus:ring-2 focus:ring-nature-green/50 focus:border-nature-green/50 transition-all dark:text-white appearance-none cursor-pointer outline-none"
                                    >
                                        <option value="all">Tous les statuts</option>
                                        {Object.values(Status).map(status => (
                                            <option key={status} value={status} className="text-gray-900 dark:text-white bg-white dark:bg-nature-dark-surface">{status}</option>
                                        ))}
                                    </select>
                                    <div className="absolute inset-y-0 right-0 flex items-center px-4 pointer-events-none">
                                        <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path></svg>
                                    </div>
                                </div>
                            </div>
                        </div>
                        <div className="flex flex-wrap items-center gap-4 pt-4 border-t border-white/10 dark:border-white/5">
                            <span className="block text-xs font-bold uppercase tracking-widest text-gray-500 dark:text-gray-400 mr-2">Filtrer par groupe</span>
                            <button
                                onClick={() => onTaxonomicGroupChange('all')}
                                aria-label="Filtrer tous les groupes"
                                aria-pressed={taxonomicGroupFilter === 'all'}
                                className={`px-6 py-2.5 rounded-full text-sm font-bold transition-all duration-300 shadow-sm ${taxonomicGroupFilter === 'all' ? 'bg-nature-dark text-white shadow-lg scale-105 ring-2 ring-white/20' : 'glass-input text-gray-600 dark:text-gray-300 hover:bg-white/40 dark:hover:bg-white/10'}`}>
                                Tous
                            </button>
                            {taxonFilterEntries.map(([group, logoPath]) => {
                                const isActive = taxonomicGroupFilter === group;
                                const ariaLabel = `Filtrer par groupe ${group}`;

                                if (logoPath) {
                                    return (
                                        <button
                                            key={group}
                                            onClick={() => onTaxonomicGroupChange(group)}
                                            aria-label={ariaLabel}
                                            aria-pressed={isActive}
                                            className={`p-2 rounded-full transition-all duration-300 transform hover:scale-110 ${isActive ? 'bg-nature-green ring-4 ring-nature-green/20 shadow-lg scale-110' : 'glass-input hover:bg-white/40 dark:hover:bg-white/10 grayscale hover:grayscale-0 opacity-70 hover:opacity-100'}`}
                                            title={group}
                                        >
                                            <img src={logoPath} alt={group} className="w-8 h-8 object-contain drop-shadow-sm" />
                                        </button>
                                    );
                                }

                                return (
                                    <button
                                        key={group}
                                        onClick={() => onTaxonomicGroupChange(group)}
                                        aria-label={ariaLabel}
                                        aria-pressed={isActive}
                                        className={`px-4 py-2 rounded-full text-sm font-semibold transition-all duration-300 ${isActive ? 'bg-nature-green text-white shadow-md ring-2 ring-nature-green/25' : 'glass-input text-gray-600 dark:text-gray-300 hover:bg-white/40 dark:hover:bg-white/10'}`}
                                        title={group}
                                    >
                                        {group}
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    <div ref={tableRef} className="overflow-hidden glass-panel rounded-[2rem]">
                        <table className="w-full text-left border-collapse">
                            <thead className="bg-white/10 dark:bg-black/20 border-b border-white/10 dark:border-white/5 backdrop-blur-md">
                                <tr>
                                    <th className="p-6 text-xs font-bold uppercase tracking-widest text-gray-500 dark:text-gray-400">
                                        <input
                                            type="checkbox"
                                            checked={selectedIds.size === observations.length && observations.length > 0}
                                            onChange={handleSelectAll}
                                            aria-label="Sélectionner toutes les observations"
                                            className="w-5 h-5 rounded border-gray-300 text-nature-green focus:ring-nature-green cursor-pointer"
                                        />
                                    </th>
                                    <SortableHeader sortKey="taxonomicGroup" label="Groupe" />
                                    <SortableHeader sortKey="speciesName" label="Espèce" />
                                    <SortableHeader sortKey="location" label="Lieu" thClassName="hidden md:table-cell" />
                                    <SortableHeader sortKey="date" label="Date" thClassName="hidden lg:table-cell" />
                                    <SortableHeader sortKey="count" label="Nb." />
                                    <SortableHeader sortKey="status" label="Statut" />
                                    <th className="p-6 text-xs font-bold uppercase tracking-widest text-gray-500 dark:text-gray-400 text-center no-print">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100/50 dark:divide-white/5">
                                {observations.length > 0 ? (
                                    observations.map(obs => (
                                        <ObservationRow
                                            key={obs.id}
                                            observation={obs}
                                            onView={onView}
                                            onEdit={onEdit}
                                            onDelete={onDelete}
                                            selected={selectedIds.has(obs.id)}
                                            onToggle={handleToggleSelection}
                                        />
                                    ))
                                ) : (
                                    <tr>
                                        <td colSpan={8} className="p-8">
                                            <EmptyState variant="search" title="Aucune observation trouvée pour les filtres sélectionnés." />
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div >

            {/* Desktop Floating Action Button */}
            {showFab && (
                <button
                    onClick={onAdd}
                    className="fixed bottom-8 right-8 z-40 w-14 h-14 bg-nature-green text-white rounded-full shadow-xl flex items-center justify-center text-3xl hover:scale-110 active:scale-95 transition-all duration-200"
                    title="Ajouter une observation"
                >
                    +
                </button>
            )}

            <ImportPreviewDialog
                isOpen={!!previewImportResult}
                fileName={previewImportFileName}
                result={previewImportResult}
                isImporting={isImporting}
                conflictMode={importConflictMode}
                onConflictModeChange={setImportConflictMode}
                collisionsWithExisting={importPlanSummary.collisionsWithExisting}
                plannedInserts={importPlanSummary.plannedInserts}
                plannedUpdates={importPlanSummary.plannedUpdates}
                onCancel={handleCancelPreview}
                onConfirm={handleConfirmPreview}
            />
            <ExportScopeDialog
                isOpen={pendingExportType !== null}
                filteredCount={observations.length}
                totalCount={allObservations.length}
                selectedCount={selectedIds.size}
                onCancel={() => setPendingExportType(null)}
                onSelectFiltered={() => void runExport('filtered')}
                onSelectAll={() => void runExport('all')}
                onSelectSelected={() => void runExport('selected')}
            />
        </>
    );
};

export default ObservationList;
