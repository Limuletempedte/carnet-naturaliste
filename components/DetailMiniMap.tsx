import React, { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// Fix for default marker icon (Vite breaks the default paths)
import icon from 'leaflet/dist/images/marker-icon.png';
import iconShadow from 'leaflet/dist/images/marker-shadow.png';

const DefaultIcon = L.icon({
    iconUrl: icon,
    shadowUrl: iconShadow,
    iconSize: [25, 41],
    iconAnchor: [12, 41]
});

L.Marker.prototype.options.icon = DefaultIcon;

interface DetailMiniMapProps {
    lat: number;
    lon: number;
    speciesName: string;
}

// EE-2 : mini-carte non interactive de la vue lecture seule — un seul marqueur,
// aucun zoom/déplacement possible (la consultation ne doit rien pouvoir modifier).
const DetailMiniMap: React.FC<DetailMiniMapProps> = ({ lat, lon, speciesName }) => {
    const mapContainerRef = useRef<HTMLDivElement>(null);
    const mapRef = useRef<L.Map | null>(null);

    useEffect(() => {
        if (!mapContainerRef.current || mapRef.current) return;

        const map = L.map(mapContainerRef.current, {
            dragging: false,
            scrollWheelZoom: false,
            doubleClickZoom: false,
            boxZoom: false,
            keyboard: false,
            touchZoom: false,
            zoomControl: false,
            attributionControl: true
        }).setView([lat, lon], 13);
        mapRef.current = map;

        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
            maxZoom: 19
        }).addTo(map);

        L.marker([lat, lon], { alt: speciesName, keyboard: false, interactive: false }).addTo(map);

        // Fix gray map issue (même parade que MapInput)
        const timer = setTimeout(() => {
            mapRef.current?.invalidateSize();
        }, 200);

        return () => {
            clearTimeout(timer);
            map.off();
            map.remove();
            mapRef.current = null;
        };
    }, [lat, lon, speciesName]);

    return (
        <div
            ref={mapContainerRef}
            className="h-48 sm:h-64 w-full rounded-2xl overflow-hidden ring-1 ring-black/5 dark:ring-white/10"
            role="img"
            aria-label={`Carte de localisation de l'observation de ${speciesName}`}
        />
    );
};

export default DetailMiniMap;
