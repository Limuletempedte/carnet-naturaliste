
export enum TaxonomicGroup {
    BIRD = 'Oiseaux',
    MAMMAL = 'Mammifères',
    MARINE_MAMMAL = 'Mammifères marins',
    REPTILE = 'Réptiles',
    AMPHIBIAN = 'Amphibien',
    ODONATE = 'Odonate',
    BUTTERFLY = 'Papillons de jour',
    MOTH = 'Papillon de nuit',
    ORTHOPTERA = 'Orthoptère',
    HYMENOPTERA = 'Hyménoptères',
    ANT = 'Fourmis',
    MANTIS = 'Mantes',
    CICADA = 'Cigale',
    HETEROPTERA = 'Punaises',
    COLEOPTERA = 'Coléoptères',
    NEUROPTERA = 'Névroptères',
    DIPTERA = 'Diptères',
    PHASMID = 'Phasme',
    ARACHNID = 'Araignées',
    SCORPION = 'Scorpions',
    FISH = 'Poisson',
    CRUSTACEAN = 'Crustacé',
    BRANCHIOPOD = 'Branchiopodes',
    GASTROPOD = 'Gastéropodes',
    BIVALVE = 'Bivalves',
    CHIROPTERA = 'Chiroptères',
    DERMAPTERA = 'Dermatères',
    ORCHID = 'Orchidées',
    BOTANY = 'Botaniques générales',
    LICHEN = 'Lichens',
    MUSHROOM = 'Champignons',
    TREE = 'Arbres',
    OTHER = 'Autre'
}

export enum Status {
    NE = 'NE',
    DD = 'DD',
    LC = 'LC',
    NT = 'NT',
    VU = 'VU',
    EN = 'EN',
    CR = 'CR',
    EW = 'EW',
    EX = 'EX'
}

export enum Protocol {
    OPPORTUNIST = 'Opportuniste',
    STOC_EPS = 'STOC EPS',
    EPOC = 'EPOC',
    BATTAGE = 'Battage',
    FAUCHAGE = 'Fauchage',
    SQUARE_1M = '1m/1m',
    SQUARE_3M = '3m/3m',
    SQUARE_5M = '5m/5m',
    ULTRASOUND_DEVICE = 'Boitier ultrasons',
    CAMERA_TRAP = 'Suivi piège photographique',
    WETLANDS_COUNT = 'Comptage Wetlands',
    OTHER = 'Autre'
}

export enum Sexe {
    UNKNOWN = 'Non renseigné',
    MALE = 'Mâle',
    FEMALE = 'Femelle'
}

export enum Age {
    UNKNOWN = 'Non renseigné',
    CHICK_NON_FLYING = 'Poussin non volant',
    CHICK_FLYING = 'Poussin volant',
    IMMATURE = 'Immature',
    FIRST_YEAR = '1ère année',
    SECOND_YEAR = '2ème année',
    THIRD_YEAR = '3ème année',
    FOURTH_YEAR = '4ème année',
    FIFTH_YEAR = '5ème année',
    ADULT = 'Adulte'
}

export enum ObservationCondition {
    UNKNOWN = 'Non renseigné',
    SEEN_IN_FLIGHT = 'Vu en vol',
    SEEN_LANDED = 'Vu posé',
    HEARD = 'Contact auditif',
    ULTRASOUND = 'Ultrasons',
    SIGNS_OF_PRESENCE = 'Indices de présence',
    IN_FLOWER = 'En fleur',
    IN_FRUIT = 'En fruit'
}

export enum Comportement {
    UNKNOWN = 'Non renseigné',
    ACTIVE_MIGRATION = 'Migration active',
    HUNTING = 'Chasse',
    ROOST = 'Dortoir/Reposoir',
    IN_TRANSIT = 'En transit'
}

export enum WeatherCondition {
    UNKNOWN = 'Non renseigné',
    SUNNY = 'Ensoleillé',
    PARTLY_CLOUDY = 'Partiellement nuageux',
    CLOUDY = 'Couvert',
    LIGHT_RAIN = 'Pluie légère',
    RAIN = 'Pluie',
    HEAVY_RAIN = 'Pluie forte',
    SNOW = 'Neige',
    FOG = 'Brouillard',
    WIND = 'Venteux',
    STORM = 'Orage',
    FROST = 'Gel'
}

export enum Habitat {
    UNKNOWN = 'Non renseigné',
    FOREST_DECIDUOUS = 'Forêt de feuillus',
    FOREST_CONIFEROUS = 'Forêt de conifères',
    FOREST_MIXED = 'Forêt mixte',
    GRASSLAND = 'Prairie',
    WETLAND = 'Zone humide',
    FRESHWATER = 'Eau douce',
    COASTAL = 'Littoral',
    MARINE = 'Milieu marin',
    AGRICULTURAL = 'Milieu agricole',
    URBAN = 'Milieu urbain',
    MOUNTAIN = 'Montagne',
    CAVE = 'Grotte/souterrain',
    CLIFF_ROCK = 'Falaise/rocher',
    OTHER = 'Autre'
}

export enum Phenology {
    UNKNOWN = 'Non renseigné',
    VEGETATIVE = 'Végétatif',
    FLOWER_BUD = 'Bouton floral',
    FLOWERING = 'En fleur',
    FRUITING = 'En fruit',
    SENESCENT = 'Sénescent',
    DORMANT = 'Dormant',
    MIGRATION = 'En migration',
    BREEDING = 'En reproduction',
    MOULTING = 'En mue'
}

export interface Observation {
    id: string;
    speciesName: string;
    latinName: string;
    taxonomicGroup: TaxonomicGroup;
    date: string; // YYYY-MM-DD
    time: string; // HH:MM
    count: number;
    maleCount?: number;
    femaleCount?: number;
    unidentifiedCount?: number;
    location: string;
    gps: { lat: number | null; lon: number | null };
    municipality: string;
    department: string;
    country: string;
    altitude: number | null;
    comment: string;
    status: Status;
    atlasCode: string;
    protocol: Protocol;
    sexe: Sexe;
    age: Age;
    observationCondition: ObservationCondition;
    comportement: Comportement;
    weather: WeatherCondition;
    photo?: string; // URL Supabase Storage (ou base64 temporaire avant upload)
    sound?: string; // URL Supabase Storage (ou base64 temporaire avant upload)
    wikipediaImage?: string; // URL from Wikipedia
    createdAt?: string; // ISO 8601 — rempli par le serveur (SR-14)
    updatedAt?: string; // ISO 8601 — rempli par le serveur (SR-14)
    habitat?: Habitat; // VP-04
    phenology?: Phenology; // VP-08
    observers?: string[]; // VP-05 — noms libres séparés, ex: ['Jean D.', 'Marie L.']
}

export enum View {
    LIST,
    FORM,
    MAP,
    STATS,
    GALLERY,
    CALENDAR,
    PRIVACY = 7,
    TERMS = 8,
    LEGAL_NOTICES = 9,
    HELP = 10,
}
