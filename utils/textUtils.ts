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

const isWordChar = (char: string | undefined): boolean => char !== undefined && /[\p{L}\p{N}]/u.test(char);

/**
 * La recherche par nom : sous-chaîne sans casse ni accents, EXACTEMENT comme
 * avant ; et, en plus, sans tenir compte d'un pluriel simple, mais de mot à
 * mot seulement, pour ne jamais ajouter de bruit :
 * - la comparaison repliée commence à un début de mot du nom ;
 * - si le repli a raccourci le dernier mot cherché (« gris » → « gri »), elle
 *   finit à une fin de mot du nom (« Héron gris » oui, « Grive » non) ;
 * - un dernier mot non raccourci reste un début de mot libre, pendant la
 *   frappe (« canards colv » trouve « Canard colvert »).
 * « canards colverts » trouve « Canard colvert », « hiboux » trouve « Hibou
 * moyen-duc » ; « ours » ne trouve pas « Tourterelle des bois ».
 */
export const searchTextMatches = (value: string | null | undefined, query: string): boolean => {
    if (!value) return false;
    const haystack = normalizeSearchText(value);
    const needle = normalizeSearchText(query);
    if (haystack.includes(needle)) return true;
    const foldedNeedle = foldPlural(needle);
    if (foldedNeedle === needle || foldedNeedle.length === 0) return false;
    const foldedHaystack = foldPlural(haystack);
    // Le dernier mot cherché a-t-il été raccourci par le repli ?
    const lastWord = needle.split(/[^\p{L}\p{N}]+/u).filter(Boolean).pop() ?? '';
    const lastShortened = foldPlural(lastWord) !== lastWord;
    for (let at = foldedHaystack.indexOf(foldedNeedle); at >= 0; at = foldedHaystack.indexOf(foldedNeedle, at + 1)) {
        const startsWord = !isWordChar(foldedHaystack[at - 1]);
        const end = at + foldedNeedle.length;
        const endsWord = !isWordChar(foldedHaystack[end]);
        if (startsWord && (!lastShortened || endsWord)) return true;
    }
    return false;
};
