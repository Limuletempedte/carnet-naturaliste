// Départements français : nom ↔ numéro, pour la recherche en langage naturel
// (« en Gironde » = 33). Une observation garde son département tel qu'il a
// été saisi ou déduit du code postal (`services/locationService.ts` : deux
// premiers chiffres, trois pour l'outre-mer, « 20 » pour la Corse) ; on
// compare donc des numéros normalisés.

export interface FrenchDepartment {
    code: string;
    name: string;
}

export const FRENCH_DEPARTMENTS: readonly FrenchDepartment[] = [
    { code: '01', name: 'Ain' },
    { code: '02', name: 'Aisne' },
    { code: '03', name: 'Allier' },
    { code: '04', name: 'Alpes-de-Haute-Provence' },
    { code: '05', name: 'Hautes-Alpes' },
    { code: '06', name: 'Alpes-Maritimes' },
    { code: '07', name: 'Ardèche' },
    { code: '08', name: 'Ardennes' },
    { code: '09', name: 'Ariège' },
    { code: '10', name: 'Aube' },
    { code: '11', name: 'Aude' },
    { code: '12', name: 'Aveyron' },
    { code: '13', name: 'Bouches-du-Rhône' },
    { code: '14', name: 'Calvados' },
    { code: '15', name: 'Cantal' },
    { code: '16', name: 'Charente' },
    { code: '17', name: 'Charente-Maritime' },
    { code: '18', name: 'Cher' },
    { code: '19', name: 'Corrèze' },
    { code: '2A', name: 'Corse-du-Sud' },
    { code: '2B', name: 'Haute-Corse' },
    { code: '21', name: "Côte-d'Or" },
    { code: '22', name: "Côtes-d'Armor" },
    { code: '23', name: 'Creuse' },
    { code: '24', name: 'Dordogne' },
    { code: '25', name: 'Doubs' },
    { code: '26', name: 'Drôme' },
    { code: '27', name: 'Eure' },
    { code: '28', name: 'Eure-et-Loir' },
    { code: '29', name: 'Finistère' },
    { code: '30', name: 'Gard' },
    { code: '31', name: 'Haute-Garonne' },
    { code: '32', name: 'Gers' },
    { code: '33', name: 'Gironde' },
    { code: '34', name: 'Hérault' },
    { code: '35', name: 'Ille-et-Vilaine' },
    { code: '36', name: 'Indre' },
    { code: '37', name: 'Indre-et-Loire' },
    { code: '38', name: 'Isère' },
    { code: '39', name: 'Jura' },
    { code: '40', name: 'Landes' },
    { code: '41', name: 'Loir-et-Cher' },
    { code: '42', name: 'Loire' },
    { code: '43', name: 'Haute-Loire' },
    { code: '44', name: 'Loire-Atlantique' },
    { code: '45', name: 'Loiret' },
    { code: '46', name: 'Lot' },
    { code: '47', name: 'Lot-et-Garonne' },
    { code: '48', name: 'Lozère' },
    { code: '49', name: 'Maine-et-Loire' },
    { code: '50', name: 'Manche' },
    { code: '51', name: 'Marne' },
    { code: '52', name: 'Haute-Marne' },
    { code: '53', name: 'Mayenne' },
    { code: '54', name: 'Meurthe-et-Moselle' },
    { code: '55', name: 'Meuse' },
    { code: '56', name: 'Morbihan' },
    { code: '57', name: 'Moselle' },
    { code: '58', name: 'Nièvre' },
    { code: '59', name: 'Nord' },
    { code: '60', name: 'Oise' },
    { code: '61', name: 'Orne' },
    { code: '62', name: 'Pas-de-Calais' },
    { code: '63', name: 'Puy-de-Dôme' },
    { code: '64', name: 'Pyrénées-Atlantiques' },
    { code: '65', name: 'Hautes-Pyrénées' },
    { code: '66', name: 'Pyrénées-Orientales' },
    { code: '67', name: 'Bas-Rhin' },
    { code: '68', name: 'Haut-Rhin' },
    { code: '69', name: 'Rhône' },
    { code: '70', name: 'Haute-Saône' },
    { code: '71', name: 'Saône-et-Loire' },
    { code: '72', name: 'Sarthe' },
    { code: '73', name: 'Savoie' },
    { code: '74', name: 'Haute-Savoie' },
    { code: '75', name: 'Paris' },
    { code: '76', name: 'Seine-Maritime' },
    { code: '77', name: 'Seine-et-Marne' },
    { code: '78', name: 'Yvelines' },
    { code: '79', name: 'Deux-Sèvres' },
    { code: '80', name: 'Somme' },
    { code: '81', name: 'Tarn' },
    { code: '82', name: 'Tarn-et-Garonne' },
    { code: '83', name: 'Var' },
    { code: '84', name: 'Vaucluse' },
    { code: '85', name: 'Vendée' },
    { code: '86', name: 'Vienne' },
    { code: '87', name: 'Haute-Vienne' },
    { code: '88', name: 'Vosges' },
    { code: '89', name: 'Yonne' },
    { code: '90', name: 'Territoire de Belfort' },
    { code: '91', name: 'Essonne' },
    { code: '92', name: 'Hauts-de-Seine' },
    { code: '93', name: 'Seine-Saint-Denis' },
    { code: '94', name: 'Val-de-Marne' },
    { code: '95', name: "Val-d'Oise" },
    { code: '971', name: 'Guadeloupe' },
    { code: '972', name: 'Martinique' },
    { code: '973', name: 'Guyane' },
    { code: '974', name: 'La Réunion' },
    { code: '976', name: 'Mayotte' },
];

/** Autres façons courantes d'écrire un département (forme repliée → numéro). */
const ALIASES: Readonly<Record<string, string>> = {
    reunion: '974',
    'ile de la reunion': '974',
    belfort: '90',
    'corse du sud': '2A',
    'haute corse': '2B',
};

/** Sans casse ni accents ; traits d'union, apostrophes et espaces repliés en une espace. */
export const foldPlaceName = (value: string): string => value
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/œ/g, 'oe')
    .replace(/æ/g, 'ae')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();

const BY_NAME: ReadonlyMap<string, string> = new Map([
    ...FRENCH_DEPARTMENTS.map(department => [foldPlaceName(department.name), department.code] as const),
    ...Object.entries(ALIASES),
]);

const CODES: ReadonlySet<string> = new Set(FRENCH_DEPARTMENTS.map(department => department.code));

/** Article en tête (« la Gironde », « le Nord », « les Landes », « l'Ain »). */
const LEADING_ARTICLE_RE = /^(?:la|le|les|l|departement de la|departement du|departement des|departement de l|departement de|departement)\s+/;

/**
 * Numéro du département écrit (nom ou numéro), ou null s'il est inconnu :
 * « Gironde », « la gironde », « 33 », « 1 » (= « 01 »), « 2a », « 974 ».
 */
export const normalizeDepartment = (value: string | null | undefined): string | null => {
    if (typeof value !== 'string') return null;
    const folded = foldPlaceName(value);
    if (folded.length === 0) return null;
    const upper = folded.replace(/\s+/g, '').toUpperCase();
    if (/^\d{1,3}$/.test(upper)) {
        const code = upper.length === 1 ? `0${upper}` : upper;
        return CODES.has(code) ? code : null;
    }
    if (upper === '2A' || upper === '2B') return upper;
    const name = folded.replace(LEADING_ARTICLE_RE, '');
    return BY_NAME.get(name) ?? BY_NAME.get(folded) ?? null;
};

/** Nom d'un département à partir de son numéro (« 33 » → « Gironde »). */
export const departmentName = (code: string): string | null =>
    FRENCH_DEPARTMENTS.find(department => department.code === code)?.name ?? null;

/**
 * L'observation est-elle dans ce département ? Son champ peut contenir un
 * numéro (« 33 », « 20 » pour la Corse, issu du code postal) ou un nom.
 */
export const observationInDepartment = (observationDepartment: string | null | undefined, code: string): boolean => {
    if (typeof observationDepartment !== 'string' || observationDepartment.trim() === '') return false;
    const raw = observationDepartment.trim();
    // Code postal de Corse : « 20 » vaut les deux départements.
    if ((code === '2A' || code === '2B') && raw === '20') return true;
    return normalizeDepartment(raw) === code;
};
