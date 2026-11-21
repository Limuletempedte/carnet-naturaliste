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
import { FRENCH_DEPARTMENTS, normalizeDepartment } from './frenchDepartments';
import { TAXON_CATEGORIES, type TaxonCategoryKey } from './taxonCategories';

export interface LocalSearchAnalysis {
    criteria: SearchCriteria;
    /** Au moins un critère autre que le texte libre (période, groupe, lieu…). */
    hasCriteria: boolean;
    /** Tous les mots ont été compris (aucun texte libre restant). */
    understood: boolean;
    /** Mots non compris, tels qu'écrits (gardés en texte libre). */
    unknownWords: string[];
    /**
     * Passages non compris SÉPARÉS par des mots compris (« chouette effraie
     * en mai à Pessac ») : jamais collés en un seul texte. La phrase n'est
     * alors pas applicable telle quelle (seule l'IA peut l'interpréter).
     */
    fragments: string[];
    /** La phrase contient un mot outil (« les », « en », « près »…). */
    hasFunctionWord: boolean;
    /**
     * Un mot d'ensemble du dictionnaire (« oiseaux », « canards »,
     * « hirondelles ») suivi d'un complément (« de Pessac », « colverts ») :
     * rien n'est appliqué (c'est peut-être une espèce ou un lieu), mais
     * l'assistant peut interpréter la phrase.
     */
    hasTaxonWord: boolean;
    /**
     * C'est clairement une phrase (mot outil, ou plusieurs critères) : Entrée
     * peut appliquer ce qui est compris. Sinon (« Fougères »), la recherche
     * par nom reste la règle, et le filtre ne s'applique que sur un clic.
     */
    clearlyPhrase: boolean;
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

// Un nombre (« 2,5 ») ; ou un mot, chiffres compris (« 2A », « 500m »).
const TOKEN_RE = /\d+(?:[.,]\d+)?(?![\p{L}\p{N}])|[\p{L}\p{M}\p{N}]+/gu;

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
            num: /^\d+(?:[.,]\d+)?$/.test(raw) ? Number(raw.replace(',', '.')) : null,
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
    // Participes : jamais des qualificatifs d'espèce (« rapaces entendus en mai »).
    "entendu entendus entendue entendues aperçu aperçus aperçue aperçues photographié photographiés photographiée " +
    "photographiées croisé croisés croisée croisées noté notés notée notées repéré repérés repérée repérées " +
    "contacté contactés contactée contactées signalé signalés signalée signalées ayant " +
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
    /** Contrôle sur les mots tels qu'écrits (accents) : « menacés » oui, « menaces » (le nom) non. */
    rawCheck?: (raws: readonly string[]) => boolean;
}

const period = (kind: SearchPeriod['kind'], extra: Partial<SearchPeriod> = {}): Effect => ({
    kind: 'period',
    period: { kind, days: null, month: null, season: null, yearScope: null, ...extra },
});

const LEXICON: LexiconEntry[] = [];
const add = (expressions: readonly string[], effect: Effect, taxon = false, rawCheck?: LexiconEntry['rawCheck']) => {
    for (const expression of expressions) LEXICON.push({ tokens: words(expression), effect, taxon, rawCheck });
};
/** Le dernier mot porte l'accent du participe (« menacés », pas « menaces »). */
const accentedParticiple = (raws: readonly string[]) => /é(e?s?)$/u.test((raws[raws.length - 1] ?? '').normalize('NFC').toLowerCase());

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
add(['menacées', 'menacés', 'menacée', 'menacé'], { kind: 'statuses', statuses: [Status.VU, Status.EN, Status.CR] }, false, accentedParticiple);
add(['quasi menacées', 'quasi menacés', 'quasi menacée'], { kind: 'statuses', statuses: [Status.NT] }, false, accentedParticiple);
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
const DEPARTMENT_ENTRIES = [
    ...FRENCH_DEPARTMENTS.map(department => ({ tokens: words(department.name), name: department.name })),
    // « en Corse » : les deux départements (et le « 20 » des codes postaux).
    { tokens: ['corse'], name: 'Corse' },
].sort((a, b) => b.tokens.length - a.tokens.length);
/** Groupe de chaque catégorie (« les oiseaux limicoles » = la seule catégorie). */
const CATEGORY_GROUP: ReadonlyMap<string, TaxonomicGroup> = new Map(TAXON_CATEGORIES.map(category => [category.key, category.group]));

const MONTHS = words('janvier février mars avril mai juin juillet août septembre octobre novembre décembre');
// Des Map, jamais des objets : un mot tapé (« constructor », « __proto__ »)
// ne doit jamais tomber sur une clé héritée d'Object.
const SEASONS: ReadonlyMap<string, SearchSeason> = new Map([['printemps', 'spring'], ['ete', 'summer'], ['automne', 'autumn'], ['hiver', 'winter']]);
const NUMBER_WORDS: ReadonlyMap<string, number> = new Map([
    ['un', 1], ['une', 1], ['deux', 2], ['trois', 3], ['quatre', 4], ['cinq', 5], ['six', 6], ['sept', 7], ['huit', 8], ['neuf', 9],
    ['dix', 10], ['onze', 11], ['douze', 12], ['quinze', 15], ['vingt', 20], ['trente', 30], ['soixante', 60], ['cent', 100],
]);
/** « été » est aussi un participe (« ont été vus ») : pas une saison après ces mots. */
const BEFORE_PARTICIPLE = new Set(words('a ai as avons avez ont avait avaient aurait étant ayant'));
/** Mots qui donnent son contexte temporel à un mois ou une saison (« en mai », « au printemps »). */
const TEMPORAL_BEFORE = new Set(words('en au pendant durant depuis début fin mi courant'));
/** Devant un mois ou une saison, compris avec lui (« fin mai », « début mars », « mi-avril ») : le mois entier. */
const MONTH_EDGES = new Set(words('début fin mi courant'));
/** Avant un lieu : « à Fougères », « vers Pessac », « près de Pessac » (un nom à majuscule y est un lieu). */
const PLACE_BEFORE = new Set(words('à vers'));
const PLACE_BEFORE_DE = new Set(words('près autour proche loin'));
/**
 * Petits mots qui se trouvent aussi DANS un nom (« Cèpe d'été », « commune de
 * Fougères ») : au milieu de mots inconnus, ils ne font pas une phrase.
 */
const NAME_FILLERS = new Set(words('le la les l de d du des aux au un une et à'));
/** Prépositions d'un complément de nom (« Étang des Canards », « Île aux Oiseaux », « Hygrophore de mars »). */
const NAME_LINKS = new Set(words('de d du des aux'));

// ---------------------------------------------------------------------------
// Reconnaissance
// ---------------------------------------------------------------------------

interface Match {
    length: number;
    apply: (state: State) => boolean;
    /** Ce qui a été reconnu (lexique), pour les règles de voisinage. */
    effect?: Effect;
    /**
     * `time-after` : mois ou saison reconnu par ce qui le suit (« mars 2024 ») ;
     * `taxon` : nom d'un ensemble d'espèces. Tous deux refusés dans un nom
     * propre ou un nom d'espèce (« Petit Mars 2024 », « Étang des Canards »).
     */
    guard?: 'time-after' | 'taxon';
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
    return NUMBER_WORDS.get(token.f) ?? null;
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

/** Précédé d'un mot de temps : « en mai », « au printemps », « pendant l'hiver », « tout l'été ». */
const temporalBefore = (tokens: readonly Token[], at: number): boolean => {
    const previous = tokens[at - 1];
    if (!previous) return false;
    if (TEMPORAL_BEFORE.has(previous.f)) return true;
    // « champignons d'automne », « oiseaux de mai » : un ensemble du dictionnaire, puis « de » et la période.
    if ((previous.f === 'de' || previous.f === 'd') && taxonEndsAt(tokens, at - 1)) return true;
    const before = tokens[at - 2];
    return (previous.f === 'l' || previous.f === 'le') && before !== undefined && (TEMPORAL_BEFORE.has(before.f) || before.f === 'tout');
};

/** Un ensemble du dictionnaire (groupe ou catégorie) finit-il juste avant l'indice `end` ? */
function taxonEndsAt(tokens: readonly Token[], end: number): boolean {
    return LEXICON.some(entry => entry.taxon && end - entry.tokens.length >= 0 && sameTokens(tokens, end - entry.tokens.length, entry.tokens));
}

/** Premiers mots des ensembles du dictionnaire (« oiseaux », « canards », « hirondelles »…). */
const TAXON_HEADS: ReadonlySet<string> = new Set(LEXICON.filter(entry => entry.taxon).map(entry => entry.tokens[0]));

/** Un mois ou une saison n'est reconnu qu'avec un contexte temporel, avant ou après. */
const hasTemporalContext = (tokens: readonly Token[], at: number, afterLength: number): boolean =>
    afterLength > 0 || temporalBefore(tokens, at);

/** Toutes les reconnaissances possibles à la position `at` (sans le contrôle du qualificatif). */
const matchersAt = (tokens: readonly Token[], at: number): Match[] => {
    const matches: Match[] = [];
    const token = tokens[at];
    if (!token) return matches;

    for (const entry of LEXICON) {
        if (!sameTokens(tokens, at, entry.tokens)) continue;
        if (entry.rawCheck && !entry.rawCheck(tokens.slice(at, at + entry.tokens.length).map(item => item.raw))) continue;
        // « dans les environs de Bordeaux » : un lieu nommé, pas la position actuelle.
        if (entry.effect.kind === 'near' && NAME_LINKS.has(tokens[at + entry.tokens.length]?.f ?? '')) continue;
        const effect = entry.effect;
        matches.push({
            length: entry.tokens.length,
            effect,
            guard: entry.taxon ? 'taxon' : undefined,
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

    // Mois : seulement avec un contexte temporel (« en mai », « mai dernier »,
    // « mai 2024 », « en mai de l'an dernier ») ; jamais dans un nom (« Petit
    // Mars changeant », « Hygrophore de mars », « Saint-Mars-du-Désert »).
    const monthIndex = MONTHS.indexOf(token.f);
    const after = monthIndex >= 0 || SEASONS.has(token.f) ? yearScopeAfter(tokens, at + 1) : null;
    if (monthIndex >= 0 && after && hasTemporalContext(tokens, at, after.length)) {
        matches.push({
            length: 1 + after.length,
            guard: temporalBefore(tokens, at) ? undefined : 'time-after',
            apply: state => {
                if (after.year !== undefined) state.years.add(after.year);
                return setPeriod(state, { kind: 'month', days: null, month: monthIndex + 1, season: null, yearScope: after.scope });
            },
        });
    }

    // « fin mai », « début mars », « mi-avril », « courant juin » : le mois (ou la saison) entier.
    if (MONTH_EDGES.has(token.f)) {
        const next = tokens[at + 1];
        const edgeMonth = next ? MONTHS.indexOf(next.f) : -1;
        const edgeSeason = next ? SEASONS.get(next.f) : undefined;
        if (edgeMonth >= 0 || edgeSeason) {
            const edgeAfter = yearScopeAfter(tokens, at + 2);
            matches.push({
                length: 2 + edgeAfter.length,
                apply: state => {
                    if (edgeAfter.year !== undefined) state.years.add(edgeAfter.year);
                    return setPeriod(state, edgeMonth >= 0
                        ? { kind: 'month', days: null, month: edgeMonth + 1, season: null, yearScope: edgeAfter.scope }
                        : { kind: 'season', days: null, month: null, season: edgeSeason ?? null, yearScope: edgeAfter.scope });
                },
            });
        }
    }

    // Saisons : « au printemps », « cet été », « l'hiver dernier », « été 2024 » ;
    // jamais dans un nom (« Cèpe d'été »).
    const seasonAt = (index: number): SearchSeason | null => {
        const word = tokens[index];
        if (!word) return null;
        const found = SEASONS.get(word.f);
        if (!found) return null;
        if (word.f === 'ete' && index > 0 && BEFORE_PARTICIPLE.has(tokens[index - 1].f)) return null;
        return found;
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
    if (season && after && hasTemporalContext(tokens, at, after.length)) {
        matches.push({
            length: 1 + after.length,
            guard: temporalBefore(tokens, at) ? undefined : 'time-after',
            apply: state => {
                if (after.year !== undefined) state.years.add(after.year);
                return setPeriod(state, { kind: 'season', days: null, month: null, season, yearScope: after.scope });
            },
        });
    }

    // Années : « 2024 », « de 2020 à 2022 », « entre 2020 et 2022 », « 2020-2022 ».
    // Bornes dans n'importe quel ordre (« de 2022 à 2020 »).
    const yearRange = (a: number, b: number): number[] | null => {
        const from = Math.min(a, b);
        const to = Math.max(a, b);
        if (to - from + 1 > AI_SEARCH_LIMITS.maxYears) return null;
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
        // Collé : « 5km », « 500m ».
        const glued = /^(\d+(?:[.,]\d+)?)(km|m)$/i.exec(tokens[index]?.raw ?? '');
        if (glued) {
            const amount = Number(glued[1].replace(',', '.'));
            return { km: glued[2].toLowerCase() === 'km' ? amount : amount / 1000, length: 1 };
        }
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
        // « 0 km » : le plus petit rayon permis, jamais le rayon par défaut (10 km).
        const km = radius.km === 0 ? AI_SEARCH_LIMITS.minRadiusKm : clampRadiusKm(radius.km);
        if (km !== null) matches.push({ length: prefix.length + radius.length, apply: state => { state.radiusKm = km; return true; } });
    }

    // Département : « en Gironde », « dans le Nord », « dans les Landes », « dans le 33 ».
    const articles = token.f === 'en' ? [[]] : token.f === 'dans' ? [['le'], ['la'], ['les'], ['l']] : [];
    for (const article of articles) {
        const startAt = at + 1 + article.length;
        if (article.length > 0 && !sameTokens(tokens, at + 1, article)) continue;
        const first = tokens[startAt];
        if (!first) continue;
        // « dans le 33 », « dans le 2A » : seulement un numéro qui existe (« 99 » n'est pas compris).
        if (token.f === 'dans' && article[0] === 'le' && /^(?:\d{2,3}|2[ab])$/i.test(first.raw) && normalizeDepartment(first.raw) !== null) {
            matches.push({ length: 2 + article.length, apply: state => { if (state.department) return false; state.department = first.raw.toUpperCase(); return true; } });
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
        // Dans un nom : juste après un mot inconnu (« Petit Mars 2024 »), ou
        // après « de », « des », « aux »… qui suit un mot inconnu (« Étang des
        // Canards », « Hygrophore de mars 2024 »).
        const afterUnknown = kinds[index - 1] === 'free';
        // « oiseaux à Fougères », « près de Pessac » : après une préposition de
        // lieu, un nom à majuscule est un lieu, jamais un groupe ni une catégorie.
        const previousWord = tokens[index - 1]?.f ?? '';
        const afterPlace = tokens[index].capital && (PLACE_BEFORE.has(previousWord)
            || ((previousWord === 'de' || previousWord === 'd' || previousWord === 'du' || previousWord === 'des')
                && PLACE_BEFORE_DE.has(tokens[index - 2]?.f ?? '')));
        const afterNameLink = kinds[index - 1] === 'stop' && NAME_LINKS.has(tokens[index - 1].f) && kinds[index - 2] === 'free';
        const candidates = matchersAt(tokens, index)
            .filter(match => !(isTaxonMatch(tokens, index, match.length) && followedByQualifier(tokens, index + match.length)))
            .filter(match => !(match.guard === 'time-after' && (afterUnknown || afterNameLink)))
            .filter(match => !(match.guard === 'taxon' && (afterNameLink || afterPlace)))
            .sort((a, b) => b.length - a.length);
        let applied = 0;
        for (const candidate of candidates) {
            // « les oiseaux limicoles » : le groupe suivi d'une catégorie de ce groupe ne garde que la catégorie.
            if (candidate.effect?.kind === 'groups') {
                const groups = candidate.effect.groups;
                const refined = matchersAt(tokens, index + candidate.length).some(next => next.effect?.kind === 'categories'
                    && next.effect.categories.every(key => groups.includes(CATEGORY_GROUP.get(key) as TaxonomicGroup)));
                if (refined) {
                    applied = candidate.length;
                    break;
                }
            }
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
    // Un seul passage non compris : c'est le nom cherché. Plusieurs passages
    // séparés : jamais collés (« chouette effraie » … « Pessac » ne donne pas
    // « chouette effraie Pessac ») ; la phrase n'est pas applicable telle quelle.
    const fragments = runs.length > 1 ? runs : [];
    criteria.text = runs.length === 1 ? runs[0].slice(0, AI_SEARCH_LIMITS.maxTextChars) : null;

    const fields = [
        criteria.period !== null || criteria.years.length > 0,
        criteria.groups.length > 0 || criteria.categories.length > 0,
        criteria.statuses.length > 0,
        criteria.habitats.length > 0,
        criteria.department !== null,
        criteria.near !== null,
    ].filter(Boolean).length;
    const hasCriteria = fields > 0;
    // Mot outil hors d'un nom : un petit mot (« de », « la ») entre deux mots
    // non compris fait partie du nom (« Cèpe d'été ») ; « près », « en »,
    // « vus »… font toujours une phrase.
    const insideFreeRun = (at: number): boolean => {
        let before = at - 1;
        while (before >= 0 && kinds[before] === 'stop') before -= 1;
        let after = at + 1;
        while (after < tokens.length && kinds[after] === 'stop') after += 1;
        return kinds[before] === 'free' && kinds[after] === 'free';
    };
    // Un ensemble du dictionnaire refusé parce qu'un complément le suit.
    const hasTaxonWord = tokens.some((token, at) =>
        kinds[at] === 'free' && TAXON_HEADS.has(token.f) && followedByQualifier(tokens, at + 1));
    const hasFunctionWord = tokens.some((token, at) =>
        STOPWORDS.has(token.f) && !(NAME_FILLERS.has(token.f) && kinds[at] === 'stop' && insideFreeRun(at)));
    return {
        criteria,
        hasCriteria,
        understood: unknownWords.length === 0,
        unknownWords,
        fragments,
        hasFunctionWord,
        hasTaxonWord,
        clearlyPhrase: hasCriteria && (hasFunctionWord || fields >= 2),
        notes,
    };
};

/** Clé normalisée d'une phrase (cache) : mots sans casse ni accents, séparés d'une espace. */
export const normalizePhraseKey = (phrase: string): string => tokenize(phrase).map(token => token.f).join(' ');

/** Nombre de mots de la phrase. */
export const countWords = (phrase: string): number => tokenize(phrase).length;
