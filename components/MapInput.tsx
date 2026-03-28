import React, { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { SearchResult, reverseGeocode, searchAddress } from '../services/locationService';

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

interface MapInputProps {
    onLocationChange: (lat: number, lon: number, municipality: string, location: string, department: string, country: string) => void;
    onToast: (type: 'warning' | 'error' | 'info' | 'success', message: string, durationMs?: number) => void;
}

const HIGH_ACCURACY_OPTIONS: PositionOptions = {
    enableHighAccuracy: true,
    timeout: 15000,
    maximumAge: 0
};

const MapInput: React.FC<MapInputProps> = ({ onLocationChange, onToast }) => {
    const mapContainerRef = useRef<HTMLDivElement>(null);
    const mapRef = useRef<L.Map | null>(null);
    const markerRef = useRef<L.Marker | null>(null);
    const accuracyCircleRef = useRef<L.Circle | null>(null);
    const watchIdRef = useRef<number | null>(null);
    const onLocationChangeRef = useRef(onLocationChange);
    const onToastRef = useRef(onToast);

    const tileLayerRef = useRef<L.TileLayer | null>(null);

    const [accuracy, setAccuracy] = React.useState<number | null>(null);
    const [isLocating, setIsLocating] = React.useState(false);
    const [activeLayer, setActiveLayer] = React.useState<'osm' | 'satellite' | 'topo'>('osm');
    const [showLayerMenu, setShowLayerMenu] = React.useState(false);

    useEffect(() => {
        onLocationChangeRef.current = onLocationChange;
    }, [onLocationChange]);

    useEffect(() => {
        onToastRef.current = onToast;
    }, [onToast]);

    useEffect(() => {
        let clickTimer: ReturnType<typeof setTimeout> | null = null;
        let abortCtrl: AbortController | null = null;

        if (mapContainerRef.current && !mapRef.current) {
            const map = L.map(mapContainerRef.current, {
                zoomControl: false
            }).setView([46.603354, 1.888334], 6);

            L.control.zoom({
                position: 'bottomright'
            }).addTo(map);

            mapRef.current = map;

            tileLayerRef.current = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
                maxZoom: 19
            }).addTo(map);

            map.on('click', (e: L.LeafletMouseEvent) => {
                const { lat, lng } = e.latlng;

                if (markerRef.current) {
                    markerRef.current.setLatLng(e.latlng);
                } else {
                    markerRef.current = L.marker(e.latlng).addTo(map);
                }

                // Cancel previous pending request
                if (clickTimer) clearTimeout(clickTimer);
                if (abortCtrl) abortCtrl.abort();

                clickTimer = setTimeout(() => {
                    abortCtrl = new AbortController();
                    reverseGeocode(lat, lng, abortCtrl?.signal).then(result => {
                        if (result) {
                            onLocationChangeRef.current(lat, lng, result.address?.municipality || '', result.address?.location || '', result.address?.department || '', result.address?.country || '');
                        } else {
                            onLocationChangeRef.current(lat, lng, '', '', '', '');
                        }
                    }).catch(err => {
                        if (err.name !== 'AbortError') {
                            console.error(err);
                            onToastRef.current('warning', "Impossible de récupérer l'adresse exacte pour ce point.");
                        }
                    });
                }, 300);
            });
        }

        // Fix gray map issue
        const timer = setTimeout(() => {
            if (mapRef.current) {
                mapRef.current.invalidateSize();
            }
        }, 200);

        // Robust resizing
        let resizeObserver: ResizeObserver | null = null;
        if (mapContainerRef.current && mapRef.current) {
            resizeObserver = new ResizeObserver(() => {
                mapRef.current?.invalidateSize();
            });
            resizeObserver.observe(mapContainerRef.current);
        }

        return () => {
            clearTimeout(timer);
            if (clickTimer) {
                clearTimeout(clickTimer);
                clickTimer = null;
            }
            if (abortCtrl) {
                abortCtrl.abort();
                abortCtrl = null;
            }
            if (watchIdRef.current !== null) {
                navigator.geolocation.clearWatch(watchIdRef.current);
                watchIdRef.current = null;
            }
            if (accuracyCircleRef.current && mapRef.current) {
                accuracyCircleRef.current.removeFrom(mapRef.current);
                accuracyCircleRef.current = null;
            }
            if (markerRef.current && mapRef.current) {
                markerRef.current.removeFrom(mapRef.current);
                markerRef.current = null;
            }
            if (mapRef.current) {
                mapRef.current.off();
                mapRef.current.remove();
                mapRef.current = null;
            }
            if (resizeObserver) {
                resizeObserver.disconnect();
            }
        };
    }, []);

    const [searchQuery, setSearchQuery] = React.useState('');
    const [searchResults, setSearchResults] = React.useState<SearchResult[]>([]);
    const [isSearching, setIsSearching] = React.useState(false);
    const [isFocused, setIsFocused] = React.useState(false);
    const [searchHistory, setSearchHistory] = React.useState<string[]>(() => {
        try { return JSON.parse(localStorage.getItem('map_search_history') || '[]'); } catch { return []; }
    });
    const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    useEffect(() => {
        return () => {
            if (debounceRef.current) clearTimeout(debounceRef.current);
        };
    }, []);

    const saveToHistory = (query: string) => {
        const trimmed = query.trim();
        if (trimmed.length < 3) return;
        const updated = [trimmed, ...searchHistory.filter(h => h !== trimmed)].slice(0, 5);
        setSearchHistory(updated);
        localStorage.setItem('map_search_history', JSON.stringify(updated));
    };

    const doSearch = async (query: string) => {
        if (query.length < 3) return;
        setIsSearching(true);
        try {
            const results = await searchAddress(query);
            setSearchResults(results);
            if (results.length === 0) {
                onToastRef.current('info', 'Aucun résultat trouvé pour cette recherche.');
            }
        } catch (error) {
            console.error(error);
            onToastRef.current('warning', (error as Error).message || "Erreur lors de la recherche d'adresse.");
        } finally {
            setIsSearching(false);
        }
    };

    const handleSearchInputChange = (value: string) => {
        setSearchQuery(value);
        if (debounceRef.current) clearTimeout(debounceRef.current);
        if (value.length >= 3) {
            debounceRef.current = setTimeout(() => doSearch(value), 500);
        } else {
            setSearchResults([]);
        }
    };

    const handleSearch = async (e?: { preventDefault: () => void }) => {
        e?.preventDefault();
        if (debounceRef.current) clearTimeout(debounceRef.current);
        doSearch(searchQuery);
    };

    const handleSelectLocation = (result: SearchResult) => {
        if (mapRef.current) {
            mapRef.current.flyTo([result.lat, result.lon], 16);
            if (markerRef.current) {
                markerRef.current.setLatLng([result.lat, result.lon]);
            } else {
                markerRef.current = L.marker([result.lat, result.lon]).addTo(mapRef.current);
            }
            onLocationChangeRef.current(result.lat, result.lon, result.address?.municipality || '', result.address?.location || '', result.address?.department || '', result.address?.country || '');
            saveToHistory(searchQuery);
            setSearchResults([]);
            setSearchQuery('');
        }
    };

    const handleHistorySelect = (query: string) => {
        setSearchQuery(query);
        setIsFocused(false);
        doSearch(query);
    };

    const clearSearch = () => {
        setSearchQuery('');
        setSearchResults([]);
        if (debounceRef.current) clearTimeout(debounceRef.current);
    };

    const TILE_LAYERS = {
        osm: { url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>', maxZoom: 19, label: 'Standard' },
        satellite: { url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', attribution: '&copy; Esri', maxZoom: 18, label: 'Satellite' },
        topo: { url: 'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png', attribution: '&copy; <a href="https://opentopomap.org">OpenTopoMap</a>', maxZoom: 17, label: 'Topo' }
    } as const;

    const switchLayer = (layer: 'osm' | 'satellite' | 'topo') => {
        if (!mapRef.current || layer === activeLayer) { setShowLayerMenu(false); return; }
        if (tileLayerRef.current) {
            tileLayerRef.current.removeFrom(mapRef.current);
        }
        const config = TILE_LAYERS[layer];
        tileLayerRef.current = L.tileLayer(config.url, { attribution: config.attribution, maxZoom: config.maxZoom }).addTo(mapRef.current);
        setActiveLayer(layer);
        setShowLayerMenu(false);
    };

    const stopWatching = () => {
        if (watchIdRef.current !== null) {
            navigator.geolocation.clearWatch(watchIdRef.current);
            watchIdRef.current = null;
        }
        setIsLocating(false);
    };

    const handleLocateMe = () => {
        if (!('geolocation' in navigator)) {
            onToastRef.current('warning', "La géolocalisation n'est pas supportée par votre navigateur.");
            return;
        }

        // If already watching, stop
        if (watchIdRef.current !== null) {
            stopWatching();
            if (accuracyCircleRef.current && mapRef.current) {
                accuracyCircleRef.current.removeFrom(mapRef.current);
                accuracyCircleRef.current = null;
            }
            setAccuracy(null);
            return;
        }

        setIsLocating(true);
        let firstFix = true;

        watchIdRef.current = navigator.geolocation.watchPosition(
            (position) => {
                const { latitude, longitude, accuracy: acc } = position.coords;
                setAccuracy(Math.round(acc));

                if (!mapRef.current) return;

                if (firstFix) {
                    mapRef.current.flyTo([latitude, longitude], 16);
                    firstFix = false;
                }

                if (markerRef.current) {
                    markerRef.current.setLatLng([latitude, longitude]);
                } else {
                    markerRef.current = L.marker([latitude, longitude]).addTo(mapRef.current);
                }

                // Update accuracy circle
                if (accuracyCircleRef.current) {
                    accuracyCircleRef.current.setLatLng([latitude, longitude]);
                    accuracyCircleRef.current.setRadius(acc);
                } else {
                    accuracyCircleRef.current = L.circle([latitude, longitude], {
                        radius: acc,
                        color: '#007AFF',
                        fillColor: '#007AFF',
                        fillOpacity: 0.1,
                        weight: 1
                    }).addTo(mapRef.current);
                }

                // Reverse geocode
                reverseGeocode(latitude, longitude).then(result => {
                    if (result) {
                        onLocationChangeRef.current(latitude, longitude, result.address?.municipality || '', result.address?.location || '', result.address?.department || '', result.address?.country || '');
                    } else {
                        onLocationChangeRef.current(latitude, longitude, '', '', '', '');
                    }
                }).catch((error) => {
                    console.error(error);
                    onToastRef.current('warning', (error as Error).message || "Impossible de récupérer l'adresse de votre position.");
                });

                // Stop watching once accuracy is good enough (<30m)
                if (acc < 30) {
                    stopWatching();
                }
            },
            (error) => {
                console.error("Erreur de géolocalisation:", error);
                onToastRef.current('warning', "Impossible de vous localiser. Vérifiez vos autorisations.");
                stopWatching();
            },
            HIGH_ACCURACY_OPTIONS
        );
    };

    return (
        <div className="relative h-[400px] w-full">
            <div ref={mapContainerRef} style={{ height: '100%', width: '100%' }} />

            {/* Search Overlay */}
            <div className="absolute top-2 left-2 right-14 z-[1000]">
                <div className="relative">
                    <input
                        type="text"
                        value={searchQuery}
                        onChange={(e) => handleSearchInputChange(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                                e.preventDefault();
                                e.stopPropagation();
                                handleSearch(e);
                            }
                        }}
                        onFocus={() => setIsFocused(true)}
                        onBlur={() => setTimeout(() => setIsFocused(false), 200)}
                        placeholder="Chercher une adresse..."
                        className="w-full pl-8 pr-8 py-2 bg-white/90 dark:bg-nature-dark-surface/90 backdrop-blur-md border border-gray-200 dark:border-white/10 rounded-xl shadow-md focus:ring-2 focus:ring-nature-green outline-none text-sm dark:text-white"
                    />
                    <span className="absolute left-2.5 top-2.5 text-gray-400">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path></svg>
                    </span>
                    {isSearching ? (
                        <span className="absolute right-3 top-2.5 animate-spin text-nature-green">
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                        </span>
                    ) : searchQuery && (
                        <button type="button" onClick={clearSearch} className="absolute right-2.5 top-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 p-0.5">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg>
                        </button>
                    )}
                </div>
                {/* Search Results */}
                {searchResults.length > 0 && (
                    <div className="absolute top-full left-0 right-0 mt-1 bg-white/90 dark:bg-nature-dark-surface/90 backdrop-blur-md rounded-xl shadow-lg border border-gray-100 dark:border-white/10 overflow-hidden max-h-48 overflow-y-auto">
                        {searchResults.map((result, index) => (
                            <button
                                type="button"
                                key={index}
                                onClick={() => handleSelectLocation(result)}
                                className="w-full text-left px-3 py-2 hover:bg-gray-100 dark:hover:bg-white/10 transition-colors border-b border-gray-100 dark:border-white/5 last:border-0 text-sm"
                            >
                                <p className="font-medium text-nature-dark dark:text-white truncate">{result.displayName}</p>
                            </button>
                        ))}
                    </div>
                )}
                {/* Search History */}
                {isFocused && !searchQuery && searchHistory.length > 0 && searchResults.length === 0 && (
                    <div className="absolute top-full left-0 right-0 mt-1 bg-white/90 dark:bg-nature-dark-surface/90 backdrop-blur-md rounded-xl shadow-lg border border-gray-100 dark:border-white/10 overflow-hidden">
                        <p className="px-3 py-1.5 text-xs text-gray-400 dark:text-gray-500">Recherches récentes</p>
                        {searchHistory.map((query, index) => (
                            <button
                                type="button"
                                key={index}
                                onClick={() => handleHistorySelect(query)}
                                className="w-full text-left px-3 py-2 hover:bg-gray-100 dark:hover:bg-white/10 transition-colors border-b border-gray-100 dark:border-white/5 last:border-0 text-sm flex items-center gap-2"
                            >
                                <svg className="w-3 h-3 text-gray-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                                <span className="text-nature-dark dark:text-white truncate">{query}</span>
                            </button>
                        ))}
                    </div>
                )}
            </div>

            {/* Locate Me Button */}
            <button
                onClick={handleLocateMe}
                type="button"
                className={`absolute top-2 right-2 z-[1000] p-2 backdrop-blur-md rounded-full shadow-md border hover:scale-110 transition-transform ${isLocating ? 'bg-nature-accent/20 border-nature-accent text-nature-accent' : 'bg-white/90 dark:bg-nature-dark-surface/90 border-gray-200 dark:border-white/10 text-nature-accent'}`}
                title={isLocating ? "Arrêter la localisation" : "Me localiser"}
            >
                {isLocating ? (
                    <svg className="w-5 h-5 animate-pulse" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"></path><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"></path></svg>
                ) : (
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"></path><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"></path></svg>
                )}
            </button>

            {/* Accuracy Badge */}
            {accuracy !== null && (
                <div className="absolute top-14 right-2 z-[1000] px-2 py-1 bg-white/90 dark:bg-nature-dark-surface/90 backdrop-blur-md rounded-lg shadow-md border border-gray-200 dark:border-white/10 text-xs font-medium text-gray-600 dark:text-gray-300">
                    ±{accuracy}m
                </div>
            )}

            {/* Layer Selector */}
            <div className="absolute bottom-2 left-2 z-[1000]">
                <button
                    type="button"
                    onClick={() => setShowLayerMenu(!showLayerMenu)}
                    className="p-2 bg-white/90 dark:bg-nature-dark-surface/90 backdrop-blur-md rounded-lg shadow-md border border-gray-200 dark:border-white/10 hover:scale-105 transition-transform"
                    title="Changer le fond de carte"
                >
                    <svg className="w-5 h-5 text-gray-600 dark:text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7"></path></svg>
                </button>
                {showLayerMenu && (
                    <div className="absolute bottom-10 left-0 bg-white/95 dark:bg-nature-dark-surface/95 backdrop-blur-md rounded-xl shadow-lg border border-gray-200 dark:border-white/10 overflow-hidden min-w-[120px]">
                        {(Object.keys(TILE_LAYERS) as Array<'osm' | 'satellite' | 'topo'>).map(key => (
                            <button
                                type="button"
                                key={key}
                                onClick={() => switchLayer(key)}
                                className={`w-full text-left px-3 py-2 text-sm transition-colors ${activeLayer === key ? 'bg-nature-green/20 text-nature-green font-semibold' : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-white/10'}`}
                            >
                                {TILE_LAYERS[key].label}
                            </button>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
};

export default MapInput;
