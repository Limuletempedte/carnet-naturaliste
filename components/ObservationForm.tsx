import React, { Suspense, lazy, useState, useEffect, useRef } from 'react';
import { TAXON_LOGOS } from '../constants';
import { Observation, TaxonomicGroup, Status, Protocol, Sexe, Age, ObservationCondition, Comportement } from '../types';
import { fetchSpeciesInfo, SpeciesInfo, SpeciesSuggestion, suggestSpeciesAutocomplete, mapINatIconicToTaxonomicGroup } from '../services/speciesService';
import { fetchAltitude } from '../services/locationService';
import { compressImage } from '../utils/imageUtils';
import { buildObservationFromForm, ObservationFormData, validateObservationForm } from '../services/observationFormService';
import { uploadPhoto } from '../services/storageService';
import { dateToIsoLocal } from '../utils/dateUtils';
import { normalizeSearchText } from '../utils/textUtils';
import { ToastType } from './ToastContainer';

const MapInput = lazy(() => import('./MapInput'));

interface ObservationFormProps {
    onSave: (observation: Observation) => Promise<void>;
    onCancel: () => void;
    initialData: Observation | null;
    onToast: (type: ToastType, message: string, durationMs?: number) => void;
}

const FormSection: React.FC<{ title: string, children: React.ReactNode }> = ({ title, children }) => (
    <div className="bg-white/80 dark:bg-nature-dark-surface/80 p-6 rounded-lg shadow-md">
        <h3 className="text-xl font-serif font-bold text-nature-dark dark:text-white mb-4 border-b-2 border-nature-green/30 pb-2">{title}</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {children}
        </div>
    </div>
);

const getObservationLookupKey = (speciesName: string, latinName: string): string => {
    return latinName.trim() || speciesName.trim();
};

const normalizeLookupKey = (value: string): string => normalizeSearchText(value || '');

const createEmptyFormData = (defaultTaxonomicGroup: TaxonomicGroup): ObservationFormData => ({
    speciesName: '',
    latinName: '',
    taxonomicGroup: defaultTaxonomicGroup,
    date: dateToIsoLocal(new Date()),
    time: new Date().toTimeString().substring(0, 5),
    count: 1,
    maleCount: '',
    femaleCount: '',
    unidentifiedCount: '',
    location: '',
    gps: { lat: null, lon: null },
    municipality: '',
    department: '',
    country: 'France',
    altitude: null,
    comment: '',
    status: Status.NE,
    atlasCode: '',
    protocol: Protocol.OPPORTUNIST,
    sexe: Sexe.UNKNOWN,
    age: Age.UNKNOWN,
    observationCondition: ObservationCondition.UNKNOWN,
    comportement: Comportement.UNKNOWN,
    photo: undefined,
    sound: undefined,
    wikipediaImage: undefined,
});

const mapObservationToFormData = (observation: Observation): ObservationFormData => ({
    ...observation,
    count: observation.count,
    maleCount: observation.maleCount ?? '',
    femaleCount: observation.femaleCount ?? '',
    unidentifiedCount: observation.unidentifiedCount ?? '',
});

const ObservationForm: React.FC<ObservationFormProps> = ({ onSave, onCancel, initialData, onToast }) => {
    const defaultTaxonomicGroup = TaxonomicGroup.BIRD;
    const [formData, setFormData] = useState<ObservationFormData>(() => createEmptyFormData(defaultTaxonomicGroup));
    const [errors, setErrors] = useState<Record<string, string>>({});
    const [showMap, setShowMap] = useState(false);
    const [speciesInfo, setSpeciesInfo] = useState<SpeciesInfo | null>(null);
    const [speciesSuggestions, setSpeciesSuggestions] = useState<SpeciesSuggestion[]>([]);
    const [isFetchingSuggestions, setIsFetchingSuggestions] = useState(false);
    const [showSuggestions, setShowSuggestions] = useState(false);
    const [activeSuggestionIndex, setActiveSuggestionIndex] = useState(-1);
    const [isFetchingInfo, setIsFetchingInfo] = useState(false);
    const [photoFile, setPhotoFile] = useState<Blob | null>(null);

    const [isUploading, setIsUploading] = useState(false);
    const latestSpeciesRequestRef = useRef(0);
    const lastAutoImageLookupKeyRef = useRef('');
    const lastAutoImageUrlRef = useRef('');
    const bottomButtonsRef = useRef<HTMLDivElement>(null);
    const speciesInputWrapperRef = useRef<HTMLDivElement>(null);
    const skipNextSuggestionsFetchRef = useRef(false);
    const [showStickyBar, setShowStickyBar] = useState(false);
    const [fieldTouched, setFieldTouched] = useState<{ latinName: boolean; taxonomicGroup: boolean; status: boolean }>({
        latinName: false,
        taxonomicGroup: false,
        status: false
    });
    const lookupKey = getObservationLookupKey(formData.speciesName, formData.latinName);
    const normalizedLookupKey = normalizeLookupKey(lookupKey);

    useEffect(() => {
        if (initialData) {
            setFormData(mapObservationToFormData(initialData));
            setPhotoFile(null);
            setSpeciesSuggestions([]);
            setShowSuggestions(false);
            setActiveSuggestionIndex(-1);
            setFieldTouched({
                latinName: !!initialData.latinName,
                taxonomicGroup: initialData.taxonomicGroup !== defaultTaxonomicGroup,
                status: initialData.status !== Status.NE
            });
        } else {
            setFormData(createEmptyFormData(defaultTaxonomicGroup));
            setFieldTouched({ latinName: false, taxonomicGroup: false, status: false });
        }
        lastAutoImageLookupKeyRef.current = '';
        lastAutoImageUrlRef.current = '';
    }, [defaultTaxonomicGroup, initialData]);

    // IntersectionObserver: show sticky bar when bottom buttons are out of view
    useEffect(() => {
        const el = bottomButtonsRef.current;
        if (!el) return;
        const observer = new IntersectionObserver(
            ([entry]) => setShowStickyBar(!entry.isIntersecting),
            { threshold: 0.1 }
        );
        observer.observe(el);
        return () => observer.disconnect();
    }, []);

    // Debounce species autocomplete suggestions (French-first via iNaturalist).
    useEffect(() => {
        let cancelled = false;
        const query = formData.speciesName.trim();

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
            const suggestions = await suggestSpeciesAutocomplete(query, 5);
            if (cancelled) return;

            setSpeciesSuggestions(suggestions);
            setShowSuggestions(suggestions.length > 0);
            setActiveSuggestionIndex(suggestions.length > 0 ? 0 : -1);
            setIsFetchingSuggestions(false);
        }, 300);

        return () => {
            cancelled = true;
            clearTimeout(timeoutId);
        };
    }, [formData.speciesName]);

    // Close autocomplete when clicking/tapping outside the species input area.
    useEffect(() => {
        const handlePointerDownOutside = (event: MouseEvent | TouchEvent) => {
            const wrapper = speciesInputWrapperRef.current;
            const target = event.target as Node | null;
            if (!wrapper || !target) return;
            if (!wrapper.contains(target)) {
                setShowSuggestions(false);
                setActiveSuggestionIndex(-1);
            }
        };

        document.addEventListener('mousedown', handlePointerDownOutside);
        document.addEventListener('touchstart', handlePointerDownOutside);
        return () => {
            document.removeEventListener('mousedown', handlePointerDownOutside);
            document.removeEventListener('touchstart', handlePointerDownOutside);
        };
    }, []);

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
    }, [normalizedLookupKey]);

    // Debounce fetching species info
    useEffect(() => {
        let cancelled = false;
        const lookupForRequest = lookupKey;
        const normalizedLookupForRequest = normalizedLookupKey;
        const fetchInfo = async () => {
            if (lookupForRequest.length > 2) {
                const requestId = latestSpeciesRequestRef.current + 1;
                latestSpeciesRequestRef.current = requestId;
                setIsFetchingInfo(true);
                const info = await fetchSpeciesInfo(lookupForRequest);
                if (cancelled || requestId !== latestSpeciesRequestRef.current) {
                    return;
                }
                setSpeciesInfo(info);
                setIsFetchingInfo(false);

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
            } else {
                setSpeciesInfo(null);
                setIsFetchingInfo(false);
            }
        };

        const timeoutId = setTimeout(fetchInfo, 1000);
        return () => {
            cancelled = true;
            clearTimeout(timeoutId);
        };
    }, [fieldTouched.latinName, fieldTouched.status, fieldTouched.taxonomicGroup, lookupKey, normalizedLookupKey]);

    useEffect(() => {
        return () => {
            if (formData.photo?.startsWith('blob:')) {
                URL.revokeObjectURL(formData.photo);
            }
            if (formData.sound?.startsWith('blob:')) {
                URL.revokeObjectURL(formData.sound);
            }
        };
    }, [formData.photo, formData.sound]);

    const handleLocationChange = async (lat: number, lon: number, municipality: string, location: string, department: string, country: string) => {
        setFormData(prev => ({
            ...prev,
            gps: { lat, lon },
            municipality,
            location,
            department,
            country: country || prev.country
        }));

        // Fetch altitude automatically
        const altitude = await fetchAltitude(lat, lon);
        if (altitude !== null) {
            setFormData(prev => ({ ...prev, altitude }));
        }
    };

    const validate = () => {
        const nextErrors = validateObservationForm(formData);
        setErrors(nextErrors);
        return Object.keys(nextErrors).length === 0;
    };

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
        const { name, value } = e.target;

        if (name === 'lat' || name === 'lon') {
            setFormData(prev => ({
                ...prev,
                gps: {
                    ...prev.gps,
                    [name]: value === '' ? null : parseFloat(value)
                }
            }));
        } else if (name === 'count' || name === 'maleCount' || name === 'femaleCount' || name === 'unidentifiedCount') {
            if (value === '') {
                setFormData(prev => ({ ...prev, [name]: '' }));
                return;
            }
            const parsed = parseInt(value, 10);
            setFormData(prev => ({ ...prev, [name]: Number.isNaN(parsed) ? '' : parsed }));
        } else if (name === 'altitude') {
            setFormData(prev => ({ ...prev, altitude: value === '' ? null : parseFloat(value) }));
        } else {
            if (name === 'latinName') {
                setFieldTouched(prev => ({ ...prev, latinName: true }));
            }
            if (name === 'status') {
                setFieldTouched(prev => ({ ...prev, status: true }));
            }
            setFormData(prev => ({ ...prev, [name]: value }));
        }
    };

    const handleCountBlur = (fieldName: 'count' | 'maleCount' | 'femaleCount' | 'unidentifiedCount') => {
        setFormData(prev => {
            const currentValue = prev[fieldName];
            const numericValue = Number(currentValue);

            if (fieldName === 'count') {
                if (currentValue === '' || !Number.isInteger(numericValue) || numericValue < 1) {
                    return { ...prev, count: 1 };
                }
                return prev;
            }

            if (currentValue === '') {
                return prev;
            }

            if (!Number.isInteger(numericValue) || numericValue < 0) {
                return { ...prev, [fieldName]: '' };
            }

            return prev;
        });
    };

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

    const handleSpeciesNameKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (speciesSuggestions.length === 0) return;

        if (!showSuggestions && e.key === 'ArrowDown') {
            e.preventDefault();
            setShowSuggestions(true);
            setActiveSuggestionIndex(0);
            return;
        }

        if (!showSuggestions) return;

        if (e.key === 'ArrowDown') {
            e.preventDefault();
            setActiveSuggestionIndex(prev => (prev + 1) % speciesSuggestions.length);
            return;
        }

        if (e.key === 'ArrowUp') {
            e.preventDefault();
            setActiveSuggestionIndex(prev => (prev <= 0 ? speciesSuggestions.length - 1 : prev - 1));
            return;
        }

        if (e.key === 'Enter' && activeSuggestionIndex >= 0) {
            e.preventDefault();
            applySpeciesAutocompleteSuggestion(speciesSuggestions[activeSuggestionIndex]);
            return;
        }

        if (e.key === 'Escape') {
            e.preventDefault();
            setShowSuggestions(false);
            setActiveSuggestionIndex(-1);
        }
    };



    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const { name, files } = e.target;
        if (files && files[0] && name === 'photo') {
            try {
                const compressedBlob = await compressImage(files[0]);
                setPhotoFile(compressedBlob);

                // Revoke previous preview URL to prevent memory leak
                if (formData.photo?.startsWith('blob:')) {
                    URL.revokeObjectURL(formData.photo);
                }
                // Create preview URL
                const previewUrl = URL.createObjectURL(compressedBlob);
                setFormData(prev => ({ ...prev, photo: previewUrl }));
            } catch (error) {
                console.error("Erreur lors de la compression:", error);
                onToast('error', "Impossible de traiter l'image.");
            }
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (isUploading) return;
        if (!validate()) {
            return;
        }

        setIsUploading(true);
        let photoUrl = formData.photo;
        const soundUrl = formData.sound;
        const strippedOfflineMedia: string[] = [];

        try {
            if (navigator.onLine) {
                if (photoFile) {
                    photoUrl = await uploadPhoto(photoFile);
                }
            } else {
                if (photoFile) {
                    photoUrl = initialData?.photo || undefined;
                    strippedOfflineMedia.push('photo');
                }
            }

            const observationToSave: Observation = buildObservationFromForm(
                formData,
                initialData?.id || crypto.randomUUID(),
                photoUrl,
                soundUrl
            );
            await onSave(observationToSave);

            if (strippedOfflineMedia.length > 0) {
                onToast('warning', `Observation enregistrée, mais le nouveau ${strippedOfflineMedia.join(' et ')} n'a pas pu être envoyé hors-ligne. Réessayez en ligne.`, 7000);
            }
        } catch (error) {
            console.error("Erreur lors de l'envoi:", error);
            onToast('error', "Erreur lors de l'envoi de l'observation (Photo ou Données).");
        } finally {
            setIsUploading(false);
        }
    };

    const inputClass = "w-full p-3 bg-nature-beige dark:bg-black/20 border-none rounded-xl focus:ring-2 focus:ring-nature-green transition-all dark:text-white placeholder-gray-400";
    const labelClass = "block text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-2 ml-1";
    const errorClass = "text-red-500 text-xs mt-1 ml-1";
    const buttonClass = "px-6 py-3 rounded-full shadow-ios font-semibold text-white transition-all duration-300 transform hover:scale-105 active:scale-95";
    const primaryButtonClass = `${buttonClass} bg-nature-green hover:bg-green-600`;
    const secondaryButtonClass = `${buttonClass} bg-gray-400 hover:bg-gray-500`;

    return (
        <>
            <form onSubmit={handleSubmit} className="bg-white/80 dark:bg-nature-dark-surface/80 backdrop-blur-xl rounded-3xl shadow-ios border border-white/20 dark:border-white/5 p-4 md:p-8 space-y-8 animate-fadeIn">
                <h2 className="text-3xl font-bold tracking-tight text-nature-dark dark:text-white mb-6 text-center">{initialData ? 'Modifier' : 'Ajouter'} une observation</h2>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                    <div className="lg:col-span-2 space-y-8">
                        <FormSection title="Identification">
                            <div className="lg:col-span-2">
                                <label htmlFor="speciesName" className={labelClass}>Nom de l'espèce *</label>
                                <div className="relative" ref={speciesInputWrapperRef}>
                                    <input
                                        type="text"
                                        id="speciesName"
                                        name="speciesName"
                                        value={formData.speciesName}
                                        onChange={handleChange}
                                        onKeyDown={handleSpeciesNameKeyDown}
                                        onFocus={() => {
                                            if (speciesSuggestions.length > 0) {
                                                setShowSuggestions(true);
                                            }
                                        }}
                                        onBlur={() => {
                                            window.setTimeout(() => {
                                                setShowSuggestions(false);
                                            }, 120);
                                        }}
                                        className={inputClass}
                                        required
                                        autoComplete="off"
                                        placeholder="Nom commun"
                                    />
                                    {showSuggestions && speciesSuggestions.length > 0 && (
                                        <ul className="absolute z-30 mt-1 w-full rounded-xl border border-gray-200 bg-white shadow-lg max-h-64 overflow-y-auto dark:border-white/10 dark:bg-nature-dark-surface" role="listbox" aria-label="Suggestions espèces">
                                            {speciesSuggestions.map((suggestion, index) => (
                                                <li key={`${suggestion.source}-${suggestion.latinName}-${index}`}>
                                                    <button
                                                        type="button"
                                                        className={`w-full text-left px-3 py-2 transition-colors ${index === activeSuggestionIndex ? 'bg-nature-green/15 dark:bg-nature-green/20' : 'hover:bg-gray-50 dark:hover:bg-white/5'}`}
                                                        onMouseDown={(event) => {
                                                            event.preventDefault();
                                                            applySpeciesAutocompleteSuggestion(suggestion);
                                                        }}
                                                        onTouchStart={(event) => {
                                                            event.preventDefault();
                                                            applySpeciesAutocompleteSuggestion(suggestion);
                                                        }}
                                                    >
                                                        <p className="text-sm font-semibold text-nature-dark dark:text-white">{suggestion.displayName}</p>
                                                        <p className="text-xs text-gray-500 dark:text-gray-300">{suggestion.latinName}</p>
                                                    </button>
                                                </li>
                                            ))}
                                        </ul>
                                    )}
                                </div>
                                <p className="text-xs text-gray-500 mt-1 ml-1">Exemple: Mésange charbonnière</p>
                                {errors.speciesName && <p className={errorClass}>{errors.speciesName}</p>}
                                {isFetchingSuggestions && <p className="text-xs text-gray-500 mt-1 ml-1">Suggestions...</p>}
                                {isFetchingInfo && <p className="text-xs text-gray-500 mt-1 ml-1">Recherche d'infos...</p>}
                            </div>
                            <div className="lg:col-span-1">
                                <label htmlFor="latinName" className={labelClass}>Nom latin</label>
                                <input type="text" id="latinName" name="latinName" value={formData.latinName} onChange={handleChange} className={inputClass} />
                            </div>
                            <div className="lg:col-span-3">
                                <label className={labelClass}>Groupe taxonomique</label>
                                <p className="text-xs text-gray-500 ml-1 mb-2">Choisissez le groupe le plus proche si la détection auto ne convient pas.</p>
                                <div className="flex flex-wrap gap-3 pt-2">
                                    {Object.entries(TAXON_LOGOS).map(([group, logoPath]) => (
                                        logoPath && (
                                            <button
                                                type="button"
                                                key={group}
                                                onClick={() => {
                                                    setFieldTouched(prev => ({ ...prev, taxonomicGroup: true }));
                                                    setFormData(prev => ({ ...prev, taxonomicGroup: group as TaxonomicGroup }));
                                                }}
                                                className={`p-2 rounded-full transition-all duration-300 transform hover:scale-110 ${formData.taxonomicGroup === group ? 'bg-nature-green ring-4 ring-nature-green/20 shadow-lg scale-110' : 'bg-nature-beige dark:bg-white/10 hover:bg-gray-200 dark:hover:bg-white/20 grayscale hover:grayscale-0'}`}
                                                title={group}
                                            >
                                                <img src={logoPath} alt={group} className="w-10 h-10 object-contain" />
                                            </button>
                                        )
                                    ))}
                                </div>
                            </div>
                            <div className="lg:col-span-1">
                                <label htmlFor="date" className={labelClass}>Date *</label>
                                <input type="date" id="date" name="date" value={formData.date} onChange={handleChange} className={inputClass} required />
                                {errors.date && <p className={errorClass}>{errors.date}</p>}
                            </div>
                            <div className="lg:col-span-1">
                                <label htmlFor="time" className={labelClass}>Heure</label>
                                <input type="time" id="time" name="time" value={formData.time} onChange={handleChange} className={inputClass} />
                            </div>
                            <div className="lg:col-span-1">
                                <label htmlFor="count" className={labelClass}>Nombre d'individus</label>
                                <input type="number" id="count" name="count" value={formData.count} onChange={handleChange} onBlur={() => handleCountBlur('count')} min="1" className={inputClass} />
                                {errors.count && <p className={errorClass}>{errors.count}</p>}
                            </div>
                            <div className="lg:col-span-2">
                                <label className={labelClass}>Répartition (optionnel)</label>
                                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                                    <div>
                                        <label htmlFor="maleCount" className="block text-[11px] font-semibold text-gray-500 mb-1 ml-1">Mâle</label>
                                        <input
                                            type="number"
                                            id="maleCount"
                                            name="maleCount"
                                            min="0"
                                            value={formData.maleCount}
                                            onChange={handleChange}
                                            onBlur={() => handleCountBlur('maleCount')}
                                            className={inputClass}
                                        />
                                        {errors.maleCount && <p className={errorClass}>{errors.maleCount}</p>}
                                    </div>
                                    <div>
                                        <label htmlFor="femaleCount" className="block text-[11px] font-semibold text-gray-500 mb-1 ml-1">Femelle</label>
                                        <input
                                            type="number"
                                            id="femaleCount"
                                            name="femaleCount"
                                            min="0"
                                            value={formData.femaleCount}
                                            onChange={handleChange}
                                            onBlur={() => handleCountBlur('femaleCount')}
                                            className={inputClass}
                                        />
                                        {errors.femaleCount && <p className={errorClass}>{errors.femaleCount}</p>}
                                    </div>
                                    <div>
                                        <label htmlFor="unidentifiedCount" className="block text-[11px] font-semibold text-gray-500 mb-1 ml-1">Non identifié</label>
                                        <input
                                            type="number"
                                            id="unidentifiedCount"
                                            name="unidentifiedCount"
                                            min="0"
                                            value={formData.unidentifiedCount}
                                            onChange={handleChange}
                                            onBlur={() => handleCountBlur('unidentifiedCount')}
                                            className={inputClass}
                                        />
                                        {errors.unidentifiedCount && <p className={errorClass}>{errors.unidentifiedCount}</p>}
                                    </div>
                                </div>
                                <p className="text-xs text-gray-500 mt-2 ml-1">Si tu renseignes la répartition, la somme doit être égale au total.</p>
                                {errors.countBreakdown && <p className={errorClass}>{errors.countBreakdown}</p>}
                            </div>
                        </FormSection>

                        <FormSection title="Localisation">
                            <div>
                                <label htmlFor="location" className={labelClass}>Lieu-dit</label>
                                <input type="text" id="location" name="location" value={formData.location} onChange={handleChange} className={inputClass} />
                            </div>
                            <div>
                                <label htmlFor="municipality" className={labelClass}>Commune</label>
                                <input type="text" id="municipality" name="municipality" value={formData.municipality} onChange={handleChange} className={inputClass} />
                            </div>
                            <div>
                                <label htmlFor="department" className={labelClass}>Département</label>
                                <input type="text" id="department" name="department" value={formData.department} onChange={handleChange} className={inputClass} />
                            </div>
                            <div>
                                <label htmlFor="country" className={labelClass}>Pays</label>
                                <input type="text" id="country" name="country" value={formData.country} onChange={handleChange} className={inputClass} />
                            </div>
                            <div>
                                <label htmlFor="lat" className={labelClass}>Latitude</label>
                                <input type="number" step="any" id="lat" name="lat" value={formData.gps.lat ?? ''} onChange={handleChange} className={inputClass} />
                                {errors.lat && <p className={errorClass}>{errors.lat}</p>}
                            </div>
                            <div>
                                <label htmlFor="lon" className={labelClass}>Longitude</label>
                                <input type="number" step="any" id="lon" name="lon" value={formData.gps.lon ?? ''} onChange={handleChange} className={inputClass} />
                                {errors.lon && <p className={errorClass}>{errors.lon}</p>}
                            </div>
                            <div>
                                <label htmlFor="altitude" className={labelClass}>Altitude (m)</label>
                                <input type="number" id="altitude" name="altitude" value={formData.altitude ?? ''} onChange={handleChange} className={inputClass} />
                            </div>
                            <div className="col-span-full">
                                <button type="button" onClick={() => setShowMap(!showMap)} className={`${secondaryButtonClass} w-full bg-blue-500 hover:bg-blue-600`}>
                                    {showMap ? 'Cacher la carte' : '📍 Localiser sur la carte'}
                                </button>
                                {showMap && (
                                    <div className="mt-4 rounded-2xl overflow-hidden shadow-inner ring-1 ring-black/5">
                                        <Suspense fallback={<div className="p-4 text-sm text-gray-500">Chargement de la carte...</div>}>
                                            <MapInput onLocationChange={handleLocationChange} onToast={onToast} />
                                        </Suspense>
                                    </div>
                                )}
                            </div>
                        </FormSection>

                        <FormSection title="Détails">
                            <div>
                                <label htmlFor="status" className={labelClass}>Statut</label>
                                <select id="status" name="status" value={formData.status} onChange={handleChange} className={`${inputClass} appearance-none cursor-pointer`}>
                                    {Object.values(Status).map(s => <option key={s} value={s}>{s}</option>)}
                                </select>
                                {speciesInfo?.redListStatus && (
                                    <p className="text-xs text-gray-500 mt-1 ml-1">
                                        Statut auto depuis GBIF/IUCN: <span className="font-semibold">{speciesInfo.redListStatus}</span>
                                    </p>
                                )}
                            </div>
                            <div>
                                <label htmlFor="protocol" className={labelClass}>Protocole</label>
                                <select id="protocol" name="protocol" value={formData.protocol} onChange={handleChange} className={`${inputClass} appearance-none cursor-pointer`}>
                                    {Object.values(Protocol).map(p => <option key={p} value={p}>{p}</option>)}
                                </select>
                            </div>
                            <div>
                                <label htmlFor="atlasCode" className={labelClass}>Code atlas</label>
                                <input type="text" id="atlasCode" name="atlasCode" value={formData.atlasCode} onChange={handleChange} className={inputClass} />
                            </div>
                            <div>
                                <label htmlFor="sexe" className={labelClass}>Sexe</label>
                                <select id="sexe" name="sexe" value={formData.sexe} onChange={handleChange} className={`${inputClass} appearance-none cursor-pointer`}>
                                    {Object.values(Sexe).map(s => <option key={s} value={s}>{s}</option>)}
                                </select>
                            </div>
                            <div>
                                <label htmlFor="age" className={labelClass}>Age</label>
                                <select id="age" name="age" value={formData.age} onChange={handleChange} className={`${inputClass} appearance-none cursor-pointer`}>
                                    {Object.values(Age).map(a => <option key={a} value={a}>{a}</option>)}
                                </select>
                            </div>
                            <div>
                                <label htmlFor="observationCondition" className={labelClass}>Condition</label>
                                <select id="observationCondition" name="observationCondition" value={formData.observationCondition} onChange={handleChange} className={`${inputClass} appearance-none cursor-pointer`}>
                                    {Object.values(ObservationCondition).map(c => <option key={c} value={c}>{c}</option>)}
                                </select>
                            </div>
                            <div className="lg:col-span-3">
                                <label htmlFor="comportement" className={labelClass}>Comportement</label>
                                <select id="comportement" name="comportement" value={formData.comportement} onChange={handleChange} className={`${inputClass} appearance-none cursor-pointer`}>
                                    {Object.values(Comportement).map(c => <option key={c} value={c}>{c}</option>)}
                                </select>
                            </div>
                        </FormSection>

                        <FormSection title="Média et Notes">
                            <div className="md:col-span-3">
                                <label htmlFor="comment" className={labelClass}>Commentaire</label>
                                <textarea id="comment" name="comment" value={formData.comment} onChange={handleChange} rows={4} className={inputClass}></textarea>
                            </div>
                            <div>
                                <label htmlFor="photo" className={labelClass}>Photo (perso)</label>
                                <input type="file" id="photo" name="photo" accept="image/*" onChange={handleFileChange} className="block w-full text-sm text-gray-500 file:mr-4 file:py-2.5 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-nature-green/10 file:text-nature-green hover:file:bg-nature-green/20 transition cursor-pointer" />
                                {formData.photo && <img src={formData.photo} alt="Aperçu" className="mt-4 h-32 w-32 object-cover rounded-2xl shadow-md ring-1 ring-black/5" />}
                            </div>
                            <div>
                                <label className={labelClass}>Son</label>
                                {formData.sound ? (
                                    <audio controls src={formData.sound} className="mt-2 w-full rounded-full shadow-sm"></audio>
                                ) : (
                                    <p className="text-xs text-gray-400 italic mt-1">Fonctionnalité temporairement indisponible</p>
                                )}
                            </div>
                        </FormSection>
                    </div>

                    {/* Sidebar for Species Info */}
                    <div className="lg:col-span-1">
                        <div className="bg-white/80 dark:bg-nature-dark-surface/80 p-6 rounded-3xl shadow-ios border border-white/20 dark:border-white/5 sticky top-6 backdrop-blur-xl">
                            <h3 className="text-xl font-bold text-nature-dark dark:text-white mb-4 pb-2 border-b border-gray-100 dark:border-white/5">Informations Espèce</h3>
                            {speciesInfo ? (
                                <div className="space-y-4 animate-fadeIn">
                                    {speciesInfo.imageUrl && (
                                        <img src={speciesInfo.imageUrl} alt={formData.speciesName} className="w-full h-48 object-cover rounded-2xl shadow-sm" />
                                    )}
                                    <h4 className="font-bold text-lg text-nature-dark dark:text-white">{formData.speciesName}</h4>
                                    <p className="text-sm text-gray-600 dark:text-gray-300 leading-relaxed max-h-60 overflow-y-auto scrollbar-thin scrollbar-thumb-nature-green scrollbar-track-transparent pr-2">
                                        {speciesInfo.description}
                                    </p>
                                    {speciesInfo.sourceUrl && (
                                        <a href={speciesInfo.sourceUrl} target="_blank" rel="noopener noreferrer" className="text-xs font-medium text-nature-green hover:text-green-600 block mt-2">
                                            Voir la source →
                                        </a>
                                    )}
                                </div>
                            ) : (
                                <div className="text-center text-gray-500 dark:text-gray-400 py-8">
                                    <p>Entrez un nom d'espèce pour voir les informations.</p>
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                <div ref={bottomButtonsRef} className="flex justify-end space-x-4 pt-6 border-t border-gray-100 dark:border-white/5">
                    <button type="button" onClick={onCancel} className={secondaryButtonClass}>Annuler</button>
                    <button type="submit" disabled={isUploading} className={`${primaryButtonClass} ${isUploading ? 'opacity-50 cursor-not-allowed' : ''}`}>
                        {isUploading ? 'Envoi...' : 'Sauvegarder'}
                    </button>
                </div>
            </form>

            {/* Sticky Save/Cancel Bar */}
            {
                showStickyBar && (
                    <div className="fixed bottom-0 left-0 right-0 z-40 px-4 py-3 bg-white/80 dark:bg-nature-dark-surface/80 backdrop-blur-md border-t border-gray-200/50 dark:border-white/10 shadow-[0_-4px_20px_rgba(0,0,0,0.1)] flex justify-end gap-3">
                        <button type="button" onClick={onCancel} className={secondaryButtonClass}>Annuler</button>
                        <button type="button" onClick={() => bottomButtonsRef.current?.closest('form')?.requestSubmit()} disabled={isUploading} className={`${primaryButtonClass} ${isUploading ? 'opacity-50 cursor-not-allowed' : ''}`}>
                            {isUploading ? 'Envoi...' : 'Sauvegarder'}
                        </button>
                    </div>
                )
            }
        </>
    );
};

export default ObservationForm;
