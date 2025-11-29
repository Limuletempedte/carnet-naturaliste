import React, { useState, useEffect } from 'react';
import MapInput from './MapInput';
import { TAXON_LOGOS } from '../constants';
import { Observation, TaxonomicGroup, Status, Protocol, Sexe, Age, ObservationCondition, Comportement } from '../types';
import { fetchSpeciesInfo, SpeciesInfo } from '../services/speciesService';
import { fetchAltitude } from '../services/locationService';
import { compressImage } from '../utils/imageUtils';
import { uploadPhoto } from '../services/storageService';

interface ObservationFormProps {
    onSave: (observation: Observation) => void;
    onCancel: () => void;
    initialData: Observation | null;
}

const FormSection: React.FC<{ title: string, children: React.ReactNode }> = ({ title, children }) => (
    <div className="bg-white/80 dark:bg-nature-dark-surface/80 p-6 rounded-lg shadow-md">
        <h3 className="text-xl font-serif font-bold text-nature-dark dark:text-white mb-4 border-b-2 border-nature-green/30 pb-2">{title}</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {children}
        </div>
    </div>
);

const ObservationForm: React.FC<ObservationFormProps> = ({ onSave, onCancel, initialData }) => {
    const [formData, setFormData] = useState<Omit<Observation, 'id'>>({
        speciesName: '',
        latinName: '',
        taxonomicGroup: TaxonomicGroup.BIRD,
        date: new Date().toISOString().split('T')[0],
        time: new Date().toTimeString().substring(0, 5),
        count: 1,
        location: '',
        gps: { lat: null, lon: null },
        municipality: '',
        department: '',
        country: 'France',
        altitude: null,
        comment: '',
        status: Status.LC,
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
    const [errors, setErrors] = useState<Record<string, string>>({});
    const [showMap, setShowMap] = useState(false);
    const [speciesInfo, setSpeciesInfo] = useState<SpeciesInfo | null>(null);
    const [isFetchingInfo, setIsFetchingInfo] = useState(false);
    const [photoFile, setPhotoFile] = useState<Blob | null>(null);
    const [isUploading, setIsUploading] = useState(false);

    useEffect(() => {
        if (initialData) {
            setFormData({ ...initialData });
        }
    }, [initialData]);

    // Debounce fetching species info
    useEffect(() => {
        const fetchInfo = async () => {
            if (formData.speciesName.length > 2) {
                setIsFetchingInfo(true);
                const info = await fetchSpeciesInfo(formData.speciesName);
                setSpeciesInfo(info);
                setIsFetchingInfo(false);

                // Auto-fill latin name, wikipedia image, and taxonomic group if found
                if (info) {
                    setFormData(prev => ({
                        ...prev,
                        latinName: info.latinName || prev.latinName,
                        wikipediaImage: info.imageUrl || undefined,
                        taxonomicGroup: info.taxonomicGroup || prev.taxonomicGroup
                    }));
                }
            } else {
                setSpeciesInfo(null);
            }
        };

        const timeoutId = setTimeout(fetchInfo, 1000);
        return () => clearTimeout(timeoutId);
    }, [formData.speciesName]);


    const handleLocationChange = async (lat: number, lon: number, municipality: string, location: string, department: string) => {
        setFormData(prev => ({
            ...prev,
            gps: { lat, lon },
            municipality,
            location,
            department
        }));

        // Fetch altitude automatically
        const altitude = await fetchAltitude(lat, lon);
        if (altitude !== null) {
            setFormData(prev => ({ ...prev, altitude }));
        }
    };

    const validate = () => {
        const newErrors: Record<string, string> = {};
        if (!formData.speciesName) newErrors.speciesName = "Le nom de l'espèce est obligatoire.";
        if (!formData.date) newErrors.date = "La date est obligatoire.";
        if (formData.count < 1) newErrors.count = "Le nombre doit être au moins 1.";
        if (formData.gps.lat && (formData.gps.lat < -90 || formData.gps.lat > 90)) newErrors.lat = "La latitude doit être entre -90 et 90.";
        if (formData.gps.lon && (formData.gps.lon < -180 || formData.gps.lon > 180)) newErrors.lon = "La longitude doit être entre -180 et 180.";
        setErrors(newErrors);
        return Object.keys(newErrors).length === 0;
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
        } else if (name === 'count' || name === 'altitude') {
            setFormData(prev => ({ ...prev, [name]: value === '' ? null : parseInt(value, 10) }));
        } else {
            setFormData(prev => ({ ...prev, [name]: value }));
        }
    };

    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const { name, files } = e.target;
        if (files && files[0] && name === 'photo') {
            try {
                const compressedBlob = await compressImage(files[0]);
                setPhotoFile(compressedBlob);

                // Create preview URL
                const previewUrl = URL.createObjectURL(compressedBlob);
                setFormData(prev => ({ ...prev, photo: previewUrl }));
            } catch (error) {
                console.error("Erreur lors de la compression:", error);
                alert("Impossible de traiter l'image.");
            }
        } else if (files && files[0] && name === 'sound') {
            // Handle sound as before (base64 for now, or implement upload later)
            const reader = new FileReader();
            reader.onload = (event) => {
                const target = event.target;
                if (target && typeof target.result === 'string') {
                    setFormData(prev => ({ ...prev, [name]: target.result }));
                }
            };
            reader.readAsDataURL(files[0]);
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!validate()) {
            return;
        }

        setIsUploading(true);
        let photoUrl = formData.photo;

        try {
            if (photoFile) {
                photoUrl = await uploadPhoto(photoFile);
            }

            const observationToSave: Observation = {
                id: initialData?.id || Date.now().toString(),
                ...formData,
                photo: photoUrl,
                count: Number(formData.count),
                altitude: formData.altitude ? Number(formData.altitude) : null,
                gps: {
                    lat: formData.gps.lat ? Number(formData.gps.lat) : null,
                    lon: formData.gps.lon ? Number(formData.gps.lon) : null,
                },
                sexe: formData.sexe,
                age: formData.age,
                observationCondition: formData.observationCondition,
                comportement: formData.comportement,
            };
            onSave(observationToSave);
        } catch (error) {
            console.error("Erreur lors de l'envoi:", error);
            alert("Erreur lors de l'envoi de l'observation (Photo ou Données).");
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
        <form onSubmit={handleSubmit} className="bg-white/80 dark:bg-nature-dark-surface/80 backdrop-blur-xl rounded-3xl shadow-ios border border-white/20 dark:border-white/5 p-4 md:p-8 space-y-8 animate-fadeIn">
            <h2 className="text-3xl font-bold tracking-tight text-nature-dark dark:text-white mb-6 text-center">{initialData ? 'Modifier' : 'Ajouter'} une observation</h2>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                <div className="lg:col-span-2 space-y-8">
                    <FormSection title="Identification">
                        <div className="lg:col-span-1">
                            <label htmlFor="speciesName" className={labelClass}>Nom de l'espèce *</label>
                            <input type="text" id="speciesName" name="speciesName" value={formData.speciesName} onChange={handleChange} className={inputClass} required placeholder="Ex: Mésange charbonnière" />
                            {errors.speciesName && <p className={errorClass}>{errors.speciesName}</p>}
                            {isFetchingInfo && <p className="text-xs text-gray-500 mt-1 ml-1">Recherche d'infos...</p>}
                        </div>
                        <div className="lg:col-span-1">
                            <label htmlFor="latinName" className={labelClass}>Nom latin</label>
                            <input type="text" id="latinName" name="latinName" value={formData.latinName} onChange={handleChange} className={inputClass} />
                        </div>
                        <div className="lg:col-span-1 row-span-2">
                            <label className={labelClass}>Groupe taxonomique</label>
                            <div className="flex flex-wrap gap-3 pt-2">
                                {Object.entries(TAXON_LOGOS).map(([group, logoPath]) => (
                                    logoPath && (
                                        <button
                                            type="button"
                                            key={group}
                                            onClick={() => setFormData(prev => ({ ...prev, taxonomicGroup: group as TaxonomicGroup }))}
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
                            <input type="number" id="count" name="count" value={formData.count} onChange={handleChange} min="1" className={inputClass} />
                            {errors.count && <p className={errorClass}>{errors.count}</p>}
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
                                    <MapInput onLocationChange={handleLocationChange} />
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
                            <label htmlFor="sound" className={labelClass}>Son</label>
                            <input type="file" id="sound" name="sound" accept="audio/*" onChange={handleFileChange} className="block w-full text-sm text-gray-500 file:mr-4 file:py-2.5 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-nature-green/10 file:text-nature-green hover:file:bg-nature-green/20 transition cursor-pointer" />
                            {formData.sound && <audio controls src={formData.sound} className="mt-4 w-full rounded-full shadow-sm"></audio>}
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
                                <a href={speciesInfo.sourceUrl} target="_blank" rel="noopener noreferrer" className="text-xs font-medium text-nature-green hover:text-green-600 block mt-2">
                                    Voir sur Wikipédia →
                                </a>
                            </div>
                        ) : (
                            <div className="text-center text-gray-500 dark:text-gray-400 py-8">
                                <p>Entrez un nom d'espèce pour voir les informations.</p>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            <div className="flex justify-end space-x-4 pt-6 border-t border-gray-100 dark:border-white/5">
                <button type="button" onClick={onCancel} className={secondaryButtonClass}>Annuler</button>
                <button type="submit" disabled={isUploading} className={`${primaryButtonClass} ${isUploading ? 'opacity-50 cursor-not-allowed' : ''}`}>
                    {isUploading ? 'Envoi...' : 'Sauvegarder'}
                </button>
            </div>
        </form>
    );
};

export default ObservationForm;
