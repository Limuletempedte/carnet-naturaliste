import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import AiIdentificationPanel from '../components/AiIdentificationPanel';
import type { AiIdentifyResult } from '../services/aiAssistService';

const result: AiIdentifyResult = {
    candidates: [
        {
            scientificName: 'Erithacus rubecula',
            commonName: '<img src=x onerror=alert(1)>',
            confidence: 'elevee',
            visibleCriteria: ['Poitrine orange', '<script>alert(2)</script>'],
            criteriaToCheck: ['Chant flûté'],
        },
        {
            scientificName: 'Phoenicurus ochruros',
            commonName: 'Rougequeue noir',
            confidence: 'faible',
            visibleCriteria: [],
            criteriaToCheck: ['Queue rousse'],
        },
    ],
    photoNote: 'Photo un peu floue.',
    remaining: 17,
};

describe('AiIdentificationPanel', () => {
    it('affiche les hypothèses en texte brut, sans interpréter de HTML', () => {
        const { container } = render(<AiIdentificationPanel result={result} onChoose={vi.fn()} />);
        expect(screen.getByText('<img src=x onerror=alert(1)>')).toBeTruthy();
        expect(screen.getByText('<script>alert(2)</script>')).toBeTruthy();
        expect(container.querySelector('img')).toBeNull();
        expect(container.querySelector('script')).toBeNull();
    });

    it('montre confiance, critères, remarque, avertissement et analyses restantes', () => {
        render(<AiIdentificationPanel result={result} onChoose={vi.fn()} />);
        expect(screen.getByText('Confiance élevée')).toBeTruthy();
        expect(screen.getByText('Confiance faible')).toBeTruthy();
        expect(screen.getByText('Chant flûté')).toBeTruthy();
        expect(screen.getByText(/Photo un peu floue/)).toBeTruthy();
        expect(screen.getByText(/Suggestions à vérifier/)).toBeTruthy();
        expect(screen.getByText(/Analyses restantes ce mois-ci : 17/)).toBeTruthy();
    });

    it("n'appelle onChoose qu'au clic sur « Choisir »", () => {
        const onChoose = vi.fn();
        render(<AiIdentificationPanel result={result} onChoose={onChoose} />);
        expect(onChoose).not.toHaveBeenCalled();
        fireEvent.click(screen.getByRole('button', { name: 'Choisir Rougequeue noir' }));
        expect(onChoose).toHaveBeenCalledWith(result.candidates[1]);
    });

    it('désactive les boutons pendant la vérification du nom', () => {
        render(<AiIdentificationPanel result={result} onChoose={vi.fn()} choosingName="Erithacus rubecula" />);
        expect(screen.getByText('Vérification du nom…')).toBeTruthy();
        screen.getAllByRole('button').forEach(button => expect((button as HTMLButtonElement).disabled).toBe(true));
    });

    it('dit quand aucune espèce n’est proposée', () => {
        render(<AiIdentificationPanel result={{ candidates: [], photoNote: '', remaining: 2 }} onChoose={vi.fn()} />);
        expect(screen.getByText(/Aucune espèce identifiable/)).toBeTruthy();
    });
});
