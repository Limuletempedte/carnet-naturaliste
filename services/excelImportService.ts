import * as XLSX from 'xlsx';
import { Observation, TaxonomicGroup, Status, Protocol, Sexe, Age, ObservationCondition, Comportement } from '../types';

export const parseExcel = async (file: File): Promise<Observation[]> => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();

        reader.onload = (e) => {
            try {
                const data = e.target?.result;
                const workbook = XLSX.read(data, { type: 'array', cellDates: true });
                const sheetName = workbook.SheetNames[0];
                const worksheet = workbook.Sheets[sheetName];
                const jsonData = XLSX.utils.sheet_to_json(worksheet);

                // Check for duplicate IDs in the source file
                const ids = jsonData.map((row: any) => row['ID'] ? String(row['ID']).trim() : '');
                const uniqueIds = new Set(ids.filter(id => id !== ''));
                const hasDuplicateIds = uniqueIds.size < ids.filter(id => id !== '').length;

                // If duplicates are found, or if IDs are missing, we should generate new IDs for ALL rows to avoid collisions
                // We'll use a timestamp + index to ensure uniqueness
                const timestamp = Date.now();

                const observations: Observation[] = jsonData.map((rawRow: any, index: number) => {
                    // Normalize keys to handle potential trailing spaces
                    const row: any = {};
                    Object.keys(rawRow).forEach(key => {
                        row[key.trim()] = rawRow[key];
                    });

                    // Generate a unique ID if missing, empty, OR if duplicates were detected in the file
                    let id = (row['ID'] && String(row['ID']).trim() !== '') ? String(row['ID']) : '';

                    if (hasDuplicateIds || id === '') {
                        id = `${timestamp}-${index}-${Math.random().toString(36).substr(2, 5)}`;
                    }

                    return {
                        id: id,
                        speciesName: row["Nom de l'espèce"] || 'Espèce inconnue',
                        latinName: row["Nom latin"] || '',
                        taxonomicGroup: mapTaxonomicGroup(row["Groupe taxonomique"]),
                        date: parseDate(row["Date"]),
                        time: row["Heure"] || '12:00',
                        count: parseInt(row["Nombre"]) || 1,
                        location: row["Lieu-dit"] || '',
                        gps: {
                            lat: parseFloat(row["Latitude"]) || null,
                            lon: parseFloat(row["Longitude"]) || null
                        },
                        municipality: row["Commune"] || '',
                        department: row["Département"] || '',
                        country: row["Pays"] || 'France',
                        altitude: parseFloat(row["Altitude"]) || null,
                        status: mapStatus(row["Statut"]),
                        atlasCode: row["Code Atlas"] || '',
                        protocol: mapProtocol(row["Protocole"]),
                        sexe: mapSexe(row["Sexe"]),
                        age: mapAge(row["Age"]),
                        observationCondition: mapCondition(row["Condition d'observation"]),
                        comportement: mapComportement(row["Comportement"]),
                        comment: row["Commentaire"] || '',
                        photo: undefined,
                        sound: undefined,
                        wikipediaImage: undefined
                    };
                });

                resolve(observations);
            } catch (error) {
                console.error("Excel parse error:", error);
                reject(error);
            }
        };

        reader.onerror = (error) => reject(error);
        reader.readAsArrayBuffer(file);
    });
};

// Helper functions to map strings to Enums
const mapTaxonomicGroup = (value: string): TaxonomicGroup => {
    // Handle exact match
    const entry = Object.entries(TaxonomicGroup).find(([_, v]) => v === value);
    if (entry) return entry[1] as TaxonomicGroup;

    // Handle plurals/variations
    const lowerValue = value?.toLowerCase() || '';
    if (lowerValue.includes('amphibien')) return TaxonomicGroup.AMPHIBIAN;
    if (lowerValue.includes('reptile')) return TaxonomicGroup.REPTILE;
    if (lowerValue.includes('mammifère')) return TaxonomicGroup.MAMMAL;
    if (lowerValue.includes('papillon')) return TaxonomicGroup.BUTTERFLY; // Default to butterfly, could be moth
    if (lowerValue.includes('oiseau')) return TaxonomicGroup.BIRD;

    return TaxonomicGroup.BIRD;
};

const mapStatus = (value: string): Status => {
    return Object.values(Status).includes(value as Status) ? (value as Status) : Status.NE;
};

const mapProtocol = (value: string): Protocol => {
    return Object.values(Protocol).includes(value as Protocol) ? (value as Protocol) : Protocol.OPPORTUNIST;
};

const mapSexe = (value: string): Sexe => {
    return Object.values(Sexe).includes(value as Sexe) ? (value as Sexe) : Sexe.UNKNOWN;
};

const mapAge = (value: string): Age => {
    return Object.values(Age).includes(value as Age) ? (value as Age) : Age.UNKNOWN;
};

const mapCondition = (value: string): ObservationCondition => {
    return Object.values(ObservationCondition).includes(value as ObservationCondition) ? (value as ObservationCondition) : ObservationCondition.UNKNOWN;
};

const mapComportement = (value: string): Comportement => {
    return Object.values(Comportement).includes(value as Comportement) ? (value as Comportement) : Comportement.UNKNOWN;
};

const parseDate = (excelDate: any): string => {
    if (!excelDate) return new Date().toISOString().split('T')[0];

    // Handle JS Date object (from cellDates: true)
    if (excelDate instanceof Date) {
        // Adjust for timezone offset to prevent off-by-one error
        const offset = excelDate.getTimezoneOffset();
        const date = new Date(excelDate.getTime() - (offset * 60 * 1000));
        return date.toISOString().split('T')[0];
    }

    // Handle Excel serial date (fallback)
    if (typeof excelDate === 'number') {
        const date = new Date(Math.round((excelDate - 25569) * 86400 * 1000));
        return date.toISOString().split('T')[0];
    }

    // Handle string date (DD/MM/YYYY or YYYY-MM-DD)
    if (typeof excelDate === 'string') {
        if (excelDate.includes('/')) {
            const parts = excelDate.split('/');
            if (parts.length === 3) {
                // Assume DD/MM/YYYY
                return `${parts[2]}-${parts[1]}-${parts[0]}`;
            }
        }
        return excelDate;
    }

    return new Date().toISOString().split('T')[0];
};
