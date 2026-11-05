// Assistant d'identification par IA (phase 1) — côté application.
//
// Contrat serveur : supabase/functions/ai-identify/logic.ts (codes d'erreur,
// format de la requête et de la réponse). Exploitation : docs/ops/ASSISTANT-IA.md.
//
// Principes :
// - l'accès se demande (ligne `pending` dans `ai_access`) et se valide à la main ;
// - la photo est réencodée en JPEG de 1 280 px au plus (le serveur refuse
//   au-delà), ce qui supprime aussi les métadonnées EXIF, dont le GPS ;
// - seuls le mois, le pays, le département, le groupe (s'il a été choisi) et
//   l'habitat accompagnent la photo ;
// - aucune demande n'est mise en file d'attente hors ligne ;
// - les messages d'erreur sont propres à l'assistant : ne PAS passer par
//   `mapUserFacingError`, qui traduit « quota » en « Espace de stockage saturé ».

import { supabase } from '../supabaseClient';
import { compressImage } from '../utils/imageUtils';
import { logger } from '../utils/logger';
import { downloadPrivateMedia } from './privateMediaService';
import { assertSessionContext, captureSessionContext, inSession, StaleSessionError, type SessionContext } from './sessionScope';

/**
 * Version du texte de consentement affiché dans `AiAccessDialog`.
 * Doit rester ÉGALE à `CONSENT_VERSION` de la fonction (test dédié) : changer
 * le texte impose de changer les deux, et chacun devra redonner son accord.
 */
export const AI_CONSENT_VERSION = '2026-11-v1';

/** Côté maximal accepté par la fonction (`MAX_IMAGE_SIDE_PX`). */
export const AI_IMAGE_MAX_SIDE = 1280;
export const AI_IMAGE_QUALITY = 0.85;
export const AI_REQUEST_TIMEOUT_MS = 60_000;
const MAX_CONTEXT_FIELD_LENGTH = 60;

// ---------------------------------------------------------------------------
// Erreurs
// ---------------------------------------------------------------------------

export type AiAssistErrorCode =
    | 'offline'
    | 'cancelled'
    | 'timeout'
    | 'stale_session'
    | 'network'
    | 'photo_unavailable'
    | 'unauthenticated'
    | 'not_approved'
    | 'consent_outdated'
    | 'busy'
    | 'quota_exceeded'
    | 'budget_exhausted'
    | 'upstream_unavailable'
    | 'model_refused'
    | 'invalid_output'
    | 'invalid_image'
    | 'payload_too_large'
    | 'invalid_request'
    | 'misconfigured'
    | 'origin_not_allowed'
    | 'internal_error'
    | 'unknown';

const ERROR_MESSAGES: Record<AiAssistErrorCode, string> = {
    offline: "L'aide à l'identification n'est disponible qu'en ligne.",
    cancelled: 'Analyse annulée.',
    timeout: "L'analyse a pris trop de temps. Réessayez plus tard.",
    stale_session: 'Analyse annulée : le compte actif a changé.',
    network: 'Connexion interrompue pendant l’analyse. Réessayez quand le réseau est stable.',
    photo_unavailable: 'La photo n’a pas pu être préparée pour l’analyse.',
    unauthenticated: 'Votre session a expiré. Reconnectez-vous puis réessayez.',
    not_approved: "Vous n'avez pas encore accès à l'assistant. Demandez l'accès depuis le menu du compte.",
    consent_outdated: 'Le texte de consentement a changé : renouvelez votre accord depuis le menu du compte.',
    busy: 'Une analyse est déjà en cours. Patientez quelques instants.',
    quota_exceeded: 'Vous avez utilisé toutes vos analyses de ce mois. Le compteur repart le 1er du mois.',
    budget_exhausted: "L'assistant est en pause pour ce mois-ci. Réessayez le mois prochain.",
    upstream_unavailable: "Le service d'analyse est momentanément indisponible. Réessayez plus tard.",
    model_refused: "L'assistant n'a pas pu analyser cette photo. Essayez avec une autre photo.",
    invalid_output: "La réponse de l'assistant était inexploitable. Essayez avec une autre photo.",
    invalid_image: 'Cette photo ne peut pas être analysée. Essayez avec une autre photo.',
    payload_too_large: 'La photo est trop lourde pour être analysée.',
    invalid_request: 'La demande d’analyse est invalide.',
    misconfigured: "L'assistant est momentanément indisponible.",
    origin_not_allowed: "L'assistant n'est pas disponible depuis cette adresse du site.",
    internal_error: "Une erreur est survenue pendant l'analyse. Réessayez plus tard.",
    unknown: "Une erreur est survenue avec l'assistant. Réessayez plus tard.",
};

/** Cas prévus par le fonctionnement normal : journalisés en avertissement seulement. */
const EXPECTED_CODES = new Set<AiAssistErrorCode>([
    'offline', 'cancelled', 'timeout', 'stale_session', 'network', 'unauthenticated',
    'not_approved', 'consent_outdated', 'busy', 'quota_exceeded', 'budget_exhausted',
    'model_refused', 'upstream_unavailable',
]);

const SERVER_CODES = new Set<string>([
    'unauthenticated', 'not_approved', 'consent_outdated', 'busy', 'quota_exceeded',
    'budget_exhausted', 'upstream_unavailable', 'model_refused', 'invalid_output',
    'invalid_image', 'payload_too_large', 'invalid_request', 'misconfigured',
    'origin_not_allowed', 'internal_error',
]);

export class AiAssistError extends Error {
    readonly code: AiAssistErrorCode;
    /** Analyses restantes, quand le serveur les renvoie avec l'erreur. */
    readonly remaining?: number;

    constructor(code: AiAssistErrorCode, options: { remaining?: number } = {}) {
        super(ERROR_MESSAGES[code]);
        this.name = 'AiAssistError';
        this.code = code;
        this.remaining = options.remaining;
    }

    get expected(): boolean {
        return EXPECTED_CODES.has(this.code);
    }
}

export const aiAssistErrorMessage = (code: AiAssistErrorCode): string => ERROR_MESSAGES[code];

const logAiError = (operation: string, error: AiAssistError, cause?: unknown) => {
    if (error.expected) logger.warn(`[aiAssist] ${operation} : ${error.code}`);
    else logger.error(`[aiAssist] ${operation} : ${error.code}`, cause ?? '');
};

const isAbortError = (error: unknown): boolean =>
    typeof error === 'object' && error !== null && (error as { name?: unknown }).name === 'AbortError';

// ---------------------------------------------------------------------------
// Accès
// ---------------------------------------------------------------------------

export type AiAccessStatus =
    | { kind: 'none' }
    | { kind: 'pending'; requestedAt: string | null }
    | { kind: 'approved'; remaining: number; monthlyQuota: number }
    | { kind: 'refused'; note: string | null }
    | { kind: 'revoked'; note: string | null }
    /** Accès donné sous un ancien texte de consentement : à renouveler. */
    | { kind: 'consent_outdated' };

const asString = (value: unknown): string | null => (typeof value === 'string' && value.length > 0 ? value : null);
const asCount = (value: unknown): number => (typeof value === 'number' && Number.isFinite(value) && value >= 0 ? Math.floor(value) : 0);

/** Traduit la réponse de `ai_my_status()` (migration SQL). */
export const mapAccessStatus = (raw: unknown): AiAccessStatus => {
    if (typeof raw !== 'object' || raw === null) return { kind: 'none' };
    const data = raw as Record<string, unknown>;
    const status = data.status;
    const note = asString(data.note);
    if (status === 'refused') return { kind: 'refused', note };
    if (status === 'revoked') return { kind: 'revoked', note };
    if (status !== 'pending' && status !== 'approved') return { kind: 'none' };
    if (data.consent_version !== AI_CONSENT_VERSION) return { kind: 'consent_outdated' };
    if (status === 'pending') return { kind: 'pending', requestedAt: asString(data.requested_at) };
    return { kind: 'approved', remaining: asCount(data.remaining), monthlyQuota: asCount(data.monthly_quota) };
};

const wrapAccessError = (operation: string, error: unknown): AiAssistError => {
    let wrapped: AiAssistError;
    if (error instanceof AiAssistError) wrapped = error;
    else if (error instanceof StaleSessionError) wrapped = new AiAssistError('stale_session');
    else if (typeof navigator !== 'undefined' && !navigator.onLine) wrapped = new AiAssistError('offline');
    else wrapped = new AiAssistError('unknown');
    logAiError(operation, wrapped, error);
    return wrapped;
};

export async function getAccessStatus(context: SessionContext = captureSessionContext()): Promise<AiAccessStatus> {
    try {
        if (!navigator.onLine) throw new AiAssistError('offline');
        const { data, error } = await inSession(context, () => supabase.rpc('ai_my_status'));
        if (error) throw error;
        return mapAccessStatus(data);
    } catch (error) {
        throw wrapAccessError('statut', error);
    }
}

/**
 * Crée une demande d'accès (`pending`) sous le texte de consentement en vigueur.
 * `replaceExisting` : supprime d'abord l'ancienne ligne (renouvellement du
 * consentement), l'accès repasse alors `pending`.
 */
export async function requestAccess(
    options: { replaceExisting?: boolean } = {},
    context: SessionContext = captureSessionContext(),
): Promise<void> {
    try {
        if (!navigator.onLine) throw new AiAssistError('offline');
        if (options.replaceExisting) {
            const { error } = await inSession(context, () => supabase.from('ai_access').delete().eq('user_id', context.userId));
            if (error) throw error;
        }
        const { error } = await inSession(context, () =>
            supabase.from('ai_access').insert({ user_id: context.userId, consent_version: AI_CONSENT_VERSION }));
        if (error) throw error;
    } catch (error) {
        throw wrapAccessError('demande', error);
    }
}

/** Retire l'accord : supprime la ligne d'accès. Le compteur du mois ne change pas. */
export async function withdrawAccess(context: SessionContext = captureSessionContext()): Promise<void> {
    try {
        if (!navigator.onLine) throw new AiAssistError('offline');
        const { error } = await inSession(context, () => supabase.from('ai_access').delete().eq('user_id', context.userId));
        if (error) throw error;
    } catch (error) {
        throw wrapAccessError('retrait', error);
    }
}

// ---------------------------------------------------------------------------
// Analyse d'une photo
// ---------------------------------------------------------------------------

export type AiConfidence = 'faible' | 'moyenne' | 'elevee';

export interface AiCandidate {
    scientificName: string;
    commonName: string;
    confidence: AiConfidence;
    visibleCriteria: string[];
    criteriaToCheck: string[];
}

export interface AiIdentifyResult {
    candidates: AiCandidate[];
    photoNote: string;
    remaining: number;
}

/** Contexte facultatif envoyé avec la photo. Rien d'autre ne part. */
export interface AiIdentifyContext {
    /** Date de l'observation (`YYYY-MM-DD`) : seul le mois est transmis. */
    date?: string;
    country?: string;
    department?: string;
    /** À ne fournir que si l'utilisateur a choisi le groupe lui-même. */
    taxonomicGroup?: string;
    /** « Non renseigné » est ignoré. */
    habitat?: string;
}

const shortText = (value: string | undefined): string | undefined => {
    const text = (value ?? '').trim();
    return text.length > 0 && text.length <= MAX_CONTEXT_FIELD_LENGTH ? text : undefined;
};

/** Construit le corps envoyé à la fonction : uniquement les champs autorisés. */
export const buildIdentifyBody = (imageBase64: string, context: AiIdentifyContext): Record<string, string> => {
    const body: Record<string, string> = { image: imageBase64 };
    const month = /^(\d{4}-(0[1-9]|1[0-2]))-\d{2}$/.exec(context.date ?? '')?.[1];
    if (month) body.month = month;
    const country = shortText(context.country);
    if (country) body.country = country;
    const department = shortText(context.department);
    if (department) body.department = department;
    const group = shortText(context.taxonomicGroup);
    if (group) body.taxonomicGroup = group;
    const habitat = shortText(context.habitat);
    if (habitat && habitat !== 'Non renseigné') body.habitat = habitat;
    return body;
};

const blobToBase64 = (blob: Blob): Promise<string> => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
        const result = typeof reader.result === 'string' ? reader.result : '';
        const comma = result.indexOf(',');
        if (comma < 0) reject(new Error('base64'));
        else resolve(result.slice(comma + 1));
    };
    reader.onerror = () => reject(reader.error ?? new Error('base64'));
    reader.readAsDataURL(blob);
});

const CONFIDENCES: readonly string[] = ['faible', 'moyenne', 'elevee'];
const stringList = (value: unknown): string[] =>
    Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];

/** Relit la réponse du serveur sans lui faire aveuglément confiance. */
export const parseIdentifyResponse = (raw: unknown): AiIdentifyResult | null => {
    if (typeof raw !== 'object' || raw === null || !Array.isArray((raw as { candidates?: unknown }).candidates)) return null;
    const data = raw as { candidates: unknown[]; photoNote?: unknown; remaining?: unknown };
    const candidates: AiCandidate[] = [];
    for (const item of data.candidates.slice(0, 3)) {
        if (typeof item !== 'object' || item === null) continue;
        const c = item as Record<string, unknown>;
        if (typeof c.scientificName !== 'string' || c.scientificName.trim() === '') continue;
        if (typeof c.confidence !== 'string' || !CONFIDENCES.includes(c.confidence)) continue;
        candidates.push({
            scientificName: c.scientificName.trim(),
            commonName: typeof c.commonName === 'string' ? c.commonName.trim() : '',
            confidence: c.confidence as AiConfidence,
            visibleCriteria: stringList(c.visibleCriteria),
            criteriaToCheck: stringList(c.criteriaToCheck),
        });
    }
    return {
        candidates,
        photoNote: typeof data.photoNote === 'string' ? data.photoNote : '',
        remaining: asCount(data.remaining),
    };
};

/**
 * Combine à la main l'expiration (60 s), le changement de session et une
 * annulation de l'appelant (`AbortSignal.any` n'existe pas sur les vieux Safari).
 */
const combineSignals = (sessionSignal: AbortSignal, callerSignal: AbortSignal | undefined, timeoutMs: number) => {
    const controller = new AbortController();
    let reason: 'timeout' | 'session' | 'caller' | null = null;
    const abort = (why: 'timeout' | 'session' | 'caller') => {
        if (reason === null) reason = why;
        controller.abort();
    };
    const onSession = () => abort('session');
    const onCaller = () => abort('caller');
    const timer = setTimeout(() => abort('timeout'), timeoutMs);
    sessionSignal.addEventListener('abort', onSession, { once: true });
    callerSignal?.addEventListener('abort', onCaller, { once: true });
    if (sessionSignal.aborted) onSession();
    if (callerSignal?.aborted) onCaller();
    return {
        signal: controller.signal,
        reason: () => reason,
        dispose: () => {
            clearTimeout(timer);
            sessionSignal.removeEventListener('abort', onSession);
            callerSignal?.removeEventListener('abort', onCaller);
        },
    };
};

const reasonToCode = (reason: 'timeout' | 'session' | 'caller' | null): AiAssistErrorCode | null => {
    if (reason === 'timeout') return 'timeout';
    if (reason === 'session') return 'stale_session';
    if (reason === 'caller') return 'cancelled';
    return null;
};

/**
 * Demande des hypothèses pour la photo de l'observation.
 * `photoReference` : `formData.photo` (nouvelle photo ou photo déjà enregistrée).
 * Ne remplit jamais rien : c'est l'utilisateur qui choisit.
 */
export async function identifySpecies(
    photoReference: string,
    identifyContext: AiIdentifyContext,
    options: { signal?: AbortSignal; timeoutMs?: number } = {},
    context: SessionContext = captureSessionContext(),
): Promise<AiIdentifyResult> {
    // Aucun appel réseau hors ligne, aucune mise en file d'attente.
    if (!navigator.onLine) {
        const error = new AiAssistError('offline');
        logAiError('analyse', error);
        throw error;
    }
    const signals = combineSignals(context.signal, options.signal, options.timeoutMs ?? AI_REQUEST_TIMEOUT_MS);
    const checkAborted = () => {
        const code = reasonToCode(signals.reason());
        if (code) throw new AiAssistError(code);
        assertSessionContext(context);
    };
    try {
        let imageBase64: string;
        try {
            const original = await downloadPrivateMedia(photoReference, context);
            checkAborted();
            // Largeur et hauteur maximales ÉGALES : sinon les photos en portrait
            // restent à 1 080 px. Le réencodage retire aussi les données EXIF.
            const jpeg = await compressImage(original, AI_IMAGE_MAX_SIDE, AI_IMAGE_MAX_SIDE, AI_IMAGE_QUALITY);
            checkAborted();
            imageBase64 = await blobToBase64(jpeg);
            checkAborted();
        } catch (error) {
            if (error instanceof AiAssistError || error instanceof StaleSessionError) throw error;
            if (!navigator.onLine) throw new AiAssistError('offline');
            throw new AiAssistError('photo_unavailable');
        }

        const { data: { session } } = await inSession(context, () => supabase.auth.getSession());
        if (!session) throw new AiAssistError('unauthenticated');
        if (session.user.id !== context.userId) throw new StaleSessionError();

        const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
        let response: Response;
        try {
            response = await fetch(`${supabaseUrl}/functions/v1/ai-identify`, {
                method: 'POST',
                signal: signals.signal,
                headers: {
                    Authorization: `Bearer ${session.access_token}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(buildIdentifyBody(imageBase64, identifyContext)),
            });
        } catch (error) {
            checkAborted();
            if (isAbortError(error)) throw new AiAssistError('cancelled');
            throw new AiAssistError(navigator.onLine ? 'network' : 'offline');
        }
        checkAborted();

        let body: unknown = null;
        try {
            body = await response.json();
        } catch {
            checkAborted();
            body = null;
        }
        checkAborted();

        if (!response.ok) {
            const record = (typeof body === 'object' && body !== null ? body : {}) as { error?: unknown; remaining?: unknown };
            const code = typeof record.error === 'string' && SERVER_CODES.has(record.error)
                ? record.error as AiAssistErrorCode
                : 'unknown';
            throw new AiAssistError(code, typeof record.remaining === 'number' ? { remaining: asCount(record.remaining) } : {});
        }
        const result = parseIdentifyResponse(body);
        if (!result) throw new AiAssistError('invalid_output');
        return result;
    } catch (error) {
        let wrapped: AiAssistError;
        if (error instanceof AiAssistError) wrapped = error;
        else if (error instanceof StaleSessionError) wrapped = new AiAssistError('stale_session');
        else wrapped = new AiAssistError('unknown');
        logAiError('analyse', wrapped, error);
        throw wrapped;
    } finally {
        signals.dispose();
    }
}
