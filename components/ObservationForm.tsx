import React, { Suspense, lazy, useState, useEffect, useRef } from 'react';
import { TAXON_LOGOS } from '../constants';
import { Observation, TaxonomicGroup, Status, Protocol, Sexe, Age, ObservationCondition, Comportement, WeatherCondition, Habitat, Phenology } from '../types';
import { fetchAltitude, fetchWeather } from '../services/locationService';
import { compressImage } from '../utils/imageUtils';
import { buildObservationFromForm, ObservationFormData, validateObservationForm } from '../services/observationFormService';
import { uploadPhoto } from '../services/storageService';
import { isSafeImageUrl } from '../utils/urlUtils';
import { generateUUID } from '../utils/uuidUtils';
import { logger } from '../utils/logger';
import { mapUserFacingError } from '../utils/userFacingError';
import { createEmptyFormData, mapObservationToFormData } from '../utils/observationFormHelpers';
import { ATLAS_CODE_GROUPS, isKnownAtlasCode } from '../utils/atlasCodes';
import { useObserverTags } from '../hooks/useObserverTags';
import { useSpeciesLookup } from '../hooks/useSpeciesLookup';
import { ToastType } from './ToastContainer';
import FieldTooltip from './FieldTooltip';
import FormSection from './FormSection';

const MapInput = lazy(() => import('./MapInput'));

interface ObservationFormProps {
    onSave: (observation: Observation, options?: { keepFormOpen?: boolean }) => Promise<void>;
    onCancel: () => void;
    initialData: Observation | null;
    onToast: (type: ToastType, message: string, durationMs?: number) => void;
}

const ObservationForm: React.FC<ObservationFormProps> = ({ onSave, onCancel, initialData, onToast }) => {
    const defaultTaxonomicGroup = TaxonomicGroup.BIRD;
    const [formData, setFormData] = useState<ObservationFormData>(() => createEmptyFormData(defaultTaxonomicGroup));
    const [errors, setErrors] = useState<Record<string, string>>({});
    const [showMap, setShowMap] = useState(false);
    const [showAdvancedLocation, setShowAdvancedLocation] = useState(false);
    const [showAdvancedDetails, setShowAdvancedDetails] = useState(false);
    const [photoFile, setPhotoFile] = useState<Blob | null>(null);
    const { observerInput, setObserverInput, addObservers, removeObserver } = useObserverTags(setFormData);

    const [isUploading, setIsUploading] = useState(false);
    const bottomButtonsRef = useRef<HTMLDivElement>(null);
    const blobUrlsRef = useRef<Set<string>>(new Set());
    const [showStickyBar, setShowStickyBar] = useState(false);
    const [fieldTouched, setFieldTouched] = useState<{ latinName: boolean; taxonomicGroup: boolean; status: boolean; weather: boolean }>({
        latinName: false,
        taxonomicGroup: false,
        status: false,
        weather: false
    });

    // Logique espèce (autocomplétion + enrichissement) extraite dans un hook dédié.
    const {
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
    } = useSpeciesLookup({
        speciesName: formData.speciesName,
        latinName: formData.latinName,
        setFormData,
        fieldTouched,
        initialData,
        onToast,
    });

    useEffect(() => {
        if (initialData) {
            setFormData(mapObservationToFormData(initialData));
            setPhotoFile(null);
            setFieldTouched({
                latinName: !!initialData.latinName,
                taxonomicGroup: initialData.taxonomicGroup !== defaultTaxonomicGroup,
                status: initialData.status !== Status.NE,
                weather: initialData.weather !== WeatherCondition.UNKNOWN
            });
        } else {
            setFormData(createEmptyFormData(defaultTaxonomicGroup));
            setFieldTouched({ latinName: false, taxonomicGroup: false, status: false, weather: false });
        }
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

    // Track blob URLs for revocation
    useEffect(() => {
        if (formData.photo?.startsWith('blob:')) {
            blobUrlsRef.current.add(formData.photo);
        }
        if (formData.sound?.startsWith('blob:')) {
            blobUrlsRef.current.add(formData.sound);
        }
    }, [formData.photo, formData.sound]);

    // Revoke all blob URLs only on final unmount
    useEffect(() => {
        const urls = blobUrlsRef.current;
        return () => {
            urls.forEach(url => URL.revokeObjectURL(url));
            urls.clear();
        };
    }, []);

    const handleLocationChange = async (lat: number, lon: number, municipality: string, location: string, department: string, country: string) => {
        setFormData(prev => ({
            ...prev,
            gps: { lat, lon },
            municipality,
            location,
            department,
            country: country || prev.country
        }));

        // Altitude + météo automatiques (Open-Meteo). La météo n'est demandée que si
        // l'utilisateur n'a pas déjà choisi/renseigné une valeur (respect de fieldTouched).
        const [altitude, weather] = await Promise.all([
            fetchAltitude(lat, lon),
            fieldTouched.weather ? Promise.resolve(null) : fetchWeather(lat, lon, formData.date, formData.time)
        ]);
        if (altitude !== null) {
            setFormData(prev => ({ ...prev, altitude }));
        }
        if (weather) {
            // N'écrase jamais un choix météo manuel (ou déjà renseigné côté édition).
            setFormData(prev => prev.weather === WeatherCondition.UNKNOWN ? { ...prev, weather } : prev);
        }
    };

    const validate = () => {
        const nextErrors = validateObservationForm(formData);
        setErrors(nextErrors);
        return nextErrors;
    };

    // UIA-10 : amène l'utilisateur au premier champ invalide (le formulaire est
    // long et la barre « Sauvegarder » est en bas — sinon le clic semble sans effet).
    const focusFirstError = (validationErrors: Record<string, string>) => {
        const firstKey = Object.keys(validationErrors)[0];
        if (!firstKey) return;
        const field = document.getElementById(firstKey) ?? document.getElementById(`${firstKey}-error`);
        if (field) {
            field.scrollIntoView({ behavior: 'smooth', block: 'center' });
            if (typeof (field as HTMLElement & { focus?: () => void }).focus === 'function') {
                (field as HTMLElement).focus({ preventScroll: true });
            }
        }
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
            if (name === 'weather') {
                setFieldTouched(prev => ({ ...prev, weather: true }));
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
                    onToast('info', 'Le comptage minimum est 1.');
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



    const MAX_PHOTO_SIZE_BYTES = 20 * 1024 * 1024; // 20 MB

    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const { name, files } = e.target;
        if (files && files[0] && name === 'photo') {
            if (files[0].size > MAX_PHOTO_SIZE_BYTES) {
                onToast('error', 'La photo dépasse 20 Mo. Veuillez choisir un fichier plus léger.');
                e.target.value = '';
                return;
            }
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
                logger.error("Erreur lors de la compression:", error);
                onToast('error', "Impossible de traiter l'image.");
            }
        }
    };

    // Réinitialise le formulaire pour enchaîner une saisie au même endroit/moment :
    // on conserve le contexte de terrain (lieu, GPS, altitude, date/heure, observateurs,
    // groupe, protocole) et on vide ce qui est propre à l'individu observé.
    const resetForNextEntry = () => {
        blobUrlsRef.current.forEach(url => URL.revokeObjectURL(url));
        blobUrlsRef.current.clear();
        setPhotoFile(null);
        setErrors({});
        setFieldTouched({ latinName: false, taxonomicGroup: false, status: false, weather: false });
        setFormData(prev => ({
            ...createEmptyFormData(prev.taxonomicGroup),
            date: prev.date,
            time: prev.time,
            location: prev.location,
            municipality: prev.municipality,
            department: prev.department,
            country: prev.country,
            gps: { ...prev.gps },
            altitude: prev.altitude,
            observers: prev.observers,
            protocol: prev.protocol,
        }));
        window.scrollTo({ top: 0, behavior: 'smooth' });
        requestAnimationFrame(() => document.getElementById('speciesName')?.focus());
    };

    const performSave = async (addAnother: boolean) => {
        if (isUploading) return;
        const validationErrors = validate();
        if (Object.keys(validationErrors).length > 0) {
            onToast('warning', 'Veuillez corriger les champs en rouge avant d\'enregistrer.');
            focusFirstError(validationErrors);
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
                    // Offline : conserver la photo en data-URL (déjà compressée par compressImage)
                    photoUrl = await new Promise<string>((resolve, reject) => {
                        const reader = new FileReader();
                        reader.onload = () => resolve(reader.result as string);
                        reader.onerror = () => reject(reader.error);
                        reader.readAsDataURL(photoFile);
                    });
                    strippedOfflineMedia.push('photo');
                }
            }

            const observationToSave: Observation = buildObservationFromForm(
                formData,
                initialData?.id || generateUUID(),
                photoUrl,
                soundUrl
            );
            await onSave(observationToSave, { keepFormOpen: addAnother });

            if (strippedOfflineMedia.length > 0) {
                onToast('warning', `Observation enregistrée avec ${strippedOfflineMedia.join(' et ')} conservé(e) localement. L'envoi se fera automatiquement en ligne.`, 7000);
            }

            if (addAnother) {
                resetForNextEntry();
                onToast('success', 'Observation enregistrée. Ajoutez la suivante (même lieu et date conservés).');
            }
        } catch (error) {
            logger.error("Erreur lors de l'envoi:", error);
            onToast('error', `Échec de l'enregistrement. ${mapUserFacingError(error)}`);
        } finally {
            setIsUploading(false);
        }
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        void performSave(false);
    };

    const inputClass = "w-full p-3 bg-nature-beige dark:bg-black/20 border-none rounded-xl focus:ring-2 focus:ring-nature-green transition-all dark:text-white placeholder-gray-400";
    const labelClass = "block text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-2 ml-1";
    const errorClass = "text-red-500 text-xs mt-1 ml-1";
    const buttonClass = "px-6 py-3 rounded-full shadow-ios font-semibold text-white transition-all duration-300 transform hover:scale-105 active:scale-95";
    const primaryButtonClass = `${buttonClass} bg-nature-green hover:bg-green-600`;
    const secondaryButtonClass = `${buttonClass} bg-gray-400 hover:bg-gray-500`;
    const addAnotherButtonClass = "px-5 py-3 rounded-full font-semibold border-2 border-nature-green text-nature-green dark:text-green-400 dark:border-green-500 hover:bg-nature-green/10 transition-all duration-300 transform hover:scale-105 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed";

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
                                        role="combobox"
                                        aria-expanded={showSuggestions && speciesSuggestions.length > 0}
                                        aria-controls="species-suggestions-listbox"
                                        aria-autocomplete="list"
                                        aria-activedescendant={activeSuggestionIndex >= 0 ? `species-suggestion-${activeSuggestionIndex}` : undefined}
                                        value={formData.speciesName}
                                        onChange={handleChange}
                                        onKeyDown={handleSpeciesNameKeyDown}
                                        onFocus={() => {
                                            if (speciesSuggestions.length > 0) {
                                                setShowSuggestions(true);
                                            }
                                        }}
                                        onBlur={() => {
                                            setShowSuggestions(false);
                                        }}
                                        className={inputClass}
                                        required
                                        autoComplete="off"
                                        placeholder="Nom commun"
                                        aria-invalid={!!errors.speciesName}
                                        aria-describedby={errors.speciesName ? 'speciesName-error' : undefined}
                                    />
                                    {showSuggestions && speciesSuggestions.length > 0 && (
                                        <ul id="species-suggestions-listbox" className="absolute z-30 mt-1 w-full rounded-xl border border-gray-200 bg-white shadow-lg max-h-64 overflow-y-auto dark:border-white/10 dark:bg-nature-dark-surface" role="listbox" aria-label="Suggestions espèces">
                                            {speciesSuggestions.map((suggestion, index) => (
                                                <li key={`${suggestion.source}-${suggestion.latinName}-${index}`} id={`species-suggestion-${index}`} role="option" aria-selected={index === activeSuggestionIndex}>
                                                    <button
                                                        type="button"
                                                        tabIndex={-1}
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
                                            {speciesSuggestions.length > 5 && (
                                                <li className="sticky bottom-0 h-4 bg-gradient-to-t from-white dark:from-nature-dark-surface pointer-events-none" aria-hidden="true" />
                                            )}
                                        </ul>
                                    )}
                                </div>
                                <p className="text-xs text-gray-500 mt-1 ml-1">Exemple: Mésange charbonnière</p>
                                {errors.speciesName && <p id="speciesName-error" role="alert" className={errorClass}>{errors.speciesName}</p>}
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
                                <div role="radiogroup" aria-label="Groupe taxonomique" className="flex flex-wrap gap-3 pt-2">
                                    {Object.entries(TAXON_LOGOS).map(([group, logoPath]) => (
                                        logoPath && (
                                            <button
                                                type="button"
                                                role="radio"
                                                aria-checked={formData.taxonomicGroup === group}
                                                aria-label={group}
                                                key={group}
                                                onClick={() => {
                                                    setFieldTouched(prev => ({ ...prev, taxonomicGroup: true }));
                                                    setFormData(prev => ({ ...prev, taxonomicGroup: group as TaxonomicGroup }));
                                                }}
                                                className={`p-2 rounded-full transition-all duration-300 transform hover:scale-110 relative ${formData.taxonomicGroup === group ? 'bg-nature-green ring-4 ring-nature-green/20 shadow-lg scale-110 border-b-4 border-nature-green' : 'bg-nature-beige dark:bg-white/10 hover:bg-gray-200 dark:hover:bg-white/20 grayscale hover:grayscale-0'}`}
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
                                <input type="date" id="date" name="date" value={formData.date} onChange={handleChange} className={inputClass} required aria-invalid={!!errors.date} aria-describedby={errors.date ? 'date-error' : undefined} />
                                {errors.date && <p id="date-error" role="alert" className={errorClass}>{errors.date}</p>}
                            </div>
                            <div className="lg:col-span-1">
                                <label htmlFor="time" className={labelClass}>Heure</label>
                                <input type="time" id="time" name="time" value={formData.time} onChange={handleChange} className={inputClass} />
                            </div>
                            <div className="lg:col-span-1">
                                <label htmlFor="count" className={labelClass}>Nombre d'individus</label>
                                <input type="number" id="count" name="count" value={formData.count} onChange={handleChange} onBlur={() => handleCountBlur('count')} min="1" className={inputClass} aria-invalid={!!errors.count} aria-describedby={errors.count ? 'count-error' : undefined} />
                                {errors.count && <p id="count-error" role="alert" className={errorClass}>{errors.count}</p>}
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
                                            aria-invalid={!!errors.maleCount}
                                            aria-describedby={errors.maleCount ? 'maleCount-error' : undefined}
                                        />
                                        {errors.maleCount && <p id="maleCount-error" role="alert" className={errorClass}>{errors.maleCount}</p>}
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
                                            aria-invalid={!!errors.femaleCount}
                                            aria-describedby={errors.femaleCount ? 'femaleCount-error' : undefined}
                                        />
                                        {errors.femaleCount && <p id="femaleCount-error" role="alert" className={errorClass}>{errors.femaleCount}</p>}
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
                                            aria-invalid={!!errors.unidentifiedCount}
                                            aria-describedby={errors.unidentifiedCount ? 'unidentifiedCount-error' : undefined}
                                        />
                                        {errors.unidentifiedCount && <p id="unidentifiedCount-error" role="alert" className={errorClass}>{errors.unidentifiedCount}</p>}
                                    </div>
                                </div>
                                {(() => {
                                    const hasAny = formData.maleCount !== '' || formData.femaleCount !== '' || formData.unidentifiedCount !== '';
                                    if (!hasAny) return <p className="text-xs text-gray-500 mt-2 ml-1">Si tu renseignes la répartition, la somme doit être égale au total.</p>;
                                    const total = Number(formData.count);
                                    const sum = (Number(formData.maleCount) || 0) + (Number(formData.femaleCount) || 0) + (Number(formData.unidentifiedCount) || 0);
                                    if (Number.isInteger(total) && total >= 1 && sum !== total) {
                                        return <p className={errorClass}>Répartition ({sum}) ≠ total ({total}). La somme mâle + femelle + non identifié doit être égale au total.</p>;
                                    }
                                    return <p className="text-xs text-gray-500 mt-2 ml-1">Si tu renseignes la répartition, la somme doit être égale au total.</p>;
                                })()}
                                {errors.countBreakdown && <p id="countBreakdown-error" role="alert" className={errorClass}>{errors.countBreakdown}</p>}
                            </div>
                        </FormSection>

                        <FormSection title="Localisation">
                            <div className="col-span-full">
                                <button type="button" onClick={() => setShowMap(!showMap)} className={`w-full py-3 px-6 rounded-xl font-semibold text-white transition-all duration-300 transform hover:scale-[1.02] active:scale-95 shadow-md ${showMap ? 'bg-gray-500 hover:bg-gray-600' : 'bg-nature-green hover:bg-green-600 animate-pulse-once'}`}>
                                    {showMap ? 'Masquer la carte' : <><span aria-hidden="true">📍</span> Localiser sur la carte (recommandé)</>}
                                </button>
                                {showMap && (
                                    <div className="mt-4 rounded-2xl overflow-hidden shadow-inner ring-1 ring-black/5">
                                        <Suspense fallback={<div className="p-4 text-sm text-gray-500">Chargement de la carte...</div>}>
                                            <MapInput onLocationChange={handleLocationChange} onToast={onToast} />
                                        </Suspense>
                                    </div>
                                )}
                            </div>
                            <div className="col-span-full">
                                <button
                                    type="button"
                                    onClick={() => setShowAdvancedLocation(!showAdvancedLocation)}
                                    className="text-sm font-medium text-nature-green-text hover:text-green-600 transition-colors flex items-center gap-1"
                                >
                                    <svg className={`w-4 h-4 transition-transform ${showAdvancedLocation ? 'rotate-90' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" /></svg>
                                    {showAdvancedLocation ? 'Masquer les détails avancés' : 'Afficher les détails avancés'}
                                </button>
                            </div>
                            {showAdvancedLocation && (
                                <>
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
                                        <input type="number" step="any" id="lat" name="lat" value={formData.gps.lat ?? ''} onChange={handleChange} className={inputClass} aria-invalid={!!errors.lat} aria-describedby={errors.lat ? 'lat-error' : undefined} />
                                        {errors.lat && <p id="lat-error" role="alert" className={errorClass}>{errors.lat}</p>}
                                    </div>
                                    <div>
                                        <label htmlFor="lon" className={labelClass}>Longitude</label>
                                        <input type="number" step="any" id="lon" name="lon" value={formData.gps.lon ?? ''} onChange={handleChange} className={inputClass} aria-invalid={!!errors.lon} aria-describedby={errors.lon ? 'lon-error' : undefined} />
                                        {errors.lon && <p id="lon-error" role="alert" className={errorClass}>{errors.lon}</p>}
                                    </div>
                                    <div>
                                        <label htmlFor="altitude" className={labelClass}>Altitude (m)</label>
                                        <input type="number" id="altitude" name="altitude" value={formData.altitude ?? ''} onChange={handleChange} className={inputClass} />
                                    </div>
                                </>
                            )}
                        </FormSection>

                        <FormSection title="Détails">
                            <div>
                                <label htmlFor="status" className={labelClass}>
                                    Statut
                                    <FieldTooltip text="Statut de conservation IUCN. Laissez « NE » (Non Évalué) si vous ne savez pas. Le statut est détecté automatiquement pour les espèces connues." />
                                </label>
                                <select id="status" name="status" value={formData.status} onChange={handleChange} className={`${inputClass} appearance-none cursor-pointer`}>
                                    {Object.values(Status).map(s => <option key={s} value={s}>{s}</option>)}
                                </select>
                                {isFetchingInfo && (
                                    <p className="text-xs text-gray-400 mt-1 ml-1 flex items-center gap-1">
                                        <svg className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                                        Recherche du statut...
                                    </p>
                                )}
                                {!isFetchingInfo && speciesInfo?.redListStatus && (
                                    <p className="text-xs text-gray-500 mt-1 ml-1">
                                        {speciesInfo.redListSource === 'france' ? 'Liste Rouge France' : 'IUCN mondial'}: <span className="font-semibold">{speciesInfo.redListStatus}</span>
                                    </p>
                                )}
                                {!isFetchingInfo && speciesInfo && !speciesInfo.redListStatus && (
                                    <p className="text-xs text-gray-400 mt-1 ml-1 italic">Statut non trouvé automatiquement</p>
                                )}
                            </div>
                            <div>
                                <label htmlFor="protocol" className={labelClass}>
                                    Protocole
                                    <FieldTooltip text="Protocole scientifique de suivi (STOC-EPS, EPOC, Wetlands, battage, fauchage…). Choisissez « Opportuniste » pour une observation classique." />
                                </label>
                                <select id="protocol" name="protocol" value={formData.protocol} onChange={handleChange} className={`${inputClass} appearance-none cursor-pointer`}>
                                    {Object.values(Protocol).map(p => <option key={p} value={p}>{p}</option>)}
                                </select>
                            </div>
                            <div className="col-span-full">
                                <button
                                    type="button"
                                    onClick={() => setShowAdvancedDetails(!showAdvancedDetails)}
                                    className="text-sm font-medium text-nature-green-text hover:text-green-600 transition-colors flex items-center gap-1"
                                >
                                    <svg className={`w-4 h-4 transition-transform ${showAdvancedDetails ? 'rotate-90' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" /></svg>
                                    {showAdvancedDetails ? 'Masquer les détails avancés' : 'Afficher les détails avancés'}
                                </button>
                            </div>
                            {showAdvancedDetails && (
                                <>
                                    <div>
                                        <label htmlFor="atlasCode" className={labelClass}>
                                            Code atlas
                                            <FieldTooltip text="Indice de nidification (codes atlas EBCC, Atlas des Oiseaux de France). Indiquez l'indice le plus élevé constaté pour l'espèce sur le site (ex. 15 = nid avec œufs). Laissez vide si non pertinent." />
                                        </label>
                                        <select id="atlasCode" name="atlasCode" value={formData.atlasCode} onChange={handleChange} className={`${inputClass} appearance-none cursor-pointer`}>
                                            <option value="">— Non concerné —</option>
                                            {formData.atlasCode !== '' && !isKnownAtlasCode(formData.atlasCode) && (
                                                <optgroup label="Valeur actuelle">
                                                    <option value={formData.atlasCode}>{formData.atlasCode}</option>
                                                </optgroup>
                                            )}
                                            {ATLAS_CODE_GROUPS.map(group => (
                                                <optgroup key={group.level} label={group.level}>
                                                    {group.options.map(option => (
                                                        <option key={option.code} value={option.code}>{option.code} — {option.label}</option>
                                                    ))}
                                                </optgroup>
                                            ))}
                                        </select>
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
                                    <div className="lg:col-span-3">
                                        <label htmlFor="weather" className={labelClass}>Conditions météo</label>
                                        <select id="weather" name="weather" value={formData.weather} onChange={handleChange} className={`${inputClass} appearance-none cursor-pointer`}>
                                            {Object.values(WeatherCondition).map(w => <option key={w} value={w}>{w}</option>)}
                                        </select>
                                    </div>
                                </>
                            )}
                        </FormSection>

                        <FormSection title="Contexte écologique">
                            <div>
                                <label htmlFor="habitat" className={labelClass}>Habitat</label>
                                <select id="habitat" name="habitat" value={formData.habitat ?? Habitat.UNKNOWN} onChange={handleChange} className={`${inputClass} appearance-none cursor-pointer`}>
                                    {Object.values(Habitat).map(h => <option key={h} value={h}>{h}</option>)}
                                </select>
                            </div>
                            <div>
                                <label htmlFor="phenology" className={labelClass}>Phénologie</label>
                                <select id="phenology" name="phenology" value={formData.phenology ?? Phenology.UNKNOWN} onChange={handleChange} className={`${inputClass} appearance-none cursor-pointer`}>
                                    {Object.values(Phenology).map(p => <option key={p} value={p}>{p}</option>)}
                                </select>
                            </div>
                            <div className="md:col-span-2 lg:col-span-3">
                                <label htmlFor="observerInput" className={labelClass}>Observateurs associés</label>
                                <div className="flex gap-2">
                                    <input
                                        type="text"
                                        id="observerInput"
                                        value={observerInput}
                                        onChange={(e) => setObserverInput(e.target.value)}
                                        onKeyDown={(e) => {
                                            if (e.key === 'Enter') {
                                                e.preventDefault();
                                                addObservers(observerInput);
                                            }
                                        }}
                                        placeholder="Ex: Jean Dupont (séparer par virgule ou Entrée)"
                                        className={inputClass}
                                    />
                                    <button
                                        type="button"
                                        onClick={() => addObservers(observerInput)}
                                        className="px-4 py-2 rounded-full bg-nature-green/10 text-nature-green-text font-semibold hover:bg-nature-green/20 transition"
                                    >
                                        Ajouter
                                    </button>
                                </div>
                                {formData.observers && formData.observers.length > 0 && (
                                    <div className="mt-3 flex flex-wrap gap-2">
                                        {formData.observers.map(name => (
                                            <span key={name} className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-nature-green/20 text-nature-green-text text-sm">
                                                {name}
                                                <button
                                                    type="button"
                                                    onClick={() => removeObserver(name)}
                                                    aria-label={`Retirer ${name}`}
                                                    className="ml-1 w-4 h-4 inline-flex items-center justify-center rounded-full hover:bg-nature-green/30"
                                                >
                                                    ×
                                                </button>
                                            </span>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </FormSection>

                        <FormSection title="Média et Notes">
                            <div className="md:col-span-3">
                                <label htmlFor="comment" className={labelClass}>Commentaire</label>
                                <textarea id="comment" name="comment" value={formData.comment} onChange={handleChange} rows={4} className={inputClass}></textarea>
                            </div>
                            <div>
                                <label htmlFor="photo" className={labelClass}>Photo (perso)</label>
                                <input type="file" id="photo" name="photo" accept="image/*" onChange={handleFileChange} className="block w-full text-sm text-gray-500 file:mr-4 file:py-2.5 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-nature-green/10 file:text-nature-green-text hover:file:bg-nature-green/20 transition cursor-pointer" />
                                {formData.photo && <img src={formData.photo} alt="Aperçu" className="mt-4 h-32 w-32 object-cover rounded-2xl shadow-md ring-1 ring-black/5" />}
                            </div>
                            <div className={formData.sound ? '' : 'opacity-50 pointer-events-none'}>
                                <label className={labelClass}>Son</label>
                                {formData.sound ? (
                                    <audio controls src={formData.sound} className="mt-2 w-full rounded-full shadow-sm"></audio>
                                ) : (
                                    <p className="text-xs text-gray-400 italic mt-1">Enregistrement sonore — bientôt disponible</p>
                                )}
                            </div>
                        </FormSection>
                    </div>

                    {/* Sidebar for Species Info */}
                    <div className="lg:col-span-1">
                        <div className="bg-white/80 dark:bg-nature-dark-surface/80 p-6 rounded-3xl shadow-ios border border-white/20 dark:border-white/5 sticky top-6 backdrop-blur-xl">
                            <div className="flex items-center justify-between mb-4 pb-2 border-b border-gray-100 dark:border-white/5">
                                <h3 className="text-xl font-bold text-nature-dark dark:text-white">Informations Espèce</h3>
                                {lookupKey.trim().length > 2 && (
                                    <button
                                        type="button"
                                        onClick={handleRefreshSpeciesInfo}
                                        disabled={isFetchingInfo}
                                        className="text-xs font-medium text-nature-green-text hover:text-green-600 disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1 transition-colors"
                                        title="Forcer un rafraîchissement depuis iNaturalist / GBIF / Wikipedia (ignore le cache local)"
                                        aria-label="Rafraîchir les informations de l'espèce"
                                    >
                                        <svg xmlns="http://www.w3.org/2000/svg" className={`w-4 h-4 ${isFetchingInfo ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                                        </svg>
                                        <span>Rafraîchir</span>
                                    </button>
                                )}
                            </div>
                            {speciesInfo ? (
                                <div className="space-y-4 animate-fadeIn">
                                    {speciesInfo.imageUrl && isSafeImageUrl(speciesInfo.imageUrl) && (
                                        <img src={speciesInfo.imageUrl} alt={formData.speciesName} className="w-full h-48 object-cover rounded-2xl shadow-sm" />
                                    )}
                                    <h4 className="font-bold text-lg text-nature-dark dark:text-white">{formData.speciesName}</h4>
                                    <p className="text-sm text-gray-600 dark:text-gray-300 leading-relaxed max-h-60 overflow-y-auto scrollbar-thin scrollbar-thumb-nature-green scrollbar-track-transparent pr-2">
                                        {speciesInfo.description}
                                    </p>
                                    {speciesInfo.sourceUrl && (
                                        <a href={speciesInfo.sourceUrl} target="_blank" rel="noopener noreferrer" className="text-xs font-medium text-nature-green-text hover:text-green-600 block mt-2">
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

                <div ref={bottomButtonsRef} className={`flex flex-wrap justify-end gap-3 pt-6 border-t border-gray-100 dark:border-white/5 ${showStickyBar ? 'invisible' : ''}`}>
                    <button type="button" onClick={onCancel} className={secondaryButtonClass}>Annuler</button>
                    {!initialData && (
                        <button type="button" onClick={() => void performSave(true)} disabled={isUploading || isFetchingInfo} className={addAnotherButtonClass}>
                            {isUploading ? 'Envoi...' : 'Enregistrer et ajouter une autre'}
                        </button>
                    )}
                    <button type="submit" disabled={isUploading || isFetchingInfo} className={`${primaryButtonClass} ${isUploading || isFetchingInfo ? 'opacity-50 cursor-not-allowed' : ''}`}>
                        {isUploading ? 'Envoi...' : isFetchingInfo ? 'Recherche du statut...' : 'Sauvegarder'}
                    </button>
                </div>
            </form>

            {/* Sticky Save/Cancel Bar */}
            {
                showStickyBar && (
                    <div className="fixed bottom-0 left-0 right-0 z-40 px-4 py-3 bg-white/80 dark:bg-nature-dark-surface/80 backdrop-blur-md border-t border-gray-200/50 dark:border-white/10 shadow-[0_-4px_20px_rgba(0,0,0,0.1)] flex flex-wrap justify-end gap-3">
                        <button type="button" onClick={onCancel} className={secondaryButtonClass}>Annuler</button>
                        {!initialData && (
                            <button type="button" onClick={() => void performSave(true)} disabled={isUploading || isFetchingInfo} className={addAnotherButtonClass}>
                                {isUploading ? 'Envoi...' : 'Enregistrer et ajouter une autre'}
                            </button>
                        )}
                        <button type="button" onClick={() => bottomButtonsRef.current?.closest('form')?.requestSubmit()} disabled={isUploading || isFetchingInfo} className={`${primaryButtonClass} ${isUploading || isFetchingInfo ? 'opacity-50 cursor-not-allowed' : ''}`}>
                            {isUploading ? 'Envoi...' : isFetchingInfo ? 'Recherche du statut...' : 'Sauvegarder'}
                        </button>
                    </div>
                )
            }
        </>
    );
};

export default ObservationForm;
