import { RefObject, useEffect } from 'react';

/**
 * Appelle `callback` quand l'utilisateur clique ou tape en dehors de `ref.current`.
 * Ecoute `mousedown` + `touchstart` (comportement d'origine dans ObservationForm).
 *
 * Utilisation typique :
 *   useClickOutside(speciesInputWrapperRef, () => setShowSuggestions(false));
 */
export function useClickOutside<T extends Node>(
    ref: RefObject<T | null>,
    callback: () => void,
): void {
    useEffect(() => {
        const handlePointerDownOutside = (event: MouseEvent | TouchEvent) => {
            const el = ref.current;
            const target = event.target;
            if (!el || !(target instanceof Node)) return;
            if (!el.contains(target)) callback();
        };

        document.addEventListener('mousedown', handlePointerDownOutside);
        document.addEventListener('touchstart', handlePointerDownOutside);
        return () => {
            document.removeEventListener('mousedown', handlePointerDownOutside);
            document.removeEventListener('touchstart', handlePointerDownOutside);
        };
    }, [ref, callback]);
}
