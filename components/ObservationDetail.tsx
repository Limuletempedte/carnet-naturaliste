import React, { lazy, Suspense, useEffect, useState } from 'react';
import { Observation } from '../types';
import { TAXON_LOGOS } from '../constants';
import { isoToFrDisplay } from '../utils/dateUtils';
import { isSafeImageUrl } from '../utils/urlUtils';
import { formatAtlasCode } from '../utils/atlasCodes';
import { fetchSpeciesInfo, SpeciesInfo } from '../services/speciesService';
import { ChevronLeftIcon, PawIcon, PencilIcon, TrashIcon } from './icons';

// Leaflet chargé uniquement si la vue détail affiche une carte (GPS présent).
const DetailMiniMap = lazy(() => import('./DetailMiniMap'));

interface ObservationDetailProps {
    observation: Observation;
    onBack: () => void;
    onEdit: (id: string) => void;
    onDelete: (id: string) => void;
    isMobileView?: boolean;
}

const NOT_PROVIDED = 'Non renseigné';

// Vrai si la valeur mérite d'être affichée (masque le vide et « Non renseigné »).
const isMeaningful = (value: string | null | undefined): value is string =>
    value != null && value.trim() !== '' && value.trim() !== NOT_PROVIDED;

const getStatusBadgeClass = (status: string): string => {
    switch (status) {
        case 'LC': return 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300';
        case 'NT': return 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300';
        case 'VU': return 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300';
        case 'EN':
        case 'CR': return 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300';
        default: return 'bg-gray-100 text-gray-600 dark:bg-gray-800/30 dark:text-gray-400';
    }
};

// Un champ « libellé + valeur » ; ne rend rien si la valeur est vide / non renseignée.
const DetailField: React.FC<{ label: string; value?: string | null }> = ({ label, value }) => {
    if (!isMeaningful(value)) return null;
    return (
        <div>
            <dt className="text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">{label}</dt>
            <dd className="mt-1 text-sm text-gray-800 dark:text-gray-200">{value}</dd>
        </div>
    );
};

const DetailSection: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
    <section className="bg-white/80 dark:bg-nature-dark-surface/80 backdrop-blur-xl rounded-3xl shadow-ios border border-white/20 dark:border-white/5 p-6">
        <h3 className="text-lg font-bold text-nature-dark dark:text-white mb-4 pb-2 border-b border-gray-100 dark:border-white/5">{title}</h3>
        {children}
    </section>
);

// EE-2 : vue lecture seule d'une observation. Aucune donnée modifiable ici :
// la modification passe par le bouton « Modifier » (formulaire) explicite.
const ObservationDetail: React.FC<ObservationDetailProps> = ({ observation, onBack, onEdit, onDelete, isMobileView = false }) => {
    const [speciesInfo, setSpeciesInfo] = useState<SpeciesInfo | null>(null);
    const [isLoadingInfo, setIsLoadingInfo] = useState(false);

    useEffect(() => {
        let cancelled = false;
        if (!observation.speciesName.trim()) return;
        setSpeciesInfo(null);
        setIsLoadingInfo(true);
        fetchSpeciesInfo(observation.speciesName)
            .then(info => { if (!cancelled) setSpeciesInfo(info); })
            .catch(() => { /* échec silencieux : la description espèce est un bonus */ })
            .finally(() => { if (!cancelled) setIsLoadingInfo(false); });
        return () => { cancelled = true; };
    }, [observation.speciesName]);

    const rawImageSrc = observation.photo || observation.wikipediaImage;
    const heroImageSrc = rawImageSrc && isSafeImageUrl(rawImageSrc) ? rawImageSrc : undefined;
    const taxonLogo = TAXON_LOGOS[observation.taxonomicGroup];

    const { lat, lon } = observation.gps;
    const hasGps = lat != null && lon != null;
    const gpsLabel = lat != null && lon != null
        ? `${lat.toFixed(5)}, ${lon.toFixed(5)}`
        : undefined;

    // Détail des effectifs par sexe (uniquement les compteurs > 0).
    const countDetailParts: string[] = [];
    if (observation.maleCount && observation.maleCount > 0) {
        countDetailParts.push(`${observation.maleCount} mâle${observation.maleCount > 1 ? 's' : ''}`);
    }
    if (observation.femaleCount && observation.femaleCount > 0) {
        countDetailParts.push(`${observation.femaleCount} femelle${observation.femaleCount > 1 ? 's' : ''}`);
    }
    if (observation.unidentifiedCount && observation.unidentifiedCount > 0) {
        countDetailParts.push(`${observation.unidentifiedCount} indéterminé${observation.unidentifiedCount > 1 ? 's' : ''}`);
    }

    const dateLabel = isMeaningful(observation.time)
        ? `${isoToFrDisplay(observation.date)} à ${observation.time}`
        : isoToFrDisplay(observation.date);

    const observersLabel = observation.observers?.filter(name => name.trim() !== '').join(', ');

    const hasLocationData = isMeaningful(observation.location)
        || isMeaningful(observation.municipality)
        || isMeaningful(observation.department)
        || isMeaningful(observation.country)
        || observation.altitude != null
        || hasGps;

    const formatTimestamp = (iso: string): string => {
        const date = new Date(iso);
        return Number.isNaN(date.getTime()) ? iso : date.toLocaleString('fr-FR');
    };

    // La section espèce n'apparaît que si elle a quelque chose à dire.
    const speciesDescription = speciesInfo?.description;
    const hasSpeciesExtras = isLoadingInfo || isMeaningful(speciesDescription) || Boolean(speciesInfo?.sourceUrl);
    // L'image de l'espèce n'est affichée que si le hero n'a montré que le logo taxon.
    const speciesImageSrc = !heroImageSrc && speciesInfo?.imageUrl && isSafeImageUrl(speciesInfo.imageUrl)
        ? speciesInfo.imageUrl
        : undefined;

    return (
        <div className={`space-y-6 stagger-children ${isMobileView ? 'pb-24' : ''}`}>
            {/* Barre d'actions : pilule de verre, collante sous le header en mobile. */}
            <div className={`liquid-glass liquid-glass-sheen rounded-full px-2.5 py-2 flex items-center justify-between flex-wrap gap-2 ${isMobileView ? 'sticky top-20 z-30' : ''}`}>
                <button
                    type="button"
                    onClick={onBack}
                    className="px-4 py-2.5 text-sm font-medium text-gray-600 dark:text-gray-300 rounded-full hover:bg-white/60 dark:hover:bg-white/10 transition-colors min-h-[44px] inline-flex items-center gap-1.5"
                >
                    <ChevronLeftIcon className="w-4 h-4" /> Retour
                </button>
                <div className="flex gap-2">
                    <button
                        type="button"
                        onClick={() => onEdit(observation.id)}
                        className="px-5 py-2.5 rounded-full shadow-ios font-semibold text-white bg-nature-green hover:bg-green-600 transition-colors min-h-[44px] inline-flex items-center gap-1.5"
                    >
                        <PencilIcon className="w-4 h-4" /> Modifier
                    </button>
                    <button
                        type="button"
                        onClick={() => onDelete(observation.id)}
                        className="px-5 py-2.5 rounded-full font-semibold text-red-500 bg-red-500/10 hover:bg-red-500/20 transition-colors min-h-[44px] inline-flex items-center gap-1.5"
                    >
                        <TrashIcon className="w-4 h-4" /> Supprimer
                    </button>
                </div>
            </div>

            {/* En-tête : photo + identité de l'espèce */}
            <section className="bg-white/80 dark:bg-nature-dark-surface/80 backdrop-blur-xl rounded-3xl shadow-ios border border-white/20 dark:border-white/5 p-6">
                <div className="flex flex-col sm:flex-row gap-6">
                    <div className="w-full sm:w-64 h-48 rounded-2xl overflow-hidden flex-shrink-0 bg-gray-100 dark:bg-black/20 ring-1 ring-black/5 dark:ring-white/10">
                        {heroImageSrc ? (
                            <img src={heroImageSrc} alt={observation.speciesName} className="w-full h-full object-cover" />
                        ) : (
                            <div className="w-full h-full flex items-center justify-center">
                                {taxonLogo
                                    ? <img src={taxonLogo} alt={observation.taxonomicGroup} className="w-20 h-20 opacity-50" />
                                    : <PawIcon className="w-14 h-14 opacity-50 text-gray-500 dark:text-gray-400" />}
                            </div>
                        )}
                    </div>
                    <div className="flex-1 min-w-0">
                        <h2 className="text-2xl font-bold text-nature-dark dark:text-white">{observation.speciesName}</h2>
                        {isMeaningful(observation.latinName) && (
                            <p className="text-sm text-gray-500 dark:text-gray-400 italic mt-1">{observation.latinName}</p>
                        )}
                        <div className="flex flex-wrap items-center gap-2 mt-4">
                            <span className={`text-xs px-3 py-1 rounded-full font-bold ${getStatusBadgeClass(observation.status)}`} title={`Statut de conservation : ${observation.status}`}>
                                {observation.status}
                            </span>
                            <span className="text-xs px-3 py-1 rounded-full font-bold bg-nature-green/10 text-nature-green-text dark:bg-nature-green/20 dark:text-nature-green">
                                {observation.count} individu{observation.count > 1 ? 's' : ''}
                            </span>
                            <span className="text-xs px-3 py-1 rounded-full font-medium bg-gray-100 text-gray-600 dark:bg-gray-800/30 dark:text-gray-300">
                                {observation.taxonomicGroup}
                            </span>
                        </div>
                        <p className="text-sm text-gray-600 dark:text-gray-300 mt-4">
                            {dateLabel}
                        </p>
                    </div>
                </div>
            </section>

            {/* Identification */}
            <DetailSection title="Identification">
                <dl className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <DetailField label="Groupe taxonomique" value={observation.taxonomicGroup} />
                    <DetailField label="Effectif" value={String(observation.count)} />
                    {countDetailParts.length > 0 && (
                        <DetailField label="Détail des effectifs" value={countDetailParts.join(' · ')} />
                    )}
                    <DetailField label="Sexe" value={observation.sexe} />
                    <DetailField label="Âge" value={observation.age} />
                    <DetailField label="Code atlas" value={formatAtlasCode(observation.atlasCode)} />
                    <DetailField label="Phénologie" value={observation.phenology} />
                </dl>
            </DetailSection>

            {/* Lieu */}
            {hasLocationData && (
                <DetailSection title="Lieu">
                    <dl className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
                        <DetailField label="Lieu-dit" value={observation.location} />
                        <DetailField label="Commune" value={observation.municipality} />
                        <DetailField label="Département" value={observation.department} />
                        <DetailField label="Pays" value={observation.country} />
                        <DetailField label="Altitude" value={observation.altitude != null ? `${observation.altitude} m` : undefined} />
                        <DetailField label="Coordonnées GPS" value={gpsLabel} />
                    </dl>
                    {lat != null && lon != null && (
                        <Suspense fallback={<div className="h-48 sm:h-64 w-full rounded-2xl bg-gray-100 dark:bg-black/20 animate-pulse" aria-hidden="true" />}>
                            <DetailMiniMap
                                key={`${lat},${lon}`}
                                lat={lat}
                                lon={lon}
                                speciesName={observation.speciesName}
                            />
                        </Suspense>
                    )}
                </DetailSection>
            )}

            {/* Conditions d'observation */}
            <DetailSection title="Conditions d'observation">
                <dl className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <DetailField label="Date" value={dateLabel} />
                    <DetailField label="Météo" value={observation.weather} />
                    <DetailField label="Habitat" value={observation.habitat} />
                    <DetailField label="Condition d'observation" value={observation.observationCondition} />
                    <DetailField label="Comportement" value={observation.comportement} />
                    <DetailField label="Protocole" value={observation.protocol} />
                    <DetailField label="Observateurs" value={observersLabel} />
                </dl>
            </DetailSection>

            {/* Commentaire */}
            {isMeaningful(observation.comment) && (
                <DetailSection title="Commentaire">
                    <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed whitespace-pre-wrap">{observation.comment}</p>
                </DetailSection>
            )}

            {/* Médias */}
            {observation.sound && (
                <DetailSection title="Son">
                    <audio controls src={observation.sound} className="w-full rounded-full shadow-sm" />
                </DetailSection>
            )}

            {/* À propos de l'espèce */}
            {hasSpeciesExtras && (
                <DetailSection title="À propos de l'espèce">
                    {isLoadingInfo ? (
                        <p className="text-xs text-gray-400 italic">Chargement…</p>
                    ) : (
                        <div className="space-y-4">
                            {speciesImageSrc && (
                                <img src={speciesImageSrc} alt={observation.speciesName} className="w-full h-48 object-cover rounded-2xl shadow-sm" />
                            )}
                            {isMeaningful(speciesDescription) && (
                                <p className="text-sm text-gray-600 dark:text-gray-300 leading-relaxed">{speciesDescription}</p>
                            )}
                            {speciesInfo?.sourceUrl && (
                                <a href={speciesInfo.sourceUrl} target="_blank" rel="noopener noreferrer" className="text-xs font-medium text-nature-green-text hover:text-green-600 block">
                                    Voir la source →
                                </a>
                            )}
                        </div>
                    )}
                </DetailSection>
            )}

            {/* Métadonnées */}
            {(observation.createdAt || observation.updatedAt) && (
                <p className="text-xs text-gray-400 dark:text-gray-500 text-center">
                    {observation.createdAt && <>Créée le {formatTimestamp(observation.createdAt)}</>}
                    {observation.createdAt && observation.updatedAt && ' · '}
                    {observation.updatedAt && <>Modifiée le {formatTimestamp(observation.updatedAt)}</>}
                </p>
            )}
        </div>
    );
};

export default ObservationDetail;
