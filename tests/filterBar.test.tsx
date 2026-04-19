import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import FilterBar from '../components/FilterBar';
import { Status } from '../types';

const baseProps = {
    searchTerm: '',
    onSearchChange: vi.fn(),
    yearFilter: 'all',
    onYearChange: vi.fn(),
    statusFilter: 'all' as Status | 'all',
    onStatusChange: vi.fn(),
    availableYears: ['2025', '2024'],
    isMobileView: false,
};

describe('FilterBar', () => {
    it('affiche les annees disponibles en option', () => {
        render(<FilterBar {...baseProps} />);
        expect(screen.getByRole('option', { name: '2025' })).toBeDefined();
        expect(screen.getByRole('option', { name: '2024' })).toBeDefined();
        expect(screen.getByRole('option', { name: 'Toutes' })).toBeDefined();
    });

    it('appelle onSearchChange lors de la saisie', () => {
        const onSearchChange = vi.fn();
        render(<FilterBar {...baseProps} onSearchChange={onSearchChange} />);
        const input = screen.getByPlaceholderText(/Espèce/i) as HTMLInputElement;
        fireEvent.change(input, { target: { value: 'mesange' } });
        expect(onSearchChange).toHaveBeenCalledWith('mesange');
    });

    it('appelle onYearChange quand l annee change', () => {
        const onYearChange = vi.fn();
        render(<FilterBar {...baseProps} onYearChange={onYearChange} />);
        const yearSelect = screen.getAllByRole('combobox')[0] as HTMLSelectElement;
        fireEvent.change(yearSelect, { target: { value: '2025' } });
        expect(onYearChange).toHaveBeenCalledWith('2025');
    });
});
