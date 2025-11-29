
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
    MANTIS = 'Mantes',
    CICADA = 'Cigale',
    HETEROPTERA = 'Punaises',
    COLEOPTERA = 'Coléoptères',
    NEUROPTERA = 'Nervoptère',
    DIPTERA = 'Diptères',
    PHASMID = 'Phasme',
    ARACHNID = 'Araignées',
    FISH = 'Poisson',
    CRUSTACEAN = 'Crustacé',
    CHIROPTERA = 'Chiroptères',
    ORCHID = 'Orchidées',
    BOTANY = 'Botaniques générales',
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

export interface Observation {
    id: string;
    speciesName: string;
    latinName: string;
    taxonomicGroup: TaxonomicGroup;
    date: string; // YYYY-MM-DD
    time: string; // HH:MM
    count: number;
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
    photo?: string; // base64 data URL
    sound?: string; // base64 data URL
    wikipediaImage?: string; // URL from Wikipedia
}

export enum View {
    LIST,
    FORM,
    MAP,
    STATS,
    GALLERY,
    CALENDAR
}
