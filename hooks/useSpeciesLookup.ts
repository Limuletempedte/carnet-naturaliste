import { useState, useEffect, useRef, useCallback, type Dispatch, type SetStateAction } from 'react';
import {
    fetchSpeciesInfo,
    SpeciesInfo,
    SpeciesSuggestion,
    suggestSpeciesAutocomplete,
    mapINatIconicToTaxonomicGroup,
} from '../services/speciesService';
import type { ObservationFormData } from '../services/observationFormService';
import type { Observation } from '../types';
import { getObservationLookupKey, normalizeLookupKey } from '../utils/observationFormHelpers';
import { useClickOutside } from './useClickOutside';
import { logger } from '../utils/logger';
import type { ToastType } from '../components/ToastContainer';

interface FieldTouched {
    latinName: boolean;
    taxonomicGroup: boolean;
    status: boolean;
}

interface UseSpeciesLookupParams {
    /** Nom commun courant du formulaire (`formData.speciesName`). */
    speciesName: string;
    /** Nom latin courant du formulaire (`formData.latinName`). */
    latinName: string;
    /** Setter du formulaire parent — l'enrichissement applique latin/groupe/statut/image. */
    setFormData: Dispatch<SetStateAction<ObservationFormData>>;
    /** Champs édités manuellement : l'enrichissement ne les écrase pas. */
    fieldTouched: FieldTouched;
    /** Observation en cours d'édition (réinitialise suggestions + suivi d'image). */
    initialData: Observation | null;
    onToast: (type: ToastType, message: string, durationMs?: number) => void;
}

/**
 * Encapsule toute la logique « espèce » du formulaire d'observation :
 * autocomplétion (iNaturalist/GBIF), enrichissement (description, image, statut,
 * groupe taxonomique) et leur coordination via des refs partagées
 * (`latestSpeciesRequestRef` contre les réponses obsolètes,
 * `lastAutoImage*Ref` pour le suivi de l'image auto-appliquée,
 * `skipNextSuggestionsFetchRef` pour ne pas re-fetcher après application).
 *
 * Ces trois mécanismes étant fortement couplés (mêmes refs lues/écrites par
 * l'autocomplétion et l'enrichissement), ils restent regroupés dans un hook
 * unique plutôt que scindés — extraction sans changement de comportement.
 */
export const useSpeciesLookup = ({
    speciesName,
    latinName,
    setFormData,
    fieldTouched,
    initialData,
    onToast,
}: UseSpeciesLookupParams) => {
    const [speciesInfo, setSpeciesInfo] = useState<SpeciesInfo | null>(null);
    const [speciesSuggestions, setSpeciesSuggestions] = useState<SpeciesSuggestion[]>([]);
    const [isFetchingSuggestions, setIsFetchingSuggestions] = useState(false);
    const [showSuggestions, setShowSuggestions] = useState(false);
    const [activeSuggestionIndex, setActiveSuggestionIndex] = useState(-1);
    const [isFetchingInfo, setIsFetchingInfo] = useState(false);

    const latestSpeciesRequestRef = useRef(0);
    const lastAutoImageLookupKeyRef = useRef('');
    const lastAutoImageUrlRef = useRef('');
    const speciesInputWrapperRef = useRef<HTMLDivElement>(null);
    const skipNextSuggestionsFetchRef = useRef(false);

    const lookupKey = getObservationLookupKey(speciesName, latinName);
    const normalizedLookupKey = normalizeLookupKey(lookupKey);

    // Réinitialise les suggestions et le suivi d'image auto quand on (ré)ouvre le
    // formulaire (création ou passage à une autre observation à éditer).
    useEffect(() => {
        setSpeciesSuggestions([]);
        setShowSuggestions(false);
        setActiveSuggestionIndex(-1);
        lastAutoImageLookupKeyRef.current = '';
        lastAutoImageUrlRef.current = '';
    }, [initialData]);

    // Debounce species autocomplete suggestions (French-first via iNaturalist).
    useEffect(() => {
        let cancelled = false;
        const abortController = new AbortController();
        const query = speciesName.trim();

        if (skipNextSuggestionsFetchRef.current) {
            skipNextSuggestionsFetchRef.current = false;
            return;
        }

        if (query.length < 2) {
            setSpeciesSuggestions([]);
            setShowSuggestions(false);
            setActiveSuggestionIndex(-1);
            setIsFetchingSuggestions(false);
            return;
        }

        setIsFetchingSuggestions(true);
        const timeoutId = window.setTimeout(async () => {
            const suggestions = await suggestSpeciesAutocomplete(query, 5, { signal: abortController.signal });
            if (cancelled) return;

            setSpeciesSuggestions(suggestions);
            setShowSuggestions(suggestions.length > 0);
            setActiveSuggestionIndex(suggestions.length > 0 ? 0 : -1);
            setIsFetchingSuggestions(false);
        }, 300);

        return () => {
            cancelled = true;
            abortController.abort();
            clearTimeout(timeoutId);
        };
    }, [speciesName]);

    // Close autocomplete when clicking/tapping outside the species input area.
    useClickOutside(speciesInputWrapperRef, () => {
        setShowSuggestions(false);
        setActiveSuggestionIndex(-1);
    });

    useEffect(() => {
        // Invalidate stale async species enrichment when identity changes.
        latestSpeciesRequestRef.current += 1;
        setSpeciesInfo(null);
        setFormData(prev => {
            const shouldClearAutoImage = (
                !prev.photo
                && !!lastAutoImageLookupKeyRef.current
                && !!lastAutoImageUrlRef.current
                && lastAutoImageLookupKeyRef.current !== normalizedLookupKey
                && prev.wikipediaImage === lastAutoImageUrlRef.current
            );
            if (!shouldClearAutoImage) return prev;
            return { ...prev, wikipediaImage: undefined };
        });
    }, [normalizedLookupKey, setFormData]);

    // Debounce fetching species info
    useEffect(() => {
        let cancelled = false;
        const abortController = new AbortController();
        const lookupForRequest = lookupKey;
        const normalizedLookupForRequest = normalizedLookupKey;
        const fetchInfo = async () => {
            if (lookupForRequest.length > 2) {
                const requestId = latestSpeciesRequestRef.current + 1;
                latestSpeciesRequestRef.current = requestId;
                setIsFetchingInfo(true);
                try {
                    const info = await fetchSpeciesInfo(lookupForRequest, { signal: abortController.signal });
                    if (cancelled || requestId !== latestSpeciesRequestRef.current) {
                        return;
                    }
                    setSpeciesInfo(info);

                    // Only pre-fill the latin name once when the field is still blank.
                    if (info?.latinName && !fieldTouched.latinName) {
                        setFormData(prev => ({
                            ...prev,
                            latinName: prev.latinName || info.latinName || ''
                        }));
                    }

                    // Auto-apply taxonomic group and wikipedia image
                    if (info) {
                        setFormData(prev => {
                            const currentLookup = normalizeLookupKey(getObservationLookupKey(prev.speciesName, prev.latinName));
                            if (currentLookup !== normalizedLookupForRequest) {
                                return prev;
                            }

                            const next = { ...prev };
                            let hasChanges = false;

                            if (!prev.photo && info.imageUrl) {
                                if (prev.wikipediaImage !== info.imageUrl) {
                                    next.wikipediaImage = info.imageUrl;
                                    hasChanges = true;
                                }
                                lastAutoImageLookupKeyRef.current = normalizedLookupForRequest;
                                lastAutoImageUrlRef.current = info.imageUrl;
                            }

                            if (!fieldTouched.taxonomicGroup && info.taxonomicGroup && prev.taxonomicGroup !== info.taxonomicGroup) {
                                next.taxonomicGroup = info.taxonomicGroup;
                                hasChanges = true;
                            }

                            if (!fieldTouched.status && info.redListStatus && prev.status !== info.redListStatus) {
                                next.status = info.redListStatus;
                                hasChanges = true;
                            }

                            return hasChanges ? next : prev;
                        });
                    }
                } finally {
                    if (!cancelled && requestId === latestSpeciesRequestRef.current) {
                        setIsFetchingInfo(false);
                    }
                }
            } else {
                setSpeciesInfo(null);
                setIsFetchingInfo(false);
            }
        };

        const timeoutId = setTimeout(fetchInfo, 1000);
        return () => {
            cancelled = true;
            abortController.abort();
            clearTimeout(timeoutId);
        };
    }, [fieldTouched.latinName, fieldTouched.status, fieldTouched.taxonomicGroup, lookupKey, normalizedLookupKey, setFormData]);

    /**
     * Force un refetch des infos espèce en court-circuitant le cache.
     * On met à jour le panneau latéral uniquement — on NE RÉAPPLIQUE PAS
     * automatiquement les champs (taxonomicGroup, status) car l'utilisateur
     * a peut-être édité manuellement entre temps. Le toast annonce le résultat.
     */
    const handleRefreshSpeciesInfo = useCallback(async () => {
        if (lookupKey.trim().length <= 2) return;
        const requestId = latestSpeciesRequestRef.current + 1;
        latestSpeciesRequestRef.current = requestId;
        setIsFetchingInfo(true);
        try {
            const info = await fetchSpeciesInfo(lookupKey, { bypassCache: true });
            if (requestId !== latestSpeciesRequestRef.current) return;
            setSpeciesInfo(info);
            if (info) {
                const statusHint = info.redListStatus ? ` — Statut : ${info.redListStatus}` : '';
                onToast('success', `Infos espèce rafraîchies${statusHint}`);
            } else {
                onToast('warning', 'Aucune information trouvée pour cette espèce');
            }
        } catch (e) {
            if (requestId !== latestSpeciesRequestRef.current) return;
            logger.error('Refresh species info error:', e);
            onToast('error', 'Impossible de rafraîchir les infos espèce');
        } finally {
            if (requestId === latestSpeciesRequestRef.current) {
                setIsFetchingInfo(false);
            }
        }
    }, [lookupKey, onToast]);

    const applySpeciesAutocompleteSuggestion = (suggestion: SpeciesSuggestion) => {
        skipNextSuggestionsFetchRef.current = true;
        setShowSuggestions(false);
        setSpeciesSuggestions([]);
        setActiveSuggestionIndex(-1);

        // Immediately map iconic taxon name to taxonomic group
        const suggestedGroup = suggestion.iconicTaxonName
            ? mapINatIconicToTaxonomicGroup(suggestion.iconicTaxonName)
            : undefined;

        setFormData(prev => {
            const next = {
                ...prev,
                speciesName: suggestion.displayName,
                latinName: !fieldTouched.latinName ? (suggestion.latinName || prev.latinName || '') : prev.latinName,
                taxonomicGroup: !fieldTouched.taxonomicGroup && suggestedGroup
                    ? suggestedGroup
                    : prev.taxonomicGroup,
            };

            if (!prev.photo) {
                next.wikipediaImage = suggestion.imageUrl || undefined;
            }

            const normalizedNextLookup = normalizeLookupKey(getObservationLookupKey(next.speciesName, next.latinName));
            if (!prev.photo && suggestion.imageUrl) {
                lastAutoImageLookupKeyRef.current = normalizedNextLookup;
                lastAutoImageUrlRef.current = suggestion.imageUrl;
            } else if (!prev.photo && !suggestion.imageUrl) {
                lastAutoImageLookupKeyRef.current = '';
                lastAutoImageUrlRef.current = '';
            }

            return next;
        });
    };

    return {
        speciesInfo,
        speciesSuggestions,
        isFetchingSuggestions,
        isFetchingInfo,
        showSuggestions,
        setShowSuggestions,
        activeSuggestionIndex,
        setActiveSuggestionIndex,
        speciesInputWrapperRef,
        lookupKey,
        applySpeciesAutocompleteSuggestion,
        handleRefreshSpeciesInfo,
    };
};
