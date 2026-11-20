// Dictionnaire des catégories de la recherche en langage naturel (phase 4 de
// l'assistant IA, docs/plans/assistant-ia-phases-2-4.md).
//
// Une catégorie regroupe des espèces que le naturaliste nomme ensemble
// (« les rapaces », « les limicoles ») sans qu'un groupe taxonomique de
// l'application (`TaxonomicGroup`, types.ts) y corresponde. Elle est définie
// par la liste de ses GENRES latins : une observation en fait partie si le
// premier mot de son nom latin est l'un de ces genres. Une observation sans
// nom latin n'est donc jamais dans une catégorie (l'application le dira).
//
// Règles :
// - clés stables (jamais renommées : elles circulent entre la fonction
//   `ai-text` et l'application, et resteront dans le cache des phrases) ;
// - pas de catégorie qui recopie un groupe de l'application (chauves-souris
//   = « Chiroptères », orchidées = « Orchidées », libellules = « Odonate »…) :
//   le groupe est le bon filtre, et deux réponses possibles rendraient la
//   recherche instable ;
// - un genre n'appartient qu'à une catégorie (vérifié par
//   tests/taxonCategories.test.ts) ; d'anciens noms de genre encore
//   présents dans des données plus anciennes sont gardés (Philomachus,
//   Leiopicus, Elaphe, Clethrionomys…) ;
// - toute modification change `TAXON_CATEGORIES_VERSION`.
//
// ⚠️ Les clés et les libellés sont RECOPIÉS dans
// supabase/functions/ai-text/logic.ts (`SEARCH_CATEGORIES`, la fonction n'a
// aucun import) : un test vérifie l'égalité.
//
// Dictionnaire à faire relire par un naturaliste avant la mise en service.
// Non utilisé par l'interface tant que la PR B de la recherche n'est pas
// livrée.

import { TaxonomicGroup } from '../types';

/** À changer à toute modification d'une catégorie (clé, libellé, genres). */
export const TAXON_CATEGORIES_VERSION = 1;

export interface TaxonCategory {
    /** Clé stable, en minuscules ASCII. */
    key: string;
    /** Libellé affiché (« J'ai compris : … »). */
    label: string;
    /** Groupe de l'application auquel appartiennent toutes ses espèces. */
    group: TaxonomicGroup;
    /**
     * Expressions françaises qui désignent la catégorie entière, en
     * minuscules (pour l'analyse locale de la PR B). Jamais un mot qui
     * commence un nom d'espèce (« pic », « héron », « mésange ») : « pic
     * noir » est une espèce. Une expression peut désigner plusieurs
     * catégories (« rapaces » : diurnes et nocturnes).
     */
    synonyms: readonly string[];
    /** Genres latins de la catégorie. */
    genera: readonly string[];
}

export const TAXON_CATEGORIES = [
    // --- Oiseaux -------------------------------------------------------------
    {
        key: 'rapaces_diurnes',
        label: 'Rapaces diurnes',
        group: TaxonomicGroup.BIRD,
        synonyms: ['rapaces', 'oiseaux de proie', 'rapaces diurnes', 'rapaces de jour'],
        // Accipitridés, faucons et balbuzard. Astur : autour des palombes
        // (ancien Accipiter gentilis) ; Clanga : aigles criard et pomarin.
        genera: [
            'Accipiter', 'Astur', 'Aquila', 'Hieraaetus', 'Clanga', 'Circaetus', 'Circus', 'Buteo', 'Pernis',
            'Milvus', 'Haliaeetus', 'Gypaetus', 'Gyps', 'Neophron', 'Aegypius', 'Elanus', 'Pandion', 'Falco',
        ],
    },
    {
        key: 'rapaces_nocturnes',
        label: 'Rapaces nocturnes (chouettes et hiboux)',
        group: TaxonomicGroup.BIRD,
        synonyms: ['rapaces', 'oiseaux de proie', 'rapaces nocturnes', 'rapaces de nuit', 'chouettes et hiboux', 'hiboux et chouettes'],
        genera: ['Tyto', 'Strix', 'Bubo', 'Asio', 'Athene', 'Otus', 'Aegolius', 'Glaucidium', 'Surnia'],
    },
    {
        key: 'canards',
        label: 'Canards',
        group: TaxonomicGroup.BIRD,
        synonyms: ['canards'],
        // Anatidés sauf oies et cygnes. Tadornes et ouette d'Égypte
        // (Alopochen, « oie » en anglais) rangés ici, avec les tadornes.
        genera: [
            'Anas', 'Mareca', 'Spatula', 'Aythya', 'Netta', 'Bucephala', 'Mergus', 'Mergellus', 'Melanitta',
            'Somateria', 'Clangula', 'Tadorna', 'Alopochen', 'Aix', 'Oxyura',
        ],
    },
    {
        key: 'oies_cygnes',
        label: 'Oies et cygnes',
        group: TaxonomicGroup.BIRD,
        synonyms: ['oies et cygnes'],
        genera: ['Anser', 'Branta', 'Cygnus'],
    },
    {
        key: 'limicoles',
        label: 'Limicoles',
        group: TaxonomicGroup.BIRD,
        synonyms: ['limicoles', 'petits échassiers'],
        // Huîtrier, avocette, échasse, œdicnème, glaréole, gravelots et
        // pluviers, vanneaux, bécasseaux, barges, courlis, chevaliers,
        // tournepierre, bécassines, bécasse, phalaropes. Anarhynchus :
        // gravelot à collier interrompu ; Eudromias : pluvier guignard ;
        // Philomachus : ancien nom du combattant (Calidris pugnax).
        genera: [
            'Haematopus', 'Recurvirostra', 'Himantopus', 'Burhinus', 'Glareola', 'Charadrius', 'Anarhynchus',
            'Eudromias', 'Pluvialis', 'Vanellus', 'Calidris', 'Philomachus', 'Limosa', 'Numenius', 'Tringa',
            'Xenus', 'Actitis', 'Arenaria', 'Gallinago', 'Lymnocryptes', 'Scolopax', 'Phalaropus',
        ],
    },
    {
        key: 'larides',
        label: 'Mouettes, goélands et sternes',
        group: TaxonomicGroup.BIRD,
        synonyms: ['laridés', 'larides', 'mouettes, goélands et sternes'],
        genera: [
            'Larus', 'Chroicocephalus', 'Ichthyaetus', 'Hydrocoloeus', 'Rissa', 'Xema',
            'Sterna', 'Sternula', 'Thalasseus', 'Gelochelidon', 'Hydroprogne', 'Chlidonias',
        ],
    },
    {
        key: 'ardeides',
        label: 'Hérons, aigrettes et butors',
        group: TaxonomicGroup.BIRD,
        synonyms: ['ardéidés', 'ardeides', 'hérons', 'hérons et aigrettes'],
        genera: ['Ardea', 'Egretta', 'Bubulcus', 'Ardeola', 'Nycticorax', 'Ixobrychus', 'Botaurus'],
    },
    {
        key: 'pics',
        label: 'Pics et torcol',
        group: TaxonomicGroup.BIRD,
        synonyms: ['pics', 'picidés'],
        // Dendrocoptes et Leiopicus (ancien nom) : pic mar ; Dryobates : pic
        // épeichette ; Picoides : pic tridactyle ; Jynx : torcol.
        genera: ['Dendrocopos', 'Dendrocoptes', 'Leiopicus', 'Dryobates', 'Picoides', 'Picus', 'Dryocopus', 'Jynx'],
    },
    {
        key: 'mesanges',
        label: 'Mésanges',
        group: TaxonomicGroup.BIRD,
        synonyms: ['mésanges', 'mesanges'],
        // Paridés, plus la mésange à longue queue (Aegithalos, autre famille
        // mais nommée « mésange »).
        genera: ['Parus', 'Cyanistes', 'Poecile', 'Periparus', 'Lophophanes', 'Aegithalos'],
    },
    {
        key: 'fauvettes',
        label: 'Fauvettes',
        group: TaxonomicGroup.BIRD,
        synonyms: ['fauvettes'],
        // Curruca : la plupart des fauvettes depuis 2020 (grisette,
        // babillarde, mélanocéphale, pitchou…) ; Sylvia : à tête noire, des
        // jardins.
        genera: ['Sylvia', 'Curruca'],
    },
    {
        key: 'hirondelles_martinets',
        label: 'Hirondelles et martinets',
        group: TaxonomicGroup.BIRD,
        synonyms: ['hirondelles et martinets'],
        // Deux familles sans parenté, réunies par l'usage.
        genera: ['Hirundo', 'Cecropis', 'Delichon', 'Riparia', 'Ptyonoprogne', 'Apus', 'Tachymarptis'],
    },
    {
        key: 'corvides',
        label: 'Corvidés (corneilles, pies, geais…)',
        group: TaxonomicGroup.BIRD,
        synonyms: ['corvidés', 'corvides'],
        // Coloeus : choucas (ancien Corvus monedula).
        genera: ['Corvus', 'Coloeus', 'Pica', 'Garrulus', 'Pyrrhocorax', 'Nucifraga'],
    },
    {
        key: 'rallides',
        label: 'Râles, marouettes, gallinules et foulques',
        group: TaxonomicGroup.BIRD,
        synonyms: ['rallidés', 'rallides', 'râles', 'marouettes'],
        genera: ['Rallus', 'Crex', 'Porzana', 'Zapornia', 'Gallinula', 'Fulica', 'Porphyrio'],
    },
    {
        key: 'fringilles',
        label: 'Fringilles (pinsons, chardonnerets, verdiers…)',
        group: TaxonomicGroup.BIRD,
        synonyms: ['fringilles', 'fringillidés', 'fringillides'],
        genera: [
            'Fringilla', 'Carduelis', 'Chloris', 'Spinus', 'Linaria', 'Acanthis', 'Serinus', 'Pyrrhula',
            'Coccothraustes', 'Loxia', 'Carpodacus',
        ],
    },
    {
        key: 'pipits_bergeronnettes',
        label: 'Pipits et bergeronnettes',
        group: TaxonomicGroup.BIRD,
        synonyms: ['pipits et bergeronnettes', 'motacillidés'],
        genera: ['Anthus', 'Motacilla'],
    },
    // --- Mammifères ------------------------------------------------------------
    {
        key: 'ongules',
        label: 'Ongulés (cerfs, chevreuils, sangliers, chamois…)',
        group: TaxonomicGroup.MAMMAL,
        synonyms: ['ongulés', 'ongules', 'grand gibier'],
        genera: ['Capreolus', 'Cervus', 'Dama', 'Sus', 'Rupicapra', 'Capra', 'Ovis'],
    },
    {
        key: 'mustelides',
        label: 'Mustélidés (martres, fouines, belettes, blaireaux, loutres…)',
        group: TaxonomicGroup.MAMMAL,
        synonyms: ['mustélidés', 'mustelides'],
        // Neogale : vison d'Amérique (ancien Neovison).
        genera: ['Martes', 'Mustela', 'Meles', 'Lutra', 'Neogale'],
    },
    {
        key: 'rongeurs',
        label: 'Rongeurs',
        group: TaxonomicGroup.MAMMAL,
        synonyms: ['rongeurs'],
        // Clethrionomys : ancien nom des campagnols roussâtres (Myodes).
        genera: [
            'Sciurus', 'Marmota', 'Castor', 'Glis', 'Eliomys', 'Muscardinus', 'Cricetus', 'Myocastor', 'Ondatra',
            'Arvicola', 'Microtus', 'Chionomys', 'Myodes', 'Clethrionomys', 'Micromys', 'Apodemus', 'Mus', 'Rattus',
        ],
    },
    // --- Reptiles --------------------------------------------------------------
    {
        key: 'serpents',
        label: 'Serpents (couleuvres et vipères)',
        group: TaxonomicGroup.REPTILE,
        synonyms: ['serpents', 'couleuvres et vipères', 'ophidiens'],
        // Elaphe et Rhinechis : anciens noms de couleuvres aujourd'hui
        // rangées dans Zamenis. L'orvet (Anguis) est un lézard sans pattes :
        // dans aucune catégorie.
        genera: ['Natrix', 'Zamenis', 'Elaphe', 'Rhinechis', 'Coronella', 'Hierophis', 'Malpolon', 'Vipera'],
    },
    {
        key: 'lezards',
        label: 'Lézards et geckos',
        group: TaxonomicGroup.REPTILE,
        synonyms: ['lézards', 'lezards', 'lézards et geckos'],
        genera: [
            'Lacerta', 'Timon', 'Podarcis', 'Zootoca', 'Iberolacerta', 'Archaeolacerta', 'Algyroides',
            'Psammodromus', 'Acanthodactylus', 'Chalcides', 'Tarentola', 'Hemidactylus', 'Euleptes',
        ],
    },
    {
        key: 'tortues',
        label: 'Tortues',
        group: TaxonomicGroup.REPTILE,
        synonyms: ['tortues', 'chéloniens'],
        genera: ['Emys', 'Testudo', 'Mauremys', 'Trachemys', 'Caretta', 'Chelonia', 'Dermochelys'],
    },
    // --- Amphibiens ------------------------------------------------------------
    {
        key: 'anoures',
        label: 'Grenouilles et crapauds',
        group: TaxonomicGroup.AMPHIBIAN,
        synonyms: ['anoures', 'grenouilles et crapauds', 'crapauds et grenouilles'],
        // Lithobates : ouaouaron ; Xenopus : xénope (espèces introduites).
        genera: [
            'Rana', 'Pelophylax', 'Lithobates', 'Bufo', 'Epidalea', 'Bufotes', 'Hyla', 'Alytes', 'Pelodytes',
            'Pelobates', 'Bombina', 'Discoglossus', 'Xenopus',
        ],
    },
    {
        key: 'urodeles',
        label: 'Tritons et salamandres',
        group: TaxonomicGroup.AMPHIBIAN,
        synonyms: ['urodèles', 'urodeles', 'tritons et salamandres', 'salamandres et tritons'],
        // Hydromantes : ancien nom des spélerpès (Speleomantes).
        genera: ['Salamandra', 'Triturus', 'Lissotriton', 'Ichthyosaura', 'Calotriton', 'Euproctus', 'Speleomantes', 'Hydromantes'],
    },
    // --- Plantes et champignons -------------------------------------------------
    {
        key: 'fougeres',
        label: 'Fougères',
        group: TaxonomicGroup.BOTANY,
        synonyms: ['fougères', 'fougeres'],
        // Ceterach et Phyllitis : anciens noms (aujourd'hui Asplenium) ;
        // Struthiopteris : blechne en épi (ancien Blechnum spicant). Les
        // prêles (Equisetum) n'en font pas partie.
        genera: [
            'Pteridium', 'Dryopteris', 'Athyrium', 'Polystichum', 'Polypodium', 'Asplenium', 'Ceterach',
            'Phyllitis', 'Blechnum', 'Struthiopteris', 'Osmunda', 'Cystopteris', 'Gymnocarpium', 'Thelypteris',
            'Oreopteris', 'Phegopteris', 'Adiantum', 'Ophioglossum', 'Botrychium',
        ],
    },
    {
        key: 'bolets',
        label: 'Bolets',
        group: TaxonomicGroup.MUSHROOM,
        synonyms: ['bolets', 'cèpes et bolets'],
        // Boletus a été découpé (Imleria, Neoboletus, Rubroboletus…) : les
        // genres issus de ce découpage sont tous ici.
        genera: [
            'Boletus', 'Imleria', 'Xerocomus', 'Xerocomellus', 'Hortiboletus', 'Neoboletus', 'Rubroboletus',
            'Suillellus', 'Caloboletus', 'Butyriboletus', 'Leccinum', 'Leccinellum', 'Suillus', 'Tylopilus',
            'Gyroporus', 'Chalciporus', 'Aureoboletus', 'Porphyrellus', 'Strobilomyces',
        ],
    },
] as const satisfies readonly TaxonCategory[];

export type TaxonCategoryKey = (typeof TAXON_CATEGORIES)[number]['key'];

export const TAXON_CATEGORY_KEYS: readonly TaxonCategoryKey[] = TAXON_CATEGORIES.map(category => category.key);
