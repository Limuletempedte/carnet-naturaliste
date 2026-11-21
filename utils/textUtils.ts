export const normalizeSearchText = (value: string): string => {
    return value
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .trim()
        .replace(/\s+/g, ' ');
};

/**
 * Repli du pluriel simple, mot par mot : un « s » ou un « x » final est
 * retiré des mots de 4 lettres ou plus (« canards » → « canard »,
 * « courlis » → « courli », « hiboux » → « hibou »). Il ne sert qu'à
 * COMPARER : appliqué aux deux côtés (recherche et nom), jamais au texte
 * cherché lui-même.
 */
export const foldPlural = (normalized: string): string =>
    normalized.split(/([^\p{L}\p{N}]+)/u)
        .map(part => (/^\p{L}{4,}$/u.test(part) && /[sx]$/.test(part) && !/ss$/.test(part) ? part.slice(0, -1) : part))
        .join('');

/**
 * La recherche par nom : sous-chaîne sans casse ni accents, comme avant ; et
 * aussi sans tenir compte d'un pluriel simple, des deux côtés (« canards
 * colverts » trouve « Canard colvert », « courlis cendré » trouve toujours
 * « Courlis cendré »). Jamais moins de résultats qu'avant.
 */
export const searchTextMatches = (value: string | null | undefined, query: string): boolean => {
    if (!value) return false;
    const haystack = normalizeSearchText(value);
    const needle = normalizeSearchText(query);
    return haystack.includes(needle) || foldPlural(haystack).includes(foldPlural(needle));
};
