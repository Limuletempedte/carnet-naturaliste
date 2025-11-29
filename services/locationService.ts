

export interface SearchResult {
    lat: number;
    lon: number;
    displayName: string;
    address?: {
        municipality?: string;
        location?: string;
        department?: string;
    };
}

export const fetchAltitude = async (lat: number, lon: number): Promise<number | null> => {
    try {
        const response = await fetch(`https://api.open-meteo.com/v1/elevation?latitude=${lat}&longitude=${lon}`);
        const data = await response.json();

        if (data && data.elevation && data.elevation.length > 0) {
            return data.elevation[0];
        }
        return null;
    } catch (error) {
        console.error("Erreur lors de la récupération de l'altitude:", error);
        return null;
    }
};

export const searchAddress = async (query: string): Promise<SearchResult[]> => {
    if (!query || query.length < 3) return [];
    try {
        const response = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&addressdetails=1&limit=5`);
        const data = await response.json();

        return data.map((item: any) => ({
            lat: parseFloat(item.lat),
            lon: parseFloat(item.lon),
            displayName: item.display_name,
            address: {
                municipality: item.address.village || item.address.town || item.address.city || '',
                location: item.address.road || '',
                department: item.address.postcode ? item.address.postcode.substring(0, 2) : ''
            }
        }));
    } catch (error) {
        console.error("Erreur lors de la recherche d'adresse:", error);
        return [];
    }
};

export const reverseGeocode = async (lat: number, lon: number): Promise<SearchResult | null> => {
    try {
        const response = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}&addressdetails=1`);
        const data = await response.json();

        if (data && data.address) {
            return {
                lat: parseFloat(data.lat),
                lon: parseFloat(data.lon),
                displayName: data.display_name,
                address: {
                    municipality: data.address.village || data.address.town || data.address.city || '',
                    location: data.address.road || '',
                    department: data.address.postcode ? data.address.postcode.substring(0, 2) : ''
                }
            };
        }
        return null;
    } catch (error) {
        console.error("Erreur lors du géocodage inverse:", error);
        return null;
    }
};
