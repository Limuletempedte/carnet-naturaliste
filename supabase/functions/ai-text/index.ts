// Fonction Edge `ai-text` : fonctionnalités IA en texte (bilan du mois ; plus
// tard note → fiche et recherche), par Claude (API Anthropic). La clé API ne
// quitte jamais le serveur. Même accès, même quota mensuel et même budget que
// `ai-identify` ; consentement propre à chaque fonctionnalité (`ai_consents`).
// Voir docs/ops/ASSISTANT-IA.md et supabase/migrations/*_ai_text_features.sql.
//
// Ordre : CORS → identité → corps (≤ 16 Ko) → fonctionnalité connue et non
// coupée → configuration → validation de la charge utile → réservation
// (quota, budget, sous verrou) → appel au modèle → coût réel → réponse.
//
// Journaux : uniquement l'id de la ligne d'usage, la fonctionnalité, le
// statut, le modèle, les tokens, le coût et le type d'erreur. Jamais
// l'utilisateur, la note, la phrase, les chiffres ni le texte produit.

import Anthropic from 'npm:@anthropic-ai/sdk@1.1.0';
import { createClient } from 'npm:@supabase/supabase-js@2.110.3';
import {
    CONSENT_VERSIONS,
    MAX_BODY_BYTES,
    TEXT_FEATURES,
    classifyStopReason,
    computeCostUsd,
    corsDecision,
    httpStatusFor,
    isReservationRefusal,
    maxCostUsd,
    parseAllowedOrigins,
    parseDisabledFeatures,
    parseTextConfig,
    readEnvelope,
    type ErrorCode,
} from './logic.ts';

/** Coupure côté client avant celle de Supabase (150 s). */
const ANTHROPIC_TIMEOUT_MS = 50_000;

type FinalStatus = 'ok' | 'refused' | 'invalid_output' | 'failed';

function log(event: Record<string, unknown>): void {
    console.log(JSON.stringify({ fn: 'ai-text', ...event }));
}

/** Lit le corps en s'arrêtant dès que la limite est dépassée. */
async function readBodyLimited(req: Request, maxBytes: number): Promise<Uint8Array | 'too_large'> {
    const declared = Number(req.headers.get('Content-Length') ?? '0');
    if (Number.isFinite(declared) && declared > maxBytes) return 'too_large';
    if (!req.body) return new Uint8Array(0);
    const reader = req.body.getReader();
    const chunks: Uint8Array[] = [];
    let total = 0;
    for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        total += value.byteLength;
        if (total > maxBytes) {
            await reader.cancel();
            return 'too_large';
        }
        chunks.push(value);
    }
    const body = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) {
        body.set(chunk, offset);
        offset += chunk.byteLength;
    }
    return body;
}

function describeUpstreamError(err: unknown): { errorType: string; status?: number; apiErrorType?: string; billedMaybe: boolean } {
    if (err instanceof Anthropic.APIConnectionTimeoutError) {
        // La demande a pu être traitée (et facturée) malgré la coupure.
        return { errorType: 'timeout', billedMaybe: true };
    }
    if (err instanceof Anthropic.APIConnectionError) return { errorType: 'connection', billedMaybe: false };
    if (err instanceof Anthropic.APIError) {
        const apiErrorType = (err as { type?: unknown }).type;
        return {
            errorType: 'api',
            status: err.status,
            apiErrorType: typeof apiErrorType === 'string' ? apiErrorType : undefined,
            billedMaybe: false,
        };
    }
    return { errorType: 'unknown', billedMaybe: true };
}

Deno.serve(async (req: Request): Promise<Response> => {
    const cors = corsDecision(req.headers.get('Origin'), parseAllowedOrigins(Deno.env.get('ALLOWED_ORIGINS')));
    const reply = (status: number, body: unknown) =>
        new Response(JSON.stringify(body), {
            status,
            headers: { ...cors.headers, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
        });
    const fail = (code: ErrorCode, extra: Record<string, unknown> = {}) =>
        reply(httpStatusFor(code), { error: code, ...extra });

    // 1. CORS et méthode
    if (!cors.allowed) return fail('origin_not_allowed');
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors.headers });
    if (req.method !== 'POST') return fail('method_not_allowed');

    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!supabaseUrl || !anonKey || !serviceRoleKey) {
        log({ event: 'misconfigured', reason: 'supabase_env' });
        return fail('misconfigured');
    }

    // 2. Identité
    const authHeader = req.headers.get('Authorization') ?? '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice('Bearer '.length).trim() : '';
    if (!token) return fail('unauthenticated');
    const clientOptions = { auth: { persistSession: false, autoRefreshToken: false } };
    const userClient = createClient(supabaseUrl, anonKey, clientOptions);
    const { data: userData, error: authError } = await userClient.auth.getUser(token);
    const user = userData?.user;
    if (authError || !user) return fail('unauthenticated');

    // 3. Corps : JSON ≤ 16 Ko
    const rawBody = await readBodyLimited(req, MAX_BODY_BYTES);
    if (rawBody === 'too_large') return fail('payload_too_large');
    let parsedBody: unknown;
    try {
        parsedBody = JSON.parse(new TextDecoder().decode(rawBody));
    } catch {
        return fail('invalid_request');
    }

    // 4. Fonctionnalité connue et non coupée
    const envelope = readEnvelope(parsedBody);
    if (!envelope.ok) return fail(envelope.code);
    const featureName = envelope.feature;
    const feature = TEXT_FEATURES[featureName];
    const consentVersion = CONSENT_VERSIONS[featureName];
    if (!feature || !consentVersion) return fail('invalid_request');
    const disabled = parseDisabledFeatures(Deno.env.get('AI_DISABLED_FEATURES'));
    if (!disabled) {
        log({ event: 'misconfigured', reason: 'disabled_features' });
        return fail('misconfigured');
    }
    if (disabled.has(featureName)) return fail('feature_disabled');

    // 5. Configuration
    const config = parseTextConfig({
        model: Deno.env.get('AI_TEXT_MODEL'),
        effort: Deno.env.get('AI_EFFORT'),
        budget: Deno.env.get('AI_MONTHLY_BUDGET_USD'),
    });
    const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
    if (!config || !apiKey) {
        log({ event: 'misconfigured', reason: !config ? 'ai_config' : 'api_key' });
        return fail('misconfigured');
    }

    // 6. Charge utile propre à la fonctionnalité (refus au-delà des limites)
    const validation = feature.validate(envelope.payload);
    if (!validation.ok) return fail('invalid_request');
    const input = validation.value;
    const userPrompt = feature.buildUserPrompt(input);
    const reservedCost = maxCostUsd(config.model, feature, userPrompt);

    // 7. Réservation : accès, consentement de la fonctionnalité, quota, budget
    const admin = createClient(supabaseUrl, serviceRoleKey, clientOptions);
    const { data: reservation, error: reserveError } = await admin.rpc('ai_reserve_call', {
        p_user: user.id,
        p_consent_version: consentVersion,
        p_model: config.model,
        p_budget_usd: config.budgetUsd,
        p_max_cost_usd: reservedCost,
        p_feature: featureName,
    });
    if (reserveError || !reservation || typeof reservation !== 'object') {
        log({ event: 'reserve_error', feature: featureName, code: reserveError?.code });
        return fail('internal_error');
    }
    const reserved = reservation as { ok?: unknown; reason?: unknown; usage_id?: unknown; remaining?: unknown };
    if (reserved.ok !== true) {
        if (isReservationRefusal(reserved.reason)) {
            log({ event: 'reserve_refused', feature: featureName, reason: reserved.reason });
            return fail(reserved.reason);
        }
        log({ event: 'reserve_error', feature: featureName, code: 'unexpected_reply' });
        return fail('internal_error');
    }
    const usageId = String(reserved.usage_id);
    const remaining = typeof reserved.remaining === 'number' ? reserved.remaining : 0;

    const finalize = async (status: FinalStatus, inputTokens: number, outputTokens: number, costUsd: number) => {
        const { data: updated, error } = await admin.rpc('ai_finalize_call', {
            p_id: usageId,
            p_status: status,
            p_input_tokens: inputTokens,
            p_output_tokens: outputTokens,
            p_cost_usd: costUsd,
        });
        log({
            event: 'call_finalized',
            usage_id: usageId,
            feature: featureName,
            status,
            model: config.model,
            input_tokens: inputTokens,
            output_tokens: outputTokens,
            cost_usd: costUsd,
            finalize_error: error?.code,
            finalize_updated: updated === true,
        });
    };

    try {
        // 8. Appel au modèle
        const anthropic = new Anthropic({
            apiKey,
            baseURL: Deno.env.get('ANTHROPIC_BASE_URL') || undefined,
            timeout: ANTHROPIC_TIMEOUT_MS,
            maxRetries: 0,
        });
        let message: Anthropic.Message;
        try {
            message = await anthropic.messages.create({
                model: config.model,
                max_tokens: feature.maxOutputTokens,
                system: feature.systemPrompt,
                output_config: {
                    effort: config.effort,
                    format: { type: 'json_schema', schema: feature.responseSchema },
                },
                messages: [{ role: 'user', content: userPrompt }],
            });
        } catch (err) {
            const described = describeUpstreamError(err);
            log({ event: 'upstream_error', usage_id: usageId, feature: featureName, error_type: described.errorType, status: described.status, api_error_type: described.apiErrorType });
            // Non facturé (429, 529, 400 dont « usage limits reached », réseau) : coût 0.
            // Coupure après envoi : on garde le coût maximum, par prudence.
            await finalize('failed', 0, 0, described.billedMaybe ? reservedCost : 0);
            return fail('upstream_unavailable');
        }

        // 9. Coût réel, puis lecture — stop_reason AVANT le contenu
        const inputTokens = message.usage.input_tokens
            + (message.usage.cache_creation_input_tokens ?? 0)
            + (message.usage.cache_read_input_tokens ?? 0);
        const outputTokens = message.usage.output_tokens;
        const cost = computeCostUsd(config.model, message.usage);
        const outcome = classifyStopReason(message.stop_reason);
        if (outcome === 'refused') {
            await finalize('refused', inputTokens, outputTokens, cost);
            return fail('model_refused', { remaining });
        }
        if (outcome === 'invalid_output') {
            await finalize('invalid_output', inputTokens, outputTokens, cost);
            return fail('invalid_output', { remaining });
        }
        const text = message.content
            .filter((block): block is Anthropic.TextBlock => block.type === 'text')
            .map(block => block.text)
            .join('');
        const result = feature.parseOutput(text, input);
        if (result === null) {
            await finalize('invalid_output', inputTokens, outputTokens, cost);
            return fail('invalid_output', { remaining });
        }

        await finalize('ok', inputTokens, outputTokens, cost);

        // 10. Réponse
        return reply(200, { result, remaining });
    } catch (err) {
        // Erreur imprévue après la réservation : la ligne garde le coût maximum.
        log({ event: 'internal_error', usage_id: usageId, feature: featureName, error_type: err instanceof Error ? err.name : 'unknown' });
        await finalize('failed', 0, 0, reservedCost).catch(() => undefined);
        return fail('internal_error');
    }
});
