// Note → fiche : logique pure (sans React ni réseau), testée par
// tests/aiNoteMapping.test.ts.
//
// L'assistant PROPOSE, la personne CHOISIT : ce module calcule les champs
// proposés (valeur actuelle, valeur proposée, case pré-cochée ou non), puis
// applique au formulaire uniquement les cases cochées. L'espèce est appliquée
// à part, par le chemin de l'aide photo (vérification du nom), AVANT les
// autres champs : voir `findExactSpeciesMatch` et ObservationForm.
//
// Règles :
// - un champ nommé dans `dropped` n'est jamais proposé ;
// - une case n'est pré-cochée que si le champ n'a pas bougé depuis
//   l'ouverture du panneau (copie `snapshot`) ET qu'il est vide ou à sa
//   valeur par défaut ;
// - les dates sont calculées par rapport à la date du formulaire, jamais dans
//   le futur ;
// - la répartition mâles / femelles passe par `validateObservationForm`
//   avant d'être appliquée.

import type { AiNoteChoiceField, AiNoteDateExpr, AiNoteResult } from '../services/aiAssistService';
import { validateObservationForm, type ObservationFormData } from '../services/observationFormService';
import { Age, Comportement, Habitat, ObservationCondition, Phenology, Sexe, WeatherCondition } from '../types';
import { normalizeSearchText } from './textUtils';

/** Valeurs admises pour chaque liste fermée : celles des énumérations de types.ts. */
export const AI_NOTE_CHOICES: Readonly<Record<AiNoteChoiceField, readonly string[]>> = {
    weather: Object.values(WeatherCondition),
    habitat: Object.values(Habitat),
    comportement: Object.values(Comportement),
    observationCondition: Object.values(ObservationCondition),
    age: Object.values(Age),
    sexe: Object.values(Sexe),
    phenology: Object.values(Phenology),
};

/** Champs du formulaire que l'application d'une note peut écrire (hors espèce). */
export const NOTE_FORM_KEYS = [
    'count', 'maleCount', 'femaleCount', 'unidentifiedCount', 'date', 'time', 'location', 'comment',
    'weather', 'habitat', 'comportement', 'observationCondition', 'age', 'sexe', 'phenology',
] as const satisfies readonly (keyof ObservationFormData)[];

export type NoteProposalKey =
    | 'species'
    | 'count'
    | 'breakdown'
    | 'date'
    | 'time'
    | 'location'
    | AiNoteChoiceField
    | 'remainder';

/** Ordre d'affichage ET d'application (l'espèce d'abord). */
export const NOTE_PROPOSAL_ORDER: readonly NoteProposalKey[] = [
    'species', 'count', 'breakdown', 'date', 'time', 'location',
    'observationCondition', 'comportement', 'sexe', 'age', 'phenology', 'habitat', 'weather',
    'remainder',
];

export const NOTE_PROPOSAL_LABELS: Record<NoteProposalKey, string> = {
    species: "Espèce",
    count: "Nombre d'individus",
    breakdown: 'Répartition',
    date: 'Date',
    time: 'Heure',
    location: 'Lieu-dit',
    observationCondition: 'Condition',
    comportement: 'Comportement',
    sexe: 'Sexe',
    age: 'Âge',
    phenology: 'Phénologie',
    habitat: 'Habitat',
    weather: 'Météo',
    remainder: 'Commentaire (reste de la note)',
};

export interface NoteProposal {
    key: NoteProposalKey;
    label: string;
    /** Valeur actuelle du formulaire, en clair (« vide » si rien). */
    current: string;
    /** Valeur proposée, en clair. */
    proposed: string;
    /** Précision à vérifier (date en toutes lettres, calcul de la répartition…). */
    detail?: string;
    preChecked: boolean;
}

export interface NoteMappingContext {
    /** Copie du formulaire prise à l'ouverture du panneau. */
    snapshot: ObservationFormData;
    /** Formulaire tel qu'il est maintenant. */
    current: ObservationFormData;
    /**
     * Valeurs de départ d'une NOUVELLE fiche (date et heure du jour) : elles
     * comptent comme « par défaut ». Absent pour une fiche existante.
     */
    defaults?: Pick<ObservationFormData, 'date' | 'time'> | null;
    /** Date du jour (`YYYY-MM-DD`, heure locale) : aucune date proposée au-delà. */
    today: string;
    /**
     * Cases cochées : la répartition affichée est calculée avec le total qui
     * sera réellement appliqué (le nombre proposé seulement s'il est coché).
     */
    selection?: ReadonlySet<NoteProposalKey>;
}

export const UNKNOWN_CHOICE = 'Non renseigné';
const EMPTY_LABEL = 'vide';

// ---------------------------------------------------------------------------
// Dates
// ---------------------------------------------------------------------------

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Jours depuis le 1er janvier 1970 (UTC, sans heure : pas de piège d'heure d'été). */
const isoToDays = (iso: string): number | null => {
    const match = ISO_DATE.exec(iso);
    if (!match) return null;
    const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
    const time = Date.UTC(year, month - 1, day);
    const check = new Date(time);
    if (check.getUTCFullYear() !== year || check.getUTCMonth() !== month - 1 || check.getUTCDate() !== day) return null;
    return Math.round(time / 86_400_000);
};

const daysToIso = (days: number): string => new Date(days * 86_400_000).toISOString().slice(0, 10);

/** La date existe-t-elle (le 29 février d'une année non bissextile n'existe pas) ? */
const validYmd = (year: number, month: number, day: number): boolean => {
    const date = new Date(Date.UTC(year, month - 1, day));
    return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
};

const ymdToIso = (year: number, month: number, day: number): string =>
    `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

/**
 * Convertit la date exprimée par la note en `YYYY-MM-DD`, par rapport à la
 * date du formulaire `referenceIso`. Null si la note ne donne pas de date, si
 * la date n'existe pas ou si elle tombe après `todayIso` (jamais de date
 * future).
 * - `relative_days` : date du formulaire + décalage (0 ou négatif) ;
 * - `last_weekday` : le jour de la semaine le plus récent STRICTEMENT avant la
 *   date du formulaire (« mardi dernier » un mardi = 7 jours avant) ;
 * - `absolute` sans année : l'occurrence la plus récente, au plus tard à la
 *   date du formulaire, qui existe (un 29 février remonte à la dernière année
 *   bissextile).
 */
export const resolveNoteDate = (expr: AiNoteDateExpr, referenceIso: string, todayIso: string): string | null => {
    const reference = isoToDays(referenceIso);
    const today = isoToDays(todayIso);
    if (reference === null || today === null) return null;
    let resolved: number | null = null;
    switch (expr.kind) {
        case 'none':
            return null;
        case 'relative_days':
            if (expr.offsetDays > 0) return null;
            resolved = reference + expr.offsetDays;
            break;
        case 'last_weekday': {
            if (expr.weekday < 1 || expr.weekday > 7) return null;
            // getUTCDay : 0 = dimanche ; ISO : 7 = dimanche.
            const referenceWeekday = new Date(reference * 86_400_000).getUTCDay() || 7;
            const back = (referenceWeekday - expr.weekday + 7) % 7 || 7;
            resolved = reference - back;
            break;
        }
        case 'absolute': {
            if (expr.year !== null) {
                if (!validYmd(expr.year, expr.month, expr.day)) return null;
                resolved = isoToDays(ymdToIso(expr.year, expr.month, expr.day));
                break;
            }
            const referenceYear = Number(referenceIso.slice(0, 4));
            // Huit ans suffisent à retrouver un 29 février (années séculaires comprises).
            for (let year = referenceYear; year >= referenceYear - 8; year--) {
                if (!validYmd(year, expr.month, expr.day)) continue;
                const candidate = isoToDays(ymdToIso(year, expr.month, expr.day));
                if (candidate !== null && candidate <= reference) {
                    resolved = candidate;
                    break;
                }
            }
            break;
        }
        default:
            return null;
    }
    if (resolved === null || resolved > today) return null;
    return daysToIso(resolved);
};

/** « mardi 18 novembre 2026 ». */
export const formatNoteDate = (iso: string): string => {
    const days = isoToDays(iso);
    if (days === null) return iso;
    return new Date(days * 86_400_000).toLocaleDateString('fr-FR', {
        weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC',
    });
};

const WEEKDAYS = ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche'];
const MONTHS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];

/** Comment la note exprimait la date, pour que la personne vérifie le calcul. */
export const describeNoteDateExpr = (expr: AiNoteDateExpr): string => {
    switch (expr.kind) {
        case 'relative_days':
            if (expr.offsetDays === 0) return "aujourd'hui";
            if (expr.offsetDays === -1) return 'hier';
            if (expr.offsetDays === -2) return 'avant-hier';
            return `il y a ${-expr.offsetDays} jours`;
        case 'last_weekday':
            return `${WEEKDAYS[expr.weekday - 1] ?? '?'} dernier`;
        case 'absolute':
            return `${expr.day === 1 ? '1er' : expr.day} ${MONTHS[expr.month - 1] ?? '?'}${expr.year !== null ? ` ${expr.year}` : ''}`;
        default:
            return '';
    }
};

const frDate = (iso: string): string => {
    const match = ISO_DATE.exec(iso);
    return match ? `${match[3]}/${match[2]}/${match[1]}` : iso;
};

// ---------------------------------------------------------------------------
// Espèce
// ---------------------------------------------------------------------------

export const normalizeLatinName = (value: string): string => value.trim().replace(/\s+/g, ' ').toLowerCase();

/**
 * Ce qu'il faut chercher pour vérifier l'espèce : le nom latin s'il existe,
 * sinon le nom commun. Null si la note ne donne pas d'espèce.
 */
export const noteSpeciesQuery = (result: AiNoteResult): { query: string; by: 'latin' | 'common' } | null => {
    if (result.scientificName) return { query: result.scientificName, by: 'latin' };
    if (result.speciesName) return { query: result.speciesName, by: 'common' };
    return null;
};

interface SpeciesCandidate {
    displayName: string;
    latinName: string;
    commonName?: string;
}

/**
 * Correspondance EXACTE parmi les suggestions de la recherche d'espèce :
 * même nom latin (sans casse ni espaces en trop) quand la note en donne un,
 * sinon même nom commun (sans casse ni accents). Jamais une simple inclusion.
 */
export const findExactSpeciesMatch = <T extends SpeciesCandidate>(suggestions: readonly T[], result: AiNoteResult): T | undefined => {
    const lookup = noteSpeciesQuery(result);
    if (!lookup) return undefined;
    if (lookup.by === 'latin') {
        const wanted = normalizeLatinName(lookup.query);
        return suggestions.find(item => normalizeLatinName(item.latinName) === wanted);
    }
    const wanted = normalizeSearchText(lookup.query);
    return suggestions.find(item =>
        normalizeSearchText(item.displayName) === wanted || normalizeSearchText(item.commonName ?? '') === wanted);
};

// ---------------------------------------------------------------------------
// Propositions
// ---------------------------------------------------------------------------

const show = (value: string | number | null | undefined): string => {
    if (value === null || value === undefined) return EMPTY_LABEL;
    const text = String(value).trim();
    return text === '' || text === UNKNOWN_CHOICE ? EMPTY_LABEL : text;
};

const isUnknownChoice = (value: string | undefined | null): boolean => !value || value === UNKNOWN_CHOICE;

/** Somme non identifiée déduite : total − mâles − femelles, si elle est positive. */
const derivedUnidentified = (total: number, male: number | null, female: number | null): number | '' => {
    const rest = total - (male ?? 0) - (female ?? 0);
    return rest > 0 ? rest : '';
};

const currentTotal = (form: ObservationFormData): number | null => {
    const total = Number(form.count);
    return form.count !== '' && Number.isInteger(total) && total >= 1 ? total : null;
};

/** Le champ n'a pas bougé depuis l'ouverture du panneau. */
const unchanged = <K extends keyof ObservationFormData>(context: NoteMappingContext, ...keys: K[]): boolean =>
    keys.every(key => JSON.stringify(context.current[key] ?? null) === JSON.stringify(context.snapshot[key] ?? null));

/**
 * Champs proposés, dans l'ordre d'application. Un champ n'est proposé que si
 * la note le donne, qu'il n'est pas dans `dropped` et que la valeur proposée
 * diffère de la valeur actuelle.
 */
export const buildNoteProposals = (result: AiNoteResult, context: NoteMappingContext): NoteProposal[] => {
    const { current, snapshot, defaults, today } = context;
    const dropped = new Set<string>(result.dropped);
    const proposals: NoteProposal[] = [];
    const push = (proposal: Omit<NoteProposal, 'label'>) =>
        proposals.push({ ...proposal, label: NOTE_PROPOSAL_LABELS[proposal.key] });

    // Espèce (nom commun et nom latin forment une seule proposition).
    const speciesName = dropped.has('speciesName') ? null : result.speciesName;
    const scientificName = dropped.has('scientificName') ? null : result.scientificName;
    if (speciesName || scientificName) {
        const sameCommon = !speciesName || normalizeSearchText(speciesName) === normalizeSearchText(current.speciesName);
        const sameLatin = !scientificName || normalizeLatinName(scientificName) === normalizeLatinName(current.latinName ?? '');
        if (!(sameCommon && sameLatin)) {
            const currentLabel = [current.speciesName.trim(), (current.latinName ?? '').trim()].filter(Boolean).join(' · ');
            push({
                key: 'species',
                current: currentLabel || EMPTY_LABEL,
                proposed: [speciesName, scientificName].filter(Boolean).join(' · '),
                detail: 'Le nom sera vérifié dans iNaturalist avant d’être repris.',
                preChecked: unchanged(context, 'speciesName', 'latinName')
                    && current.speciesName.trim() === '' && (current.latinName ?? '').trim() === '',
            });
        }
    }

    if (result.count !== null && !dropped.has('count') && Number(current.count) !== result.count) {
        push({
            key: 'count',
            current: show(current.count),
            proposed: String(result.count),
            preChecked: unchanged(context, 'count') && (current.count === '' || current.count === 1),
        });
    }

    const hasBreakdown = (result.maleCount !== null || result.femaleCount !== null)
        && !dropped.has('maleCount') && !dropped.has('femaleCount');
    if (hasBreakdown) {
        // Total appliqué : le nombre proposé s'il est (ou sera) coché, sinon celui de la fiche.
        const countProposed = proposals.some(proposal => proposal.key === 'count');
        const countChosen = countProposed && (context.selection
            ? context.selection.has('count')
            : proposals.find(proposal => proposal.key === 'count')?.preChecked === true);
        const total = countChosen ? result.count : currentTotal(current);
        const fits = total !== null && (result.maleCount ?? 0) + (result.femaleCount ?? 0) <= total;
        const parts = [
            result.maleCount !== null ? `${result.maleCount} mâle${result.maleCount > 1 ? 's' : ''}` : null,
            result.femaleCount !== null ? `${result.femaleCount} femelle${result.femaleCount > 1 ? 's' : ''}` : null,
        ].filter(Boolean);
        const rest = total !== null && fits ? derivedUnidentified(total, result.maleCount, result.femaleCount) : '';
        const currentParts = [
            current.maleCount !== '' ? `${current.maleCount} mâle(s)` : null,
            current.femaleCount !== '' ? `${current.femaleCount} femelle(s)` : null,
            current.unidentifiedCount !== '' ? `${current.unidentifiedCount} non identifié(s)` : null,
        ].filter(Boolean);
        push({
            key: 'breakdown',
            current: currentParts.join(', ') || EMPTY_LABEL,
            proposed: [...parts, rest !== '' ? `${rest} non identifié${rest > 1 ? 's' : ''}` : null].filter(Boolean).join(', '),
            detail: !fits
                ? (total === null
                    ? "Ne sera pas appliquée : le nombre d'individus n'est pas renseigné."
                    : `Ne sera pas appliquée : elle dépasse le total (${total}). Cochez aussi le nombre proposé.`)
                : rest !== '' ? `Non identifiés : le reste du total (${total}).` : undefined,
            preChecked: unchanged(context, 'maleCount', 'femaleCount', 'unidentifiedCount')
                && current.maleCount === '' && current.femaleCount === '' && current.unidentifiedCount === '',
        });
    }

    if (!dropped.has('dateExpr') && result.dateExpr.kind !== 'none') {
        const resolved = resolveNoteDate(result.dateExpr, snapshot.date, today);
        if (resolved && resolved !== current.date) {
            const isDefault = current.date === '' || (!!defaults && current.date === defaults.date);
            push({
                key: 'date',
                current: current.date ? frDate(current.date) : EMPTY_LABEL,
                proposed: frDate(resolved),
                detail: `${formatNoteDate(resolved)} : « ${describeNoteDateExpr(result.dateExpr)} », compté depuis le ${frDate(snapshot.date)}.`,
                preChecked: unchanged(context, 'date') && isDefault,
            });
        }
    }

    if (result.time !== null && !dropped.has('time') && result.time !== current.time) {
        const isDefault = current.time === '' || (!!defaults && current.time === defaults.time);
        push({
            key: 'time',
            current: show(current.time),
            proposed: result.time,
            preChecked: unchanged(context, 'time') && isDefault,
        });
    }

    if (result.location !== null && !dropped.has('location')
        && normalizeSearchText(result.location) !== normalizeSearchText(current.location ?? '')) {
        push({
            key: 'location',
            current: show(current.location),
            proposed: result.location,
            preChecked: unchanged(context, 'location') && (current.location ?? '').trim() === '',
        });
    }

    const choiceKeys: AiNoteChoiceField[] = ['observationCondition', 'comportement', 'sexe', 'age', 'phenology', 'habitat', 'weather'];
    for (const key of choiceKeys) {
        const value = result[key];
        if (value === null || dropped.has(key) || value === current[key]) continue;
        push({
            key,
            current: show(current[key]),
            proposed: value,
            preChecked: unchanged(context, key) && isUnknownChoice(current[key]),
        });
    }

    if (result.remainder !== null && !dropped.has('remainder') && !commentContains(current.comment, result.remainder)) {
        push({
            key: 'remainder',
            current: show(current.comment),
            proposed: result.remainder,
            detail: 'Ajouté à la fin du commentaire.',
            preChecked: unchanged(context, 'comment') && current.comment.trim() === '',
        });
    }

    return proposals.sort((a, b) => NOTE_PROPOSAL_ORDER.indexOf(a.key) - NOTE_PROPOSAL_ORDER.indexOf(b.key));
};

/** Cases pré-cochées. */
export const initialNoteSelection = (proposals: readonly NoteProposal[]): Set<NoteProposalKey> =>
    new Set(proposals.filter(proposal => proposal.preChecked).map(proposal => proposal.key));

// ---------------------------------------------------------------------------
// Commentaire
// ---------------------------------------------------------------------------

const normalizeComment = (value: string): string => value.replace(/\s+/g, ' ').trim().toLocaleLowerCase('fr');

/** Le commentaire contient-il déjà ce texte (sans tenir compte des espaces ni de la casse) ? */
export const commentContains = (comment: string | undefined, text: string): boolean => {
    const needle = normalizeComment(text);
    return needle.length > 0 && normalizeComment(comment ?? '').includes(needle);
};

/** Ajoute `text` à la fin du commentaire, sauf s'il y figure déjà : jamais de doublon. */
export const appendToComment = (comment: string | undefined, text: string): string => {
    const base = comment ?? '';
    const addition = text.trim();
    if (addition === '' || commentContains(base, addition)) return base;
    return base.trim() === '' ? addition : `${base.trimEnd()}\n\n${addition}`;
};

// ---------------------------------------------------------------------------
// Application (hors espèce)
// ---------------------------------------------------------------------------

export interface NoteApplyOptions {
    /** Date du formulaire à l'ouverture du panneau (référence des dates relatives). */
    referenceDate: string;
    today: string;
    /** « Garder la note dans le commentaire ». */
    keepNote: boolean;
    /** Texte de la note, tel qu'il a été envoyé. */
    noteText: string;
}

export interface NoteApplyOutcome {
    form: ObservationFormData;
    /** Propositions réellement appliquées (hors espèce), dans l'ordre. */
    applied: NoteProposalKey[];
    /** Propositions cochées mais non appliquées, avec la raison. */
    skipped: { key: NoteProposalKey; reason: string }[];
    /** Points à vérifier dans la fiche après application. */
    warnings: string[];
    /** La météo a été écrite : la marquer comme modifiée (pas d'écrasement automatique). */
    weatherApplied: boolean;
    /** Champs rangés dans « détails avancés » touchés : les déplier pour les montrer. */
    touchesAdvancedLocation: boolean;
    touchesAdvancedDetails: boolean;
}

const ADVANCED_DETAILS: readonly NoteProposalKey[] = ['observationCondition', 'comportement', 'sexe', 'age', 'weather'];

/**
 * Applique au formulaire les propositions cochées, SAUF l'espèce (appliquée
 * avant, par la vérification du nom). Ne lit que `result` : jamais un champ
 * de `dropped`. La répartition est contrôlée par `validateObservationForm` ;
 * incohérente, elle n'est pas appliquée et la raison est rendue.
 */
export const applyNoteFields = (
    form: ObservationFormData,
    result: AiNoteResult,
    selected: ReadonlySet<NoteProposalKey>,
    options: NoteApplyOptions,
): NoteApplyOutcome => {
    const dropped = new Set<string>(result.dropped);
    let next: ObservationFormData = { ...form, gps: { ...form.gps } };
    const applied: NoteProposalKey[] = [];
    const skipped: { key: NoteProposalKey; reason: string }[] = [];
    const wants = (key: NoteProposalKey) => selected.has(key);

    for (const key of NOTE_PROPOSAL_ORDER) {
        if (key === 'species' || !wants(key)) continue;
        switch (key) {
            case 'count':
                if (result.count !== null && !dropped.has('count')) {
                    next.count = result.count;
                    applied.push(key);
                }
                break;
            case 'breakdown': {
                if ((result.maleCount === null && result.femaleCount === null) || dropped.has('maleCount') || dropped.has('femaleCount')) break;
                const total = currentTotal(next);
                if (total === null) {
                    skipped.push({ key, reason: "Répartition non appliquée : le nombre d'individus n'est pas renseigné." });
                    break;
                }
                const candidate: ObservationFormData = {
                    ...next,
                    maleCount: result.maleCount ?? '',
                    femaleCount: result.femaleCount ?? '',
                    unidentifiedCount: derivedUnidentified(total, result.maleCount, result.femaleCount),
                };
                const errors = validateObservationForm(candidate);
                if (errors.maleCount || errors.femaleCount || errors.unidentifiedCount || errors.countBreakdown) {
                    skipped.push({ key, reason: `Répartition non appliquée : elle ne correspond pas au total (${total}).` });
                    break;
                }
                next = candidate;
                applied.push(key);
                break;
            }
            case 'date': {
                if (dropped.has('dateExpr')) break;
                const resolved = resolveNoteDate(result.dateExpr, options.referenceDate, options.today);
                if (resolved) {
                    next.date = resolved;
                    applied.push(key);
                }
                break;
            }
            case 'time':
                if (result.time !== null && !dropped.has('time')) {
                    next.time = result.time;
                    applied.push(key);
                }
                break;
            case 'location':
                if (result.location !== null && !dropped.has('location')) {
                    next.location = result.location;
                    applied.push(key);
                }
                break;
            case 'remainder':
                // La note entière gardée contient déjà ce reste : pas de doublon.
                if (options.keepNote) break;
                if (result.remainder !== null && !dropped.has('remainder')) {
                    next.comment = appendToComment(next.comment, result.remainder);
                    applied.push(key);
                }
                break;
            default: {
                const value = result[key];
                if (value !== null && !dropped.has(key)) {
                    (next as unknown as Record<string, unknown>)[key] = value;
                    applied.push(key);
                }
            }
        }
    }

    if (options.keepNote) next.comment = appendToComment(next.comment, options.noteText);

    // Nombre changé sans nouvelle répartition : l'ancienne ne tient peut-être plus.
    const warnings: string[] = [];
    if (applied.includes('count') && !applied.includes('breakdown') && validateObservationForm(next).countBreakdown) {
        warnings.push("La répartition déjà saisie ne correspond plus au nouveau nombre d'individus : corrigez-la avant d'enregistrer.");
    }

    return {
        form: next,
        applied,
        skipped,
        warnings,
        weatherApplied: applied.includes('weather'),
        touchesAdvancedLocation: applied.includes('location'),
        touchesAdvancedDetails: applied.some(key => ADVANCED_DETAILS.includes(key)),
    };
};
