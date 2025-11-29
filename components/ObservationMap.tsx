import React, { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import 'leaflet.markercluster/dist/MarkerCluster.css';
import 'leaflet.markercluster/dist/MarkerCluster.Default.css';
import 'leaflet.markercluster';
import { Observation } from '../types';
import { TAXON_LOGOS } from '../constants';

// Fix for default marker icon
import icon from 'leaflet/dist/images/marker-icon.png';
import iconShadow from 'leaflet/dist/images/marker-shadow.png';

let DefaultIcon = L.icon({
    iconUrl: icon,
    shadowUrl: iconShadow,
    iconSize: [25, 41],
    iconAnchor: [12, 41]
});

L.Marker.prototype.options.icon = DefaultIcon;

interface ObservationMapProps {
    observations: Observation[];
    isDarkMode: boolean;
    isMobileView?: boolean;
}

const ObservationMap: React.FC<ObservationMapProps> = ({ observations, isDarkMode, isMobileView = false }) => {
    const mapContainerRef = useRef<HTMLDivElement>(null);
    const mapRef = useRef<L.Map | null>(null);
    const markersRef = useRef<L.Marker[]>([]);

    useEffect(() => {
        if (mapContainerRef.current && !mapRef.current) {
            const map = L.map(mapContainerRef.current, {
                zoomControl: false // Disable default zoom control
            }).setView([46.603354, 1.888334], 6);

            // Add zoom control to bottom-right
            L.control.zoom({
                position: 'bottomright'
            }).addTo(map);

            mapRef.current = map;
        }

        if (mapRef.current) {
            // Remove existing tile layers
            mapRef.current.eachLayer((layer) => {
                if (layer instanceof L.TileLayer) {
                    mapRef.current?.removeLayer(layer);
                }
            });

            const tileUrl = isDarkMode
                ? 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png'
                : 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png';

            const attribution = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>';

            L.tileLayer(tileUrl, {
                attribution: attribution,
                subdomains: 'abcd',
                maxZoom: 20
            }).addTo(mapRef.current);
        }

        // Invalidate size to fix display issues when switching tabs
        const timer = setTimeout(() => {
            if (mapRef.current) {
                mapRef.current.invalidateSize();
            }
        }, 200);

        // Use ResizeObserver to handle container resizing robustly
        let resizeObserver: ResizeObserver | null = null;
        if (mapContainerRef.current && mapRef.current) {
            resizeObserver = new ResizeObserver(() => {
                mapRef.current?.invalidateSize();
            });
            resizeObserver.observe(mapContainerRef.current);
        }

        return () => {
            clearTimeout(timer);
            if (resizeObserver) {
                resizeObserver.disconnect();
            }
        };
    }, [isDarkMode]);

    useEffect(() => {
        if (!mapRef.current) return;

        // Clear existing markers
        // markersRef.current.forEach(marker => marker.remove()); // No longer needed as we clear the cluster group
        markersRef.current = [];

        const map = mapRef.current;
        const bounds = L.latLngBounds([]);

        // Initialize Marker Cluster Group
        const markers = L.markerClusterGroup({
            showCoverageOnHover: false,
            maxClusterRadius: 50,
            spiderfyOnMaxZoom: true,
            iconCreateFunction: function (cluster) {
                const count = cluster.getChildCount();
                let c = ' marker-cluster-';
                if (count < 10) {
                    c += 'small';
                } else if (count < 100) {
                    c += 'medium';
                } else {
                    c += 'large';
                }

                // Custom cluster icon styling to match app theme
                return L.divIcon({
                    html: `<div style="background-color: rgba(93, 123, 69, 0.9); color: white; border-radius: 50%; width: 40px; height: 40px; display: flex; align-items: center; justify-content: center; font-weight: bold; border: 2px solid white; box-shadow: 0 4px 6px rgba(0,0,0,0.2);"><span>${count}</span></div>`,
                    className: 'custom-cluster-icon',
                    iconSize: new L.Point(40, 40)
                });
            }
        });

        observations.forEach(obs => {
            if (obs.gps.lat && obs.gps.lon) {
                const logo = TAXON_LOGOS[obs.taxonomicGroup as keyof typeof TAXON_LOGOS];
                const imageSrc = obs.photo || obs.wikipediaImage;

                // Custom icon with taxon logo if available
                let customIcon = DefaultIcon;
                if (logo) {
                    customIcon = L.divIcon({
                        className: 'custom-div-icon',
                        html: `<div style="background-color: white; border-radius: 50%; padding: 2px; border: 2px solid #5D7B45; width: 30px; height: 30px; display: flex; justify-content: center; align-items: center; box-shadow: 0 2px 5px rgba(0,0,0,0.3);">
                                <img src="${logo}" style="width: 20px; height: 20px; object-fit: contain;" />
                               </div>`,
                        iconSize: [30, 30],
                        iconAnchor: [15, 15]
                    }) as L.Icon;
                }

                const marker = L.marker([obs.gps.lat, obs.gps.lon], { icon: customIcon });

                const popupContent = `
                    <div class="min-w-[200px] ${isDarkMode ? 'text-gray-200' : ''}">
                        ${imageSrc ? `<img src="${imageSrc}" alt="${obs.speciesName}" class="w-full h-32 object-cover rounded-t-lg mb-2" />` : ''}
                        <h3 class="font-bold text-lg ${isDarkMode ? 'text-white' : 'text-nature-dark'}">${obs.speciesName}</h3>
                        <p class="text-sm ${isDarkMode ? 'text-gray-400' : 'text-gray-600'} italic">${obs.latinName || ''}</p>
                        <div class="mt-2 text-sm">
                            <p><strong>Date:</strong> ${new Date(obs.date).toLocaleDateString('fr-FR')}</p>
                            <p><strong>Lieu:</strong> ${obs.location || obs.municipality}</p>
                            <p><strong>Nombre:</strong> ${obs.count}</p>
                        </div>
                    </div>
                `;

                marker.bindPopup(popupContent);

                // Hover effect
                marker.on('mouseover', function (this: L.Marker) {
                    this.openPopup();
                });

                markers.addLayer(marker);
                markersRef.current.push(marker);
                bounds.extend([obs.gps.lat, obs.gps.lon]);
            }
        });

        map.addLayer(markers);

        if (markersRef.current.length > 0) {
            map.fitBounds(bounds, { padding: [50, 50] });
        }

        // Cleanup function to remove cluster group when observations change
        return () => {
            map.removeLayer(markers);
        };
    }, [observations, isDarkMode]);

    const [searchQuery, setSearchQuery] = React.useState('');
    const [searchResults, setSearchResults] = React.useState<any[]>([]);
    const [isSearching, setIsSearching] = React.useState(false);

    const handleSearch = async (e: React.FormEvent) => {
        e.preventDefault();
        if (searchQuery.length < 3) return;

        setIsSearching(true);
        try {
            const results = await import('../services/locationService').then(m => m.searchAddress(searchQuery));
            setSearchResults(results);
        } catch (error) {
            console.error(error);
        } finally {
            setIsSearching(false);
        }
    };

    const handleSelectLocation = (result: any) => {
        if (mapRef.current) {
            mapRef.current.flyTo([result.lat, result.lon], 13);
            setSearchResults([]);
            setSearchQuery('');
        }
    };

    const handleLocateMe = () => {
        if ('geolocation' in navigator) {
            navigator.geolocation.getCurrentPosition((position) => {
                const { latitude, longitude } = position.coords;
                if (mapRef.current) {
                    mapRef.current.flyTo([latitude, longitude], 13);
                    L.marker([latitude, longitude], {
                        icon: L.divIcon({
                            className: 'custom-div-icon',
                            html: `<div style="background-color: #007AFF; width: 16px; height: 16px; border-radius: 50%; border: 3px solid white; box-shadow: 0 0 10px rgba(0,122,255,0.5);"></div>`,
                            iconSize: [20, 20],
                            iconAnchor: [10, 10]
                        })
                    }).addTo(mapRef.current).bindPopup("Votre position").openPopup();
                }
            }, (error) => {
                console.error("Erreur de géolocalisation:", error);
                alert("Impossible de vous localiser. Vérifiez vos autorisations.");
            });
        } else {
            alert("La géolocalisation n'est pas supportée par votre navigateur.");
        }
    };

    return (
        <div className={`relative w-full rounded-3xl shadow-ios border border-white/20 dark:border-white/5 overflow-hidden group ${isMobileView ? 'h-[calc(100vh-200px)]' : 'h-[600px]'}`}>
            <div ref={mapContainerRef} className="h-full w-full" />

            {/* Search Overlay */}
            <div className={`absolute top-4 left-4 z-[1000] ${isMobileView ? 'right-4' : 'right-16 max-w-md'}`}>
                <form onSubmit={handleSearch} className="relative">
                    <input
                        type="text"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder="Rechercher..."
                        className="w-full pl-10 pr-4 py-3 bg-white/90 dark:bg-nature-dark-surface/90 backdrop-blur-md border border-gray-200 dark:border-white/10 rounded-2xl shadow-lg focus:ring-2 focus:ring-nature-green outline-none transition-all dark:text-white"
                    />
                    <span className="absolute left-3 top-3.5 text-gray-400">
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path></svg>
                    </span>
                    {isSearching && (
                        <span className="absolute right-3 top-3.5 animate-spin text-nature-green">
                            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                        </span>
                    )}
                </form>
                {searchResults.length > 0 && (
                    <div className="absolute top-full left-0 right-0 mt-2 bg-white/90 dark:bg-nature-dark-surface/90 backdrop-blur-md rounded-2xl shadow-xl border border-gray-100 dark:border-white/10 overflow-hidden">
                        {searchResults.map((result, index) => (
                            <button
                                key={index}
                                onClick={() => handleSelectLocation(result)}
                                className="w-full text-left px-4 py-3 hover:bg-gray-100 dark:hover:bg-white/10 transition-colors border-b border-gray-100 dark:border-white/5 last:border-0"
                            >
                                <p className="font-medium text-nature-dark dark:text-white truncate">{result.displayName}</p>
                            </button>
                        ))}
                    </div>
                )}
            </div>

            {/* Locate Me Button */}
            <button
                onClick={handleLocateMe}
                className={`absolute z-[1000] p-3 bg-white/90 dark:bg-nature-dark-surface/90 backdrop-blur-md rounded-full shadow-lg border border-gray-200 dark:border-white/10 hover:scale-110 transition-transform text-nature-accent ${isMobileView ? 'bottom-8 right-4' : 'top-4 right-4'}`}
                title="Me localiser"
            >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"></path><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"></path></svg>
            </button>
        </div>
    );
};

export default ObservationMap;
