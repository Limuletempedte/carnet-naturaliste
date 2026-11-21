// Analyse locale et gratuite d'une phrase de recherche (phase 4 de
// l'assistant IA). Aucun appel réseau : elle reconnaît les mois, les années,
// « ce mois-ci », « le mois dernier », « cette année », « l'an dernier », les
// N derniers jours, les saisons, les groupes de l'application et leurs
// synonymes, les catégories du dictionnaire (`utils/taxonCategories.ts`) par
// leurs synonymes, les statuts (« menacées »), quelques milieux, un
// département nommé (« en Gironde », « dans le 33 ») et « près de chez moi ».
//
// Elle dit si elle a TOUT compris : sinon, les mots restants partent en
// texte libre (recherche dans les noms) et l'application propose
// « Interpréter avec l'IA ».
//
// Règle apprise à l'essai de la fonction : un nom suivi d'un qualificatif
// est une ESPÈCE (« hirondelles rustiques », « lézard des murailles »), pas
// la catégorie ni le groupe ; dans le doute, le mot reste en texte libre.

import { Habitat, Status, TaxonomicGroup } from '../types';
import {
    AI_SEARCH_LIMITS,
    clampRadiusKm,
    emptyCriteria,
    periodFixesYear,
    type SearchCriteria,
    type SearchPeriod,
    type SearchSeason,
    type SearchYearScope,
} from './aiSearchFilters';
import { FRENCH_DEPARTMENTS } from './frenchDepartments';
import { TAXON_CATEGORIES, type TaxonCategoryKey } from './taxonCategories';

export interface LocalSearchAnalysis {
    criteria: SearchCriteria;
    /** Au moins un critère autre que le texte libre (période, groupe, lieu…). */
    hasCriteria: boolean;
    /** Tous les mots ont été compris (aucun texte libre restant). */
    understood: boolean;
    /** Mots non compris, tels qu'écrits (gardés en texte libre). */
    unknownWords: string[];
    /** Remarques (« l'année écrite l'emporte sur « cette année » »). */
    notes: string[];
}

// ---------------------------------------------------------------------------
// Découpage
// ---------------------------------------------------------------------------

interface Token {
    raw: string;
    /** Sans casse ni accents, « œ » = « oe ». */
    f: string;
    start: number;
    end: number;
    /** Nombre entier ou décimal (« 2,5 »). */
    num: number | null;
    /** Commence par une majuscule (nom propre). */
    capital: boolean;
    /** Ce qui sépare ce mot du précédent (« - » dans « 2020-2022 »). */
    before: string;
}

const TOKEN_RE = /\d+(?:[.,]\d+)?|[\p{L}\p{M}\p{N}]+/gu;

export const foldWord = (value: string): string => value
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/œ/g, 'oe')
    .replace(/æ/g, 'ae');

const tokenize = (phrase: string): Token[] => {
    const tokens: Token[] = [];
    let previousEnd = 0;
    for (const match of phrase.matchAll(TOKEN_RE)) {
        const raw = match[0];
        const start = match.index ?? 0;
        const before = phrase.slice(previousEnd, start);
        previousEnd = start + raw.length;
        tokens.push({
            raw,
            f: foldWord(raw),
            start,
            end: start + raw.length,
            num: /^\d/.test(raw) ? Number(raw.replace(',', '.')) : null,
            capital: /^\p{Lu}/u.test(raw),
            before,
        });
    }
    return tokens;
};

/** Mots repliés d'une expression du lexique (« l'an dernier » → l, an, dernier). */
const words = (expression: string): string[] => tokenize(expression).map(token => token.f);

// ---------------------------------------------------------------------------
// Lexique
// ---------------------------------------------------------------------------

/** Mots sans objet pour la recherche : compris, mais ne donnent aucun critère. */
const STOPWORDS = new Set(words(
    "les le la l des de du d un une en au aux à a dans et ou mes mon ma toutes tous tout toute j ai " +
    "que qui quels quelles quel quelle vu vus vue vues observé observés observée observées observation observations " +
    "espèce espèces individus sur pour par avec y ont pendant durant ce cet cette ces cherche chercher montre moi " +
    "affiche afficher liste voir trouve trouvé trouvés trouvée trouvées donne " +
    // Prépositions de lieu : jamais un qualificatif d'espèce (« hérons près de Pessac »).
    "près autour vers proche loin",
));

type Effect =
    | { kind: 'period'; period: SearchPeriod }
    | { kind: 'groups'; groups: TaxonomicGroup[] }
    | { kind: 'categories'; categories: TaxonCategoryKey[] }
    | { kind: 'statuses'; statuses: Status[] }
    | { kind: 'habitats'; habitats: Habitat[] }
    | { kind: 'near' }
    | { kind: 'department'; name: string };

interface LexiconEntry {
    tokens: string[];
    effect: Effect;
    /** Nom d'un ensemble d'espèces : refusé s'il est suivi d'un qualificatif. */
    taxon?: boolean;
}

const period = (kind: SearchPeriod['kind'], extra: Partial<SearchPeriod> = {}): Effect => ({
    kind: 'period',
    period: { kind, days: null, month: null, season: null, yearScope: null, ...extra },
});

const LEXICON: LexiconEntry[] = [];
const add = (expressions: readonly string[], effect: Effect, taxon = false) => {
    for (const expression of expressions) LEXICON.push({ tokens: words(expression), effect, taxon });
};

// Périodes relatives.
add(['ce mois-ci', 'ce mois', 'mois en cours'], period('this_month'));
add(['le mois dernier', 'mois dernier', 'le mois passé', 'mois passé'], period('last_month'));
add(['cette année', 'année en cours'], period('this_year'));
add(["l'an dernier", "l'année dernière", "l'an passé", "l'année passée", 'an dernier', 'année dernière'], period('last_year'));
add(["aujourd'hui"], period('last_n_days', { days: 1 }));

// Groupes de l'application (pluriels et synonymes courants).
const G = TaxonomicGroup;
add(['oiseaux', 'oiseau', 'avifaune'], { kind: 'groups', groups: [G.BIRD] }, true);
add(['mammifères', 'mammifère'], { kind: 'groups', groups: [G.MAMMAL] }, true);
add(['mammifères marins', 'cétacés'], { kind: 'groups', groups: [G.MARINE_MAMMAL] }, true);
add(['reptiles', 'reptile'], { kind: 'groups', groups: [G.REPTILE] }, true);
add(['amphibiens', 'amphibien', 'batraciens'], { kind: 'groups', groups: [G.AMPHIBIAN] }, true);
add(['libellules', 'odonates', 'libellules et demoiselles'], { kind: 'groups', groups: [G.ODONATE] }, true);
add(['papillons'], { kind: 'groups', groups: [G.BUTTERFLY, G.MOTH] }, true);
add(['papillons de jour', 'rhopalocères'], { kind: 'groups', groups: [G.BUTTERFLY] }, true);
add(['papillons de nuit', 'hétérocères'], { kind: 'groups', groups: [G.MOTH] }, true);
add(['orthoptères'], { kind: 'groups', groups: [G.ORTHOPTERA] }, true);
add(['hyménoptères'], { kind: 'groups', groups: [G.HYMENOPTERA] }, true);
add(['fourmis'], { kind: 'groups', groups: [G.ANT] }, true);
add(['mantes'], { kind: 'groups', groups: [G.MANTIS] }, true);
add(['cigales'], { kind: 'groups', groups: [G.CICADA] }, true);
add(['punaises', 'hétéroptères'], { kind: 'groups', groups: [G.HETEROPTERA] }, true);
add(['coléoptères'], { kind: 'groups', groups: [G.COLEOPTERA] }, true);
add(['névroptères'], { kind: 'groups', groups: [G.NEUROPTERA] }, true);
add(['diptères'], { kind: 'groups', groups: [G.DIPTERA] }, true);
add(['phasmes'], { kind: 'groups', groups: [G.PHASMID] }, true);
add(['araignées'], { kind: 'groups', groups: [G.ARACHNID] }, true);
add(['scorpions'], { kind: 'groups', groups: [G.SCORPION] }, true);
add(['poissons'], { kind: 'groups', groups: [G.FISH] }, true);
add(['crustacés'], { kind: 'groups', groups: [G.CRUSTACEAN] }, true);
add(['branchiopodes'], { kind: 'groups', groups: [G.BRANCHIOPOD] }, true);
add(['gastéropodes', 'escargots et limaces'], { kind: 'groups', groups: [G.GASTROPOD] }, true);
add(['bivalves'], { kind: 'groups', groups: [G.BIVALVE] }, true);
add(['chauves-souris', 'chiroptères'], { kind: 'groups', groups: [G.CHIROPTERA] }, true);
add(['dermaptères', 'perce-oreilles'], { kind: 'groups', groups: [G.DERMAPTERA] }, true);
add(['orchidées'], { kind: 'groups', groups: [G.ORCHID] }, true);
add(['lichens'], { kind: 'groups', groups: [G.LICHEN] }, true);
add(['champignons'], { kind: 'groups', groups: [G.MUSHROOM] }, true);
add(['arbres'], { kind: 'groups', groups: [G.TREE] }, true);

// Catégories du dictionnaire, par leurs synonymes (« rapaces » = les deux catégories de rapaces).
const categoriesBySynonym = new Map<string, TaxonCategoryKey[]>();
for (const category of TAXON_CATEGORIES) {
    for (const synonym of category.synonyms) {
        const key = words(synonym).join(' ');
        categoriesBySynonym.set(key, [...(categoriesBySynonym.get(key) ?? []), category.key]);
    }
}
for (const [synonym, keys] of categoriesBySynonym) {
    LEXICON.push({ tokens: synonym.split(' '), effect: { kind: 'categories', categories: keys }, taxon: true });
}

// Statuts de la liste rouge (comme la consigne de la fonction).
add(['menacées', 'menacés', 'menacée', 'menacé', 'espèces menacées'], { kind: 'statuses', statuses: [Status.VU, Status.EN, Status.CR] });
add(['quasi menacées', 'quasi menacés', 'quasi-menacées', 'quasi-menacés', 'quasi menacée', 'quasi-menacée'], { kind: 'statuses', statuses: [Status.NT] });
add(['vulnérables', 'vulnérable'], { kind: 'statuses', statuses: [Status.VU] });
add(['en danger critique'], { kind: 'statuses', statuses: [Status.CR] });
add(['en danger'], { kind: 'statuses', statuses: [Status.EN] });
add(['préoccupation mineure'], { kind: 'statuses', statuses: [Status.LC] });

// Milieux (avec leur préposition : « forêt » seul peut être un nom de lieu).
const FORESTS = [Habitat.FOREST_DECIDUOUS, Habitat.FOREST_CONIFEROUS, Habitat.FOREST_MIXED];
add(['en forêt', 'dans les forêts', 'en sous-bois'], { kind: 'habitats', habitats: FORESTS });
add(['en forêt de feuillus'], { kind: 'habitats', habitats: [Habitat.FOREST_DECIDUOUS] });
add(['en forêt de conifères'], { kind: 'habitats', habitats: [Habitat.FOREST_CONIFEROUS] });
add(['en forêt mixte'], { kind: 'habitats', habitats: [Habitat.FOREST_MIXED] });
add(['en montagne'], { kind: 'habitats', habitats: [Habitat.MOUNTAIN] });
add(['en ville', 'en milieu urbain'], { kind: 'habitats', habitats: [Habitat.URBAN] });
add(['en zone humide', 'en zones humides', 'dans les zones humides'], { kind: 'habitats', habitats: [Habitat.WETLAND] });
add(['en prairie', 'dans les prairies'], { kind: 'habitats', habitats: [Habitat.GRASSLAND] });
add(['sur le littoral', 'en bord de mer', 'au bord de la mer'], { kind: 'habitats', habitats: [Habitat.COASTAL] });
add(['en mer'], { kind: 'habitats', habitats: [Habitat.MARINE] });
add(['en eau douce'], { kind: 'habitats', habitats: [Habitat.FRESHWATER] });
add(['en milieu agricole'], { kind: 'habitats', habitats: [Habitat.AGRICULTURAL] });
add(['en grotte', 'dans les grottes'], { kind: 'habitats', habitats: [Habitat.CAVE] });
add(['sur les falaises', 'en falaise'], { kind: 'habitats', habitats: [Habitat.CLIFF_ROCK] });

// « Chez moi » = la position actuelle de l'appareil.
add([
    'près de chez moi', 'autour de chez moi', 'pas loin de chez moi', 'à côté de chez moi', 'chez moi',
    'près de moi', 'autour de moi', 'dans le coin', 'dans les environs',
], { kind: 'near' });

// Départements : seulement après « en » ou « dans le/la/les » (« Nord »,
// « Lot » ou « Somme » sont aussi des mots courants), avec une majuscule.
const DEPARTMENT_ENTRIES = FRENCH_DEPARTMENTS.map(department => ({ tokens: words(department.name), name: department.name }))
    .sort((a, b) => b.tokens.length - a.tokens.length);

const MONTHS = words('janvier février mars avril mai juin juillet août septembre octobre novembre décembre');
const SEASONS: Readonly<Record<string, SearchSeason>> = { printemps: 'spring', ete: 'summer', automne: 'autumn', hiver: 'winter' };
const NUMBER_WORDS: Readonly<Record<string, number>> = {
    un: 1, une: 1, deux: 2, trois: 3, quatre: 4, cinq: 5, six: 6, sept: 7, huit: 8, neuf: 9, dix: 10,
    onze: 11, douze: 12, quinze: 15, vingt: 20, trente: 30, soixante: 60, cent: 100,
};
/** « été » est aussi un participe (« ont été vus ») : pas une saison après ces mots. */
const BEFORE_PARTICIPLE = new Set(words('a ai as avons avez ont avait avaient aurait étant'));

// ---------------------------------------------------------------------------
// Reconnaissance
// ---------------------------------------------------------------------------

interface Match {
    length: number;
    apply: (state: State) => boolean;
}

interface State {
    period: SearchPeriod | null;
    years: Set<number>;
    groups: Set<TaxonomicGroup>;
    categories: Set<TaxonCategoryKey>;
    statuses: Set<Status>;
    habitats: Set<Habitat>;
    department: string | null;
    near: boolean;
    radiusKm: number | null;
}

const sameTokens = (tokens: readonly Token[], at: number, expected: readonly string[]): boolean =>
    expected.every((word, offset) => tokens[at + offset]?.f === word);

/** Une seule période : une seconde (« en mai et en juin ») n'est pas comprise. */
const setPeriod = (state: State, value: SearchPeriod): boolean => {
    if (state.period) return false;
    state.period = value;
    return true;
};

const isYear = (token: Token | undefined): token is Token & { num: number } =>
    token !== undefined && token.num !== null && Number.isInteger(token.num) && /^\d{4}$/.test(token.raw)
    && token.num >= AI_SEARCH_LIMITS.minYear && token.num <= 2100;

const numberAt = (token: Token | undefined): number | null => {
    if (!token) return null;
    if (token.num !== null) return token.num;
    return NUMBER_WORDS[token.f] ?? null;
};

/** Après un mois ou une saison : quelle année ? Renvoie le nombre de mots lus. */
const yearScopeAfter = (tokens: readonly Token[], at: number): { scope: SearchYearScope; length: number; year?: number } => {
    const tries: Array<[string, SearchYearScope]> = [
        ['dernier', 'most_recent'], ['derniere', 'most_recent'], ['passe', 'most_recent'],
        ['de cette annee', 'this_year'], ['cette annee', 'this_year'],
        ["de l an dernier", 'last_year'], ["l an dernier", 'last_year'], ["de l annee derniere", 'last_year'],
        ["l annee derniere", 'last_year'], ['an dernier', 'last_year'],
    ].map(([expression, scope]) => [expression, scope as SearchYearScope]);
    let best: { scope: SearchYearScope; length: number } | null = null;
    for (const [expression, scope] of tries) {
        const expected = expression.split(' ');
        if (sameTokens(tokens, at, expected) && (!best || expected.length > best.length)) best = { scope, length: expected.length };
    }
    if (best) return best;
    if (isYear(tokens[at])) return { scope: 'all', length: 1, year: tokens[at].num as number };
    return { scope: 'all', length: 0 };
};

/** Toutes les reconnaissances possibles à la position `at` (sans le contrôle du qualificatif). */
const matchersAt = (tokens: readonly Token[], at: number): Match[] => {
    const matches: Match[] = [];
    const token = tokens[at];
    if (!token) return matches;

    for (const entry of LEXICON) {
        if (!sameTokens(tokens, at, entry.tokens)) continue;
        const effect = entry.effect;
        matches.push({
            length: entry.tokens.length,
            apply: state => {
                switch (effect.kind) {
                    case 'period': return setPeriod(state, effect.period);
                    case 'groups': effect.groups.forEach(group => state.groups.add(group)); return true;
                    case 'categories': effect.categories.forEach(key => state.categories.add(key)); return true;
                    case 'statuses': effect.statuses.forEach(status => state.statuses.add(status)); return true;
                    case 'habitats': effect.habitats.forEach(habitat => state.habitats.add(habitat)); return true;
                    case 'near': state.near = true; return true;
                    case 'department': return false;
                }
            },
        });
    }

    // Mois : « mai », « mai dernier », « mai 2024 », « mai de l'an dernier ».
    const monthIndex = MONTHS.indexOf(token.f);
    if (monthIndex >= 0) {
        const after = yearScopeAfter(tokens, at + 1);
        matches.push({
            length: 1 + after.length,
            apply: state => {
                if (after.year !== undefined) state.years.add(after.year);
                return setPeriod(state, { kind: 'month', days: null, month: monthIndex + 1, season: null, yearScope: after.scope });
            },
        });
    }

    // Saisons : « au printemps », « cet été », « l'hiver dernier », « été 2024 ».
    const seasonAt = (index: number): SearchSeason | null => {
        const word = tokens[index];
        if (!word || !(word.f in SEASONS)) return null;
        if (word.f === 'ete' && index > 0 && BEFORE_PARTICIPLE.has(tokens[index - 1].f)) return null;
        return SEASONS[word.f];
    };
    const thisSeason = (token.f === 'cet' || token.f === 'ce') ? seasonAt(at + 1) : null;
    if (thisSeason) {
        matches.push({
            length: 2,
            apply: state => setPeriod(state, { kind: 'season', days: null, month: null, season: thisSeason, yearScope: 'this_year' }),
        });
    }
    // « ont été vus » : participe, compris comme un mot outil.
    if (token.f === 'ete' && at > 0 && BEFORE_PARTICIPLE.has(tokens[at - 1].f)) {
        matches.push({ length: 1, apply: () => true });
    }
    const season = seasonAt(at);
    if (season) {
        const after = yearScopeAfter(tokens, at + 1);
        matches.push({
            length: 1 + after.length,
            apply: state => {
                if (after.year !== undefined) state.years.add(after.year);
                return setPeriod(state, { kind: 'season', days: null, month: null, season, yearScope: after.scope });
            },
        });
    }

    // Années : « 2024 », « de 2020 à 2022 », « entre 2020 et 2022 », « 2020-2022 ».
    const yearRange = (from: number, to: number): number[] | null => {
        if (to < from || to - from + 1 > AI_SEARCH_LIMITS.maxYears) return null;
        return Array.from({ length: to - from + 1 }, (_, index) => from + index);
    };
    if ((token.f === 'de' || token.f === 'entre') && isYear(tokens[at + 1])
        && (tokens[at + 2]?.f === (token.f === 'de' ? 'a' : 'et')) && isYear(tokens[at + 3])) {
        const range = yearRange(tokens[at + 1].num as number, tokens[at + 3].num as number);
        if (range) matches.push({ length: 4, apply: state => { range.forEach(year => state.years.add(year)); return true; } });
    }
    if (isYear(token)) {
        const next = tokens[at + 1];
        // « 2020-2022 » ou « 2020 à 2022 ».
        if (isYear(next) && /^\s*-\s*$/.test(next.before)) {
            const range = yearRange(token.num as number, next.num as number);
            if (range) matches.push({ length: 2, apply: state => { range.forEach(year => state.years.add(year)); return true; } });
        }
        if (tokens[at + 1]?.f === 'a' && isYear(tokens[at + 2])) {
            const range = yearRange(token.num as number, tokens[at + 2].num as number);
            if (range) matches.push({ length: 3, apply: state => { range.forEach(year => state.years.add(year)); return true; } });
        }
        matches.push({ length: 1, apply: state => { state.years.add(token.num as number); return true; } });
    }

    // « les 10 derniers jours », « ces deux dernières semaines ».
    const count = numberAt(token);
    if (count !== null && Number.isInteger(count) && count >= 1) {
        const unit = tokens[at + 2]?.f;
        const last = tokens[at + 1]?.f;
        if ((last === 'derniers' || last === 'dernieres') && (unit === 'jours' || unit === 'jour' || unit === 'semaines' || unit === 'semaine')) {
            const days = unit.startsWith('semaine') ? count * 7 : count;
            if (days <= AI_SEARCH_LIMITS.maxDays) {
                matches.push({ length: 3, apply: state => setPeriod(state, { kind: 'last_n_days', days, month: null, season: null, yearScope: null }) });
            }
        }
    }

    // Rayon : « à moins de 5 km », « dans un rayon de 500 m » (avec « chez moi »).
    const radiusAt = (index: number): { km: number; length: number } | null => {
        const value = tokens[index]?.num;
        const unit = tokens[index + 1]?.f;
        if (value === null || value === undefined || !unit) return null;
        if (unit === 'km' || unit === 'kilometres' || unit === 'kilometre') return { km: value, length: 2 };
        if (unit === 'm' || unit === 'metres' || unit === 'metre') return { km: value / 1000, length: 2 };
        return null;
    };
    const radiusPrefixes = [['a', 'moins', 'de'], ['moins', 'de'], ['dans', 'un', 'rayon', 'de'], ['rayon', 'de']];
    for (const prefix of radiusPrefixes) {
        if (!sameTokens(tokens, at, prefix)) continue;
        const radius = radiusAt(at + prefix.length);
        if (!radius) continue;
        const km = clampRadiusKm(radius.km);
        if (km !== null) matches.push({ length: prefix.length + radius.length, apply: state => { state.radiusKm = km; return true; } });
    }

    // Département : « en Gironde », « dans le Nord », « dans les Landes », « dans le 33 ».
    const articles = token.f === 'en' ? [[]] : token.f === 'dans' ? [['le'], ['la'], ['les'], ['l']] : [];
    for (const article of articles) {
        const startAt = at + 1 + article.length;
        if (article.length > 0 && !sameTokens(tokens, at + 1, article)) continue;
        const first = tokens[startAt];
        if (!first) continue;
        if (token.f === 'dans' && article[0] === 'le' && first.num !== null && /^\d{2,3}$/.test(first.raw)) {
            matches.push({ length: 2 + article.length, apply: state => { if (state.department) return false; state.department = first.raw; return true; } });
            continue;
        }
        if (!first.capital) continue;
        const department = DEPARTMENT_ENTRIES.find(entry => sameTokens(tokens, startAt, entry.tokens));
        if (department) {
            matches.push({
                length: 1 + article.length + department.tokens.length,
                apply: state => { if (state.department) return false; state.department = department.name; return true; },
            });
        }
    }

    return matches;
};

const isTaxonMatch = (tokens: readonly Token[], at: number, length: number): boolean =>
    LEXICON.some(entry => entry.taxon && entry.tokens.length === length && sameTokens(tokens, at, entry.tokens));

/** Le mot à `at` est-il un mot inconnu (ni outil, ni début d'une reconnaissance) ? */
const isUnknownAt = (tokens: readonly Token[], at: number): boolean => {
    const token = tokens[at];
    if (!token || STOPWORDS.has(token.f)) return false;
    return matchersAt(tokens, at).length === 0;
};

/**
 * Un ensemble (« canards ») suivi d'un qualificatif (« colverts ») ou d'un
 * complément (« des murailles ») désigne une espèce : refusé.
 */
const followedByQualifier = (tokens: readonly Token[], end: number): boolean => {
    if (isUnknownAt(tokens, end)) return true;
    const next = tokens[end]?.f;
    return (next === 'de' || next === 'des' || next === 'du' || next === 'd') && isUnknownAt(tokens, end + 1);
};

/** Analyse la phrase, sans aucun appel. */
export const analyzeNaturalSearch = (phrase: string): LocalSearchAnalysis => {
    const tokens = tokenize(phrase);
    const state: State = {
        period: null, years: new Set(), groups: new Set(), categories: new Set(), statuses: new Set(),
        habitats: new Set(), department: null, near: false, radiusKm: null,
    };
    /** 'used' : compris ; 'stop' : mot outil ; 'free' : non compris. */
    const kinds: Array<'used' | 'stop' | 'free'> = tokens.map(() => 'free');
    /** Rayon lu sans « chez moi » : redevient du texte non compris. */
    let radiusSpan: [number, number] | null = null;

    let index = 0;
    while (index < tokens.length) {
        const candidates = matchersAt(tokens, index)
            .filter(match => !(isTaxonMatch(tokens, index, match.length) && followedByQualifier(tokens, index + match.length)))
            .sort((a, b) => b.length - a.length);
        let applied = 0;
        for (const candidate of candidates) {
            const before = state.radiusKm;
            if (candidate.apply(state)) {
                applied = candidate.length;
                if (state.radiusKm !== before) radiusSpan = [index, index + candidate.length];
                break;
            }
        }
        if (applied > 0) {
            for (let offset = 0; offset < applied; offset += 1) kinds[index + offset] = 'used';
            index += applied;
            continue;
        }
        kinds[index] = STOPWORDS.has(tokens[index].f) ? 'stop' : 'free';
        index += 1;
    }
    if (radiusSpan && !state.near) {
        for (let i = radiusSpan[0]; i < radiusSpan[1]; i += 1) kinds[i] = STOPWORDS.has(tokens[i].f) ? 'stop' : 'free';
    }

    // Texte libre : chaque suite de mots non compris, avec les mots outils
    // qu'elle enserre (« lézard des murailles »), telle qu'écrite.
    const runs: string[] = [];
    const unknownWords: string[] = [];
    let runStart = -1;
    let runEnd = -1;
    for (let i = 0; i <= tokens.length; i += 1) {
        const kind = kinds[i];
        if (kind === 'free') {
            unknownWords.push(tokens[i].raw);
            if (runStart < 0) runStart = i;
            runEnd = i;
            continue;
        }
        if (kind === 'stop' && runStart >= 0) continue;
        if (runStart >= 0) {
            runs.push(phrase.slice(tokens[runStart].start, tokens[runEnd].end));
            runStart = -1;
            runEnd = -1;
        }
    }

    const notes: string[] = [];
    const criteria = emptyCriteria();
    criteria.years = [...state.years].sort((a, b) => a - b);
    criteria.period = state.period;
    // Une année écrite l'emporte sur une période qui fixe déjà l'année (comme la fonction).
    if (criteria.period && criteria.years.length > 0) {
        if (periodFixesYear(criteria.period)) {
            criteria.period = null;
            notes.push("L'année écrite l'emporte sur la période relative, qui est ignorée.");
        }
    }
    criteria.groups = Object.values(TaxonomicGroup).filter(group => state.groups.has(group));
    criteria.categories = TAXON_CATEGORIES.map(category => category.key).filter(key => state.categories.has(key));
    criteria.statuses = Object.values(Status).filter(status => state.statuses.has(status));
    criteria.habitats = Object.values(Habitat).filter(habitat => state.habitats.has(habitat));
    criteria.department = state.department;
    criteria.near = state.near
        ? { kind: 'current_position', placeName: null, radiusKm: state.radiusKm ?? AI_SEARCH_LIMITS.defaultRadiusKm }
        : null;
    const text = runs.join(' ').trim();
    criteria.text = text.length > 0 ? text.slice(0, AI_SEARCH_LIMITS.maxTextChars) : null;

    const hasCriteria = criteria.period !== null || criteria.years.length > 0 || criteria.groups.length > 0
        || criteria.categories.length > 0 || criteria.statuses.length > 0 || criteria.habitats.length > 0
        || criteria.department !== null || criteria.near !== null;
    return { criteria, hasCriteria, understood: unknownWords.length === 0, unknownWords, notes };
};

/** Clé normalisée d'une phrase (cache) : mots sans casse ni accents, séparés d'une espace. */
export const normalizePhraseKey = (phrase: string): string => tokenize(phrase).map(token => token.f).join(' ');

/** Nombre de mots de la phrase. */
export const countWords = (phrase: string): number => tokenize(phrase).length;
