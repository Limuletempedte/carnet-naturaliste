import { useState, useCallback, type Dispatch, type SetStateAction } from 'react';
import type { ObservationFormData } from '../services/observationFormService';

/**
 * Gère la saisie et la liste des observateurs associés.
 * Le champ texte (`observerInput`) est interne ; les observateurs sont
 * persistés dans `formData.observers` via le `setFormData` fourni.
 */
export const useObserverTags = (setFormData: Dispatch<SetStateAction<ObservationFormData>>) => {
    const [observerInput, setObserverInput] = useState('');

    const addObservers = useCallback((raw: string) => {
        const tokens = raw
            .split(/[,;]+/)
            .map(s => s.trim())
            .filter(Boolean);
        if (tokens.length === 0) return;
        setFormData(prev => {
            const existing = prev.observers ?? [];
            const merged = [...existing];
            tokens.forEach(t => {
                if (!merged.includes(t)) merged.push(t);
            });
            return { ...prev, observers: merged };
        });
        setObserverInput('');
    }, [setFormData]);

    const removeObserver = useCallback((name: string) => {
        setFormData(prev => {
            const next = (prev.observers ?? []).filter(n => n !== name);
            return { ...prev, observers: next.length > 0 ? next : undefined };
        });
    }, [setFormData]);

    return { observerInput, setObserverInput, addObservers, removeObserver };
};
