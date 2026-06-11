import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import ObservationList from '../components/ObservationList';
import { Status, TaxonomicGroup } from '../types';

describe('ObservationList taxonomic filter', () => {
    it('affiche le filtre Autre et déclenche le callback au clic', () => {
        const onTaxonomicGroupChange = vi.fn();

        render(
            <ObservationList
                observations={[]}
                allObservations={[]}
                onAdd={vi.fn()}
                onEdit={vi.fn()}
                onDelete={vi.fn()}
                onBulkDelete={vi.fn()}
                onImport={vi.fn(async () => { })}
                onToast={vi.fn()}
                searchTerm=""
                onSearchChange={vi.fn()}
                yearFilter="all"
                onYearChange={vi.fn()}
                startDateFilter=""
                onStartDateChange={vi.fn()}
                endDateFilter=""
                onEndDateChange={vi.fn()}
                taxonomicGroupFilter="all"
                onTaxonomicGroupChange={onTaxonomicGroupChange}
                statusFilter="all"
                onStatusChange={vi.fn()}
                availableYears={[]}
                sortConfig={{ key: '', direction: 'ascending' }}
                requestSort={vi.fn()}
                isMobileView={false}
                isImporting={false}
            />
        );

        const otherButton = screen.getByRole('button', { name: `Filtrer par groupe ${TaxonomicGroup.OTHER}` });
        expect(otherButton).toBeTruthy();
        expect(otherButton.getAttribute('aria-pressed')).toBe('false');

        fireEvent.click(otherButton);
        expect(onTaxonomicGroupChange).toHaveBeenCalledWith(TaxonomicGroup.OTHER);
    });

    it('marque le filtre Autre comme actif quand il est sélectionné', () => {
        render(
            <ObservationList
                observations={[]}
                allObservations={[]}
                onAdd={vi.fn()}
                onEdit={vi.fn()}
                onDelete={vi.fn()}
                onBulkDelete={vi.fn()}
                onImport={vi.fn(async () => { })}
                onToast={vi.fn()}
                searchTerm=""
                onSearchChange={vi.fn()}
                yearFilter="all"
                onYearChange={vi.fn()}
                startDateFilter=""
                onStartDateChange={vi.fn()}
                endDateFilter=""
                onEndDateChange={vi.fn()}
                taxonomicGroupFilter={TaxonomicGroup.OTHER}
                onTaxonomicGroupChange={vi.fn()}
                statusFilter={Status.NE}
                onStatusChange={vi.fn()}
                availableYears={[]}
                sortConfig={{ key: '', direction: 'ascending' }}
                requestSort={vi.fn()}
                isMobileView={false}
                isImporting={false}
            />
        );

        const otherButton = screen.getByRole('button', { name: `Filtrer par groupe ${TaxonomicGroup.OTHER}` });
        expect(otherButton.getAttribute('aria-pressed')).toBe('true');
    });
});

describe('ObservationList export en vue mobile', () => {
    // Régression audit v2 (C2) : ExportScopeDialog n'était rendu que dans la
    // branche desktop — choisir un format d'export sur mobile ne faisait rien.
    it('ouvre le dialogue de périmètre après choix d\'un format dans le menu Exporter', () => {
        render(
            <ObservationList
                observations={[]}
                allObservations={[]}
                onAdd={vi.fn()}
                onEdit={vi.fn()}
                onDelete={vi.fn()}
                onBulkDelete={vi.fn()}
                onImport={vi.fn(async () => { })}
                onToast={vi.fn()}
                searchTerm=""
                onSearchChange={vi.fn()}
                yearFilter="all"
                onYearChange={vi.fn()}
                startDateFilter=""
                onStartDateChange={vi.fn()}
                endDateFilter=""
                onEndDateChange={vi.fn()}
                taxonomicGroupFilter="all"
                onTaxonomicGroupChange={vi.fn()}
                statusFilter="all"
                onStatusChange={vi.fn()}
                availableYears={[]}
                sortConfig={{ key: '', direction: 'ascending' }}
                requestSort={vi.fn()}
                isMobileView={true}
                isImporting={false}
            />
        );

        fireEvent.click(screen.getByRole('button', { name: 'Exporter' }));
        fireEvent.click(screen.getByRole('menuitem', { name: /^JSON/ }));

        expect(screen.getByText("Choisir le périmètre d'export")).toBeTruthy();
    });
});
