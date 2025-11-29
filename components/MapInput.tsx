import React, { useEffect, useRef } from 'react';
import L from 'leaflet';

interface MapInputProps {
    onLocationChange: (lat: number, lon: number, municipality: string, location: string, department: string) => void;
}

const MapInput: React.FC<MapInputProps> = ({ onLocationChange }) => {
    const mapContainerRef = useRef<HTMLDivElement>(null);
    const mapRef = useRef<L.Map | null>(null);
    const markerRef = useRef<L.Marker | null>(null);

    useEffect(() => {
        if (mapContainerRef.current && !mapRef.current) {
            const map = L.map(mapContainerRef.current, {
                zoomControl: false
            }).setView([46.603354, 1.888334], 6);

            L.control.zoom({
                position: 'bottomright'
            }).addTo(map);

            mapRef.current = map;

            L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            }).addTo(map);

            map.on('click', (e: L.LeafletMouseEvent) => {
                const { lat, lng } = e.latlng;

                if (markerRef.current) {
                    markerRef.current.setLatLng(e.latlng);
                } else {
                    markerRef.current = L.marker(e.latlng).addTo(map);
                }

                // Use the service for reverse geocoding
                import('../services/locationService').then(m => m.reverseGeocode(lat, lng)).then(result => {
                    if (result) {
                        onLocationChange(lat, lng, result.address?.municipality || '', result.address?.location || '', result.address?.department || '');
                    } else {
                        onLocationChange(lat, lng, '', '', '');
                    }
                });
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
            if (resizeObserver) {
                resizeObserver.disconnect();
            }
        };
    }, []);

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
            mapRef.current.flyTo([result.lat, result.lon], 16);
            if (markerRef.current) {
                markerRef.current.setLatLng([result.lat, result.lon]);
            } else {
                markerRef.current = L.marker([result.lat, result.lon]).addTo(mapRef.current);
            }
            onLocationChange(result.lat, result.lon, result.address?.municipality || '', result.address?.location || '', result.address?.department || '');
            setSearchResults([]);
            setSearchQuery('');
        }
    };

    const handleLocateMe = () => {
        if ('geolocation' in navigator) {
            navigator.geolocation.getCurrentPosition((position) => {
                const { latitude, longitude } = position.coords;
                if (mapRef.current) {
                    mapRef.current.flyTo([latitude, longitude], 16);
                    if (markerRef.current) {
                        markerRef.current.setLatLng([latitude, longitude]);
                    } else {
                        markerRef.current = L.marker([latitude, longitude]).addTo(mapRef.current);
                    }

                    // Reverse geocode to get address details
                    import('../services/locationService').then(m => m.reverseGeocode(latitude, longitude)).then(result => {
                        if (result) {
                            onLocationChange(latitude, longitude, result.address?.municipality || '', result.address?.location || '', result.address?.department || '');
                        } else {
                            onLocationChange(latitude, longitude, '', '', '');
                        }
                    });
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
        <div className="relative h-[400px] w-full">
            <div ref={mapContainerRef} style={{ height: '100%', width: '100%' }} />

            {/* Search Overlay */}
            <div className="absolute top-2 left-2 right-14 z-[1000]">
                <div className="relative">
                    <input
                        type="text"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                                e.preventDefault();
                                e.stopPropagation();
                                handleSearch(e);
                            }
                        }}
                        placeholder="Chercher une adresse..."
                        className="w-full pl-8 pr-4 py-2 bg-white/90 dark:bg-nature-dark-surface/90 backdrop-blur-md border border-gray-200 dark:border-white/10 rounded-xl shadow-md focus:ring-2 focus:ring-nature-green outline-none text-sm dark:text-white"
                    />
                    <span className="absolute left-2.5 top-2.5 text-gray-400">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path></svg>
                    </span>
                    {isSearching && (
                        <span className="absolute right-3 top-2.5 animate-spin text-nature-green">
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                        </span>
                    )}
                </div>
                {searchResults.length > 0 && (
                    <div className="absolute top-full left-0 right-0 mt-1 bg-white/90 dark:bg-nature-dark-surface/90 backdrop-blur-md rounded-xl shadow-lg border border-gray-100 dark:border-white/10 overflow-hidden max-h-48 overflow-y-auto">
                        {searchResults.map((result, index) => (
                            <button
                                key={index}
                                onClick={() => handleSelectLocation(result)}
                                className="w-full text-left px-3 py-2 hover:bg-gray-100 dark:hover:bg-white/10 transition-colors border-b border-gray-100 dark:border-white/5 last:border-0 text-sm"
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
                type="button"
                className="absolute top-2 right-2 z-[1000] p-2 bg-white/90 dark:bg-nature-dark-surface/90 backdrop-blur-md rounded-full shadow-md border border-gray-200 dark:border-white/10 hover:scale-110 transition-transform text-nature-accent"
                title="Me localiser"
            >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"></path><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"></path></svg>
            </button>
        </div>
    );
};

export default MapInput;
