import React, { useRef, useState, useEffect } from 'react';
import { Observation, TaxonomicGroup, Status } from '../types';
import ObservationRow from './ObservationRow';
import ObservationCard from './ObservationCard';
import { TAXON_LOGOS } from '../constants';
import { ImportResult } from '../services/excelImportService';
import { parseJsonImport } from '../services/jsonImportValidation';
import ImportPreviewDialog from './ImportPreviewDialog';
import { ToastType } from './ToastContainer';
import ExportScopeDialog from './ExportScopeDialog';

interface ObservationListProps {
    observations: Observation[];
    allObservations: Observation[];
    onAdd: () => void;
    onEdit: (id: string) => void;
    onDelete: (id: string) => void;
    onBulkDelete: (ids: string[]) => void;
    onImport: (result: ImportResult) => Promise<void>;
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
}

const ObservationList: React.FC<ObservationListProps> = ({
    observations,
    allObservations,
    onAdd,
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
    isBulkDeleting = false
}) => {
    const fileInputRef = useRef<HTMLInputElement>(null);
    const tableRef = useRef<HTMLDivElement>(null);
    const [isParsingImport, setIsParsingImport] = React.useState(false);
    const [previewImportResult, setPreviewImportResult] = React.useState<ImportResult | null>(null);
    const [previewImportFileName, setPreviewImportFileName] = React.useState('');
    const [pendingExportType, setPendingExportType] = React.useState<'json' | 'excel' | 'pdf' | null>(null);
    const [isExporting, setIsExporting] = React.useState(false);

    // FAB visibility on scroll
    const [showFab, setShowFab] = useState(false);
    useEffect(() => {
        const onScroll = () => setShowFab(window.scrollY > 150);
        window.addEventListener('scroll', onScroll, { passive: true });
        return () => window.removeEventListener('scroll', onScroll);
    }, []);

    const resolveExportData = (scope: 'filtered' | 'all'): Observation[] => {
        return scope === 'filtered' ? observations : allObservations;
    };

    const handleExportExcel = async (exportData: Observation[]) => {
        const XLSX = await import('xlsx');
        const headers = [
            "ID", "Nom de l'espèce", "Nom latin", "Groupe taxonomique", "Date", "Heure",
            "Nombre", "Lieu-dit", "Latitude", "Longitude", "Commune", "Département",
            "Pays", "Altitude", "Statut", "Code Atlas", "Protocole", "Sexe", "Age",
            "Condition d'observation", "Comportement", "Commentaire"
        ];

        const data = exportData.map(obs => ({
            ID: obs.id,
            "Nom de l'espèce": obs.speciesName,
            "Nom latin": obs.latinName,
            "Groupe taxonomique": obs.taxonomicGroup,
            Date: obs.date,
            Heure: obs.time,
            Nombre: obs.count,
            "Lieu-dit": obs.location,
            Latitude: obs.gps.lat ?? '',
            Longitude: obs.gps.lon ?? '',
            Commune: obs.municipality,
            Département: obs.department,
            Pays: obs.country,
            Altitude: obs.altitude ?? '',
            Statut: obs.status,
            "Code Atlas": obs.atlasCode,
            Protocole: obs.protocol,
            Sexe: obs.sexe,
            Age: obs.age,
            "Condition d'observation": obs.observationCondition,
            Comportement: obs.comportement,
            Commentaire: obs.comment
        }));

        const worksheet = XLSX.utils.json_to_sheet(data, { header: headers });
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, "Observations");

        XLSX.writeFile(workbook, "export_observations.xlsx");
    };

    const handleExportJSON = (exportData: Observation[]) => {
        const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.setAttribute("href", url);
        link.setAttribute("download", "observations.json");
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    };

    const handleExportPDF = async (exportData: Observation[]) => {
        try {
            const { default: jsPDF } = await import('jspdf');
            const pdf = new jsPDF('p', 'mm', 'a4');
            const pageWidth = pdf.internal.pageSize.getWidth();
            const pageHeight = pdf.internal.pageSize.getHeight();
            const left = 10;
            const right = pageWidth - 10;
            let y = 12;

            pdf.setFontSize(16);
            pdf.text('Carnet naturaliste - Observations', left, y);
            y += 8;
            pdf.setFontSize(10);
            pdf.text(`Nombre d'observations: ${exportData.length}`, left, y);
            y += 8;

            exportData.forEach((obs, index) => {
                const lines = pdf.splitTextToSize(
                    [
                        `${index + 1}. ${obs.speciesName} (${obs.latinName || 'Nom latin non renseigné'})`,
                        `Date: ${obs.date} ${obs.time || ''} | Nombre: ${obs.count} | Groupe: ${obs.taxonomicGroup}`,
                        `Lieu: ${obs.location || 'Lieu non renseigné'} ${obs.municipality ? `(${obs.municipality})` : ''}`,
                        `Commentaire: ${obs.comment || 'Aucun'}`
                    ].join('\n'),
                    right - left
                );

                const blockHeight = lines.length * 5 + 3;
                if (y + blockHeight > pageHeight - 10) {
                    pdf.addPage();
                    y = 12;
                }

                pdf.text(lines, left, y);
                y += blockHeight;
            });

            pdf.save('carnet-naturaliste-observations.pdf');
        } catch (error) {
            console.error('Erreur export PDF:', error);
            onToast('error', "Impossible d'exporter le PDF.");
        }
    };

    const runExport = async (scope: 'filtered' | 'all') => {
        if (!pendingExportType) return;

        const exportData = resolveExportData(scope);
        setPendingExportType(null);
        setIsExporting(true);
        try {
            if (pendingExportType === 'json') {
                handleExportJSON(exportData);
            } else if (pendingExportType === 'excel') {
                await handleExportExcel(exportData);
            } else {
                await handleExportPDF(exportData);
            }
        } finally {
            setIsExporting(false);
        }
    };

    const openExportDialog = (type: 'json' | 'excel' | 'pdf') => {
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
                } else {
                    onToast('warning', "Format non supporté. Utilisez JSON ou Excel (.xlsx, .xls).");
                    return;
                }

                if (importResult.report.warnings.length > 0) {
                    console.warn(`Import: ${importResult.report.warnings.length} warning(s)`, importResult.report.warnings);
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
                console.error("Erreur d'import:", error);
                onToast('error', "Erreur lors de l'importation du fichier. Vérifiez le format.");
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
    };

    const handleConfirmPreview = async () => {
        if (!previewImportResult) return;
        if (previewImportResult.report.blockingErrors.length > 0) {
            onToast('error', "Corrigez les erreurs bloquantes avant de confirmer l'import.");
            return;
        }
        try {
            await onImport(previewImportResult);
            setPreviewImportResult(null);
            setPreviewImportFileName('');
        } catch (error) {
            console.error(error);
            onToast('error', "L'import a échoué. Vérifiez les messages d'erreur.");
        }
    };

    const getSortIndicator = (key: keyof Observation) => {
        if (sortConfig.key === key) {
            return sortConfig.direction === 'ascending' ? ' ▲' : ' ▼';
        }
        return '';
    };

    const buttonClass = "px-4 py-2 rounded-full shadow-ios font-semibold text-white transition-all duration-300 transform hover:scale-105 active:scale-95";
    const primaryButtonClass = `${buttonClass} bg-nature-green hover:bg-green-600`;
    const secondaryButtonClass = `${buttonClass} bg-nature-gray hover:bg-gray-600`;

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
                    <div className="sticky top-0 z-30 bg-white/90 dark:bg-nature-dark-bg/90 backdrop-blur-md p-4 -mx-4 shadow-sm space-y-3">
                        <div className="flex justify-between items-center">
                            <h2 className="text-xl font-bold text-nature-dark dark:text-white">Observations</h2>
                            <div className="flex gap-2">
                                {selectedIds.size > 0 && (
                                    <button onClick={handleDeleteSelected} disabled={isBulkDeleting} className="bg-red-500 text-white p-2 rounded-full shadow-lg disabled:opacity-50">
                                        {isBulkDeleting ? (
                                            <span className="animate-spin block w-6 h-6">⏳</span>
                                        ) : (
                                            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
                                        )}
                                    </button>
                                )}
                                <button onClick={onAdd} className="bg-nature-green text-white p-2 rounded-full shadow-lg">
                                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4"></path></svg>
                                </button>
                            </div>
                        </div>

                        <input
                            type="file"
                            ref={fileInputRef}
                            onChange={handleFileChange}
                            className="hidden"
                            accept=".json,.xlsx,.xls"
                        />

                        <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1">
                            <button
                                onClick={handleImportClick}
                                disabled={isParsingImport}
                                className="px-3 py-1.5 rounded-lg text-xs font-medium bg-gray-500 text-white disabled:opacity-60 flex-shrink-0"
                            >
                                {isParsingImport ? 'Analyse...' : 'Importer'}
                            </button>
                            <button
                                onClick={() => openExportDialog('json')}
                                disabled={isExporting}
                                className="px-3 py-1.5 rounded-lg text-xs font-medium bg-blue-500 text-white disabled:opacity-60 flex-shrink-0"
                            >
                                {isExporting && pendingExportType === 'json' ? 'Export...' : 'JSON'}
                            </button>
                            <button
                                onClick={() => openExportDialog('excel')}
                                disabled={isExporting}
                                className="px-3 py-1.5 rounded-lg text-xs font-medium bg-emerald-500 text-white disabled:opacity-60 flex-shrink-0"
                            >
                                {isExporting && pendingExportType === 'excel' ? 'Export...' : 'Excel'}
                            </button>
                            <button
                                onClick={() => openExportDialog('pdf')}
                                disabled={isExporting}
                                className="px-3 py-1.5 rounded-lg text-xs font-medium bg-red-500 text-white disabled:opacity-60 flex-shrink-0"
                            >
                                {isExporting && pendingExportType === 'pdf' ? 'Export...' : 'PDF'}
                            </button>
                        </div>

                        {/* Search Bar */}
                        <div className="relative">
                            <input
                                type="text"
                                placeholder="Rechercher..."
                                value={searchTerm}
                                onChange={e => onSearchChange(e.target.value)}
                                className="w-full pl-10 pr-4 py-2 bg-gray-100 dark:bg-white/10 rounded-xl text-sm focus:ring-2 focus:ring-nature-green/50 outline-none dark:text-white"
                            />
                            <svg className="w-4 h-4 text-gray-400 absolute left-3 top-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path></svg>
                        </div>

                        {/* Horizontal Filter Scroll */}
                        <div className="flex flex-wrap gap-2 pt-2 no-scrollbar">
                            <button
                                onClick={handleSelectAll}
                                className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap border-none outline-none ${selectedIds.size === observations.length && observations.length > 0 ? 'bg-nature-green text-white' : 'bg-gray-100 dark:bg-white/10 dark:text-white'}`}
                            >
                                {selectedIds.size === observations.length && observations.length > 0 ? 'Tout désélectionner' : 'Tout sélectionner'}
                            </button>
                            <select
                                value={yearFilter}
                                onChange={e => onYearChange(e.target.value)}
                                className="bg-gray-100 dark:bg-white/10 px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap dark:text-white border-none outline-none"
                            >
                                <option value="all">Toutes années</option>
                                {availableYears.map(year => (
                                    <option key={year} value={year}>{year}</option>
                                ))}
                            </select>
                            <select
                                value={statusFilter}
                                onChange={e => onStatusChange(e.target.value as Status | 'all')}
                                className="bg-gray-100 dark:bg-white/10 px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap dark:text-white border-none outline-none"
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
                                    onEdit={onEdit}
                                    onDelete={onDelete}
                                    selected={selectedIds.has(obs.id)}
                                    onToggle={handleToggleSelection}
                                />
                            ))
                        ) : (
                            <div className="text-center py-10 text-gray-400">
                                <p>Aucune observation trouvée.</p>
                            </div>
                        )}
                    </div>
                </div>

                {/* Floating Action Button */}
                {showFab && (
                    <button
                        onClick={onAdd}
                        className="fixed bottom-24 right-4 z-40 w-14 h-14 bg-nature-green text-white rounded-full shadow-xl flex items-center justify-center text-3xl hover:scale-110 active:scale-95 transition-all duration-200 animate-fade-in"
                        title="Ajouter une observation"
                    >
                        +
                    </button>
                )}
                <ImportPreviewDialog
                    isOpen={!!previewImportResult}
                    fileName={previewImportFileName}
                    result={previewImportResult}
                    onCancel={handleCancelPreview}
                    onConfirm={handleConfirmPreview}
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
                                accept=".json,.xlsx,.xls"
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
                                className={`px-6 py-2.5 rounded-full text-sm font-bold transition-all duration-300 shadow-sm ${taxonomicGroupFilter === 'all' ? 'bg-nature-dark text-white shadow-lg scale-105 ring-2 ring-white/20' : 'glass-input text-gray-600 dark:text-gray-300 hover:bg-white/40 dark:hover:bg-white/10'}`}>
                                Tous
                            </button>
                            {Object.entries(TAXON_LOGOS).map(([group, logoPath]) => (
                                logoPath && (
                                    <button
                                        key={group}
                                        onClick={() => onTaxonomicGroupChange(group as TaxonomicGroup)}
                                        className={`p-2 rounded-full transition-all duration-300 transform hover:scale-110 ${taxonomicGroupFilter === group ? 'bg-nature-green ring-4 ring-nature-green/20 shadow-lg scale-110' : 'glass-input hover:bg-white/40 dark:hover:bg-white/10 grayscale hover:grayscale-0 opacity-70 hover:opacity-100'}`}
                                        title={group}
                                    >
                                        <img src={logoPath} alt={group} className="w-8 h-8 object-contain drop-shadow-sm" />
                                    </button>
                                )
                            ))}
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
                                            className="w-5 h-5 rounded border-gray-300 text-nature-green focus:ring-nature-green cursor-pointer"
                                        />
                                    </th>
                                    <th className="p-6 text-xs font-bold uppercase tracking-widest text-gray-500 dark:text-gray-400 cursor-pointer hover:text-nature-green transition-colors" onClick={() => requestSort('taxonomicGroup')}>
                                        Groupe {getSortIndicator('taxonomicGroup')}
                                    </th>
                                    <th className="p-6 text-xs font-bold uppercase tracking-widest text-gray-500 dark:text-gray-400 cursor-pointer hover:text-nature-green transition-colors" onClick={() => requestSort('speciesName')}>
                                        Espèce {getSortIndicator('speciesName')}
                                    </th>
                                    <th className="p-6 text-xs font-bold uppercase tracking-widest text-gray-500 dark:text-gray-400 hidden md:table-cell cursor-pointer hover:text-nature-green transition-colors" onClick={() => requestSort('location')}>
                                        Lieu {getSortIndicator('location')}
                                    </th>
                                    <th className="p-6 text-xs font-bold uppercase tracking-widest text-gray-500 dark:text-gray-400 hidden lg:table-cell cursor-pointer hover:text-nature-green transition-colors" onClick={() => requestSort('date')}>
                                        Date {getSortIndicator('date')}
                                    </th>
                                    <th className="p-6 text-xs font-bold uppercase tracking-widest text-gray-500 dark:text-gray-400 cursor-pointer hover:text-nature-green transition-colors" onClick={() => requestSort('count')}>
                                        Nb. {getSortIndicator('count')}
                                    </th>
                                    <th className="p-6 text-xs font-bold uppercase tracking-widest text-gray-500 dark:text-gray-400 text-center no-print">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100/50 dark:divide-white/5">
                                {observations.length > 0 ? (
                                    observations.map(obs => (
                                        <ObservationRow
                                            key={obs.id}
                                            observation={obs}
                                            onEdit={onEdit}
                                            onDelete={onDelete}
                                            selected={selectedIds.has(obs.id)}
                                            onToggle={handleToggleSelection}
                                        />
                                    ))
                                ) : (
                                    <tr>
                                        <td colSpan={7} className="text-center p-16 text-gray-400 font-medium">
                                            <div className="flex flex-col items-center gap-4">
                                                <span className="text-4xl opacity-50">🔍</span>
                                                <p>Aucune observation trouvée pour les filtres sélectionnés.</p>
                                            </div>
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
                onCancel={handleCancelPreview}
                onConfirm={handleConfirmPreview}
            />
            <ExportScopeDialog
                isOpen={pendingExportType !== null}
                filteredCount={observations.length}
                totalCount={allObservations.length}
                onCancel={() => setPendingExportType(null)}
                onSelectFiltered={() => void runExport('filtered')}
                onSelectAll={() => void runExport('all')}
            />
        </>
    );
};

export default ObservationList;
