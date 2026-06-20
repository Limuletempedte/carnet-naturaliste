// Codes atlas (indices de nidification) — système EBCC à 16 codes utilisé par
// l'Atlas des Oiseaux de France 2019-2024. L'indice à retenir est toujours le plus
// élevé constaté pour l'espèce sur le site pendant la saison de reproduction.
//
// La valeur stockée dans `Observation.atlasCode` reste le code seul (ex. "15"),
// identique à ce qui était saisi en texte libre auparavant → import/export et
// données existantes inchangés. Le libellé n'est utilisé que pour l'affichage.

export interface AtlasCodeOption {
    /** Code numérique stocké tel quel (texte) dans `Observation.atlasCode`. */
    code: string;
    /** Libellé affiché dans la liste déroulante. */
    label: string;
}

export interface AtlasCodeGroup {
    /** Niveau de nidification — rendu comme `<optgroup>`. */
    level: string;
    options: AtlasCodeOption[];
}

export const ATLAS_CODE_GROUPS: readonly AtlasCodeGroup[] = [
    {
        level: 'Nidification possible',
        options: [
            { code: '1', label: 'Espèce observée en période de reproduction dans un habitat favorable' },
            { code: '2', label: 'Mâle chanteur, cris nuptiaux ou tambourinage en période de reproduction' },
        ],
    },
    {
        level: 'Nidification probable',
        options: [
            { code: '3', label: 'Couple dans un habitat favorable en période de reproduction' },
            { code: '4', label: 'Territoire permanent présumé (comportement territorial, ou présence à 8 jours d’intervalle)' },
            { code: '5', label: 'Parades nuptiales' },
            { code: '6', label: 'Fréquentation d’un site de nid potentiel' },
            { code: '7', label: 'Signes ou cris d’inquiétude d’un adulte' },
            { code: '8', label: 'Présence de plaques incubatrices (oiseau en main)' },
            { code: '9', label: 'Construction d’un nid ou creusement d’une cavité' },
        ],
    },
    {
        level: 'Nidification certaine',
        options: [
            { code: '10', label: 'Adulte feignant une blessure ou détournant l’attention' },
            { code: '11', label: 'Nid utilisé récemment ou coquille vide' },
            { code: '12', label: 'Jeunes fraîchement envolés (nidicoles) ou poussins (nidifuges)' },
            { code: '13', label: 'Adulte entrant/quittant un nid occupé, ou adulte couvant' },
            { code: '14', label: 'Adulte transportant de la nourriture ou des sacs fécaux' },
            { code: '15', label: 'Nid avec œufs' },
            { code: '16', label: 'Nid avec jeunes (vu ou entendu)' },
        ],
    },
];

/** Ensemble des codes valides — sert à repérer une valeur héritée hors liste. */
export const ATLAS_CODE_VALUES: ReadonlySet<string> = new Set(
    ATLAS_CODE_GROUPS.flatMap(group => group.options.map(option => option.code))
);

/** Vrai si `code` fait partie de la liste standard EBCC (codes "1" à "16"). */
export const isKnownAtlasCode = (code: string): boolean => ATLAS_CODE_VALUES.has(code);

/** Libellé « code — description » pour un code connu, sinon le code brut. */
export const formatAtlasCode = (code: string): string => {
    if (!code) return '';
    for (const group of ATLAS_CODE_GROUPS) {
        const match = group.options.find(option => option.code === code);
        if (match) return `${match.code} — ${match.label}`;
    }
    return code;
};
