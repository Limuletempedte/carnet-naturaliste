// Laboratoire exclusivement local : vrai Supabase local + faux serveur Anthropic.
// Vérifie les droits, la RLS, la réservation (quota, budget, anti double-clic)
// de l'assistant IA, les consentements par fonctionnalité (`ai_consents`),
// puis les fonctions `ai-identify` et `ai-text` de bout en bout.
// Mode d'emploi : docs/ops/ASSISTANT-IA.md, section « Vérification locale ».
//
// Prérequis : migrations *_ai_identification.sql et *_ai_text_features.sql
// appliquées (supabase db reset).
// LOCAL_STATUS_FILE : JSON produit par `supabase status -o json` (jamais versionné).
// POSTGRES_MODULE (facultatif) : chemin du paquet npm `postgres` ; active les
//   contrôles has_table/column/function_privilege via DB_URL.
// DENO_BIN (facultatif) : chemin de Deno ; lance la fonction (port 8000) avec
//   un faux serveur Anthropic local, sans clé réelle ni appel payant.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { createHmac, randomUUID } from 'node:crypto';

const LOCAL_HOSTS = ['localhost', '127.0.0.1', '::1', '[::1]'];
const config = JSON.parse(await fs.readFile(process.env.LOCAL_STATUS_FILE, 'utf8'));
const api = config.API_URL;
assert(LOCAL_HOSTS.includes(new URL(api).hostname), 'Laboratoire local obligatoire (API)');
if (config.DB_URL) assert(LOCAL_HOSTS.includes(new URL(config.DB_URL).hostname), 'Laboratoire local obligatoire (base)');

const CONSENT = '2026-11-v1';
// Version du consentement texte (CONSENT_VERSIONS de ai-text/logic.ts).
const TEXT_CONSENT = '2026-11-v1';
const MAX_COST = 0.042;
const FAKE_ANTHROPIC_PORT = 55440;
const FUNCTION_URL = 'http://127.0.0.1:8000';
const ALLOWED_ORIGIN = 'http://localhost:5173';
// Valeur aléatoire : le faux serveur Anthropic n'en vérifie aucune.
const placeholderCredential = randomUUID();

const checks = [];
const passed = label => { checks.push(label); console.log(`PASS ${label}`); };
const users = new Map(); // nom -> { id, token }

async function rest(endpoint, { method = 'GET', token, key = config.ANON_KEY, body, prefer } = {}) {
    const headers = { apikey: key, Authorization: `Bearer ${token ?? key}`, 'Content-Type': 'application/json' };
    if (prefer) headers.Prefer = prefer;
    const res = await fetch(api + endpoint, {
        method, headers, signal: AbortSignal.timeout(20000),
        body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await res.text();
    let json = null;
    try { json = text ? JSON.parse(text) : null; } catch { json = text; }
    return { status: res.status, json };
}
const asService = (endpoint, options = {}) => rest(endpoint, { ...options, key: config.SERVICE_ROLE_KEY });
const reserve = (userId, overrides = {}) => asService('/rest/v1/rpc/ai_reserve_call', {
    method: 'POST',
    body: { p_user: userId, p_consent_version: CONSENT, p_model: 'claude-sonnet-5-5', p_budget_usd: 18, p_max_cost_usd: MAX_COST, ...overrides },
});
const finalize = (id, status, cost = 0.001) => asService('/rest/v1/rpc/ai_finalize_call', {
    method: 'POST',
    body: { p_id: id, p_status: status, p_input_tokens: 100, p_output_tokens: 50, p_cost_usd: cost },
});
const giveConsent = (user, feature, version = TEXT_CONSENT, extra = {}) => rest('/rest/v1/ai_consents', {
    method: 'POST', token: user.token, prefer: 'return=representation',
    body: { user_id: user.id, feature, version, ...extra },
});
const denied = (r, label) => {
    assert(r.status === 401 || r.status === 403, `${label} : attendu 401/403, reçu ${r.status} ${JSON.stringify(r.json)}`);
};

function signLocalJwt(payload) {
    const b64u = value => Buffer.from(typeof value === 'string' ? value : JSON.stringify(value)).toString('base64url');
    const unsigned = `${b64u({ alg: 'HS256', typ: 'JWT' })}.${b64u(payload)}`;
    return `${unsigned}.${createHmac('sha256', config.JWT_SECRET).update(unsigned).digest('base64url')}`;
}

async function createUser(name) {
    const email = `ai-lab-${name}-${randomUUID()}@example.test`;
    const loginPhrase = `Labo-${randomUUID()}`;
    const created = await asService('/auth/v1/admin/users', { method: 'POST', body: { email, password: loginPhrase, email_confirm: true } });
    assert.equal(created.status, 200, `création du compte ${name}`);
    const id = created.json.id;
    const login = await rest('/auth/v1/token?grant_type=password', { method: 'POST', body: { email, password: loginPhrase } });
    // Repli si la connexion par mot de passe est fermée (CAPTCHA du labo) :
    // jeton signé avec le secret LOCAL du laboratoire.
    const token = login.status === 200 ? login.json.access_token : signLocalJwt({
        sub: id, role: 'authenticated', aud: 'authenticated', email,
        exp: Math.floor(Date.now() / 1000) + 3600, iat: Math.floor(Date.now() / 1000),
    });
    users.set(name, { id, token });
    return users.get(name);
}

async function approve(userId, consent = CONSENT) {
    const ins = await asService('/rest/v1/ai_access', { method: 'POST', body: { user_id: userId, consent_version: consent, status: 'approved', decided_at: new Date().toISOString() }, prefer: 'resolution=merge-duplicates' });
    assert(ins.status === 201 || ins.status === 200, `approbation : ${ins.status} ${JSON.stringify(ins.json)}`);
}

async function monthSpent() {
    const start = new Date(); start.setUTCDate(1); start.setUTCHours(0, 0, 0, 0);
    const r = await asService(`/rest/v1/ai_usage?select=cost_usd&created_at=gte.${encodeURIComponent(start.toISOString())}`);
    assert.equal(r.status, 200);
    return r.json.reduce((sum, row) => sum + Number(row.cost_usd), 0);
}

// ---------------------------------------------------------------------------
// Faux serveur Anthropic (aucun appel réel)
// ---------------------------------------------------------------------------
let fakeMode = 'ok';
const fakeRequests = [];
const fakeAnthropic = http.createServer((req, res) => {
    let raw = '';
    req.on('data', chunk => { raw += chunk; });
    req.on('end', () => {
        let body = {};
        try { body = JSON.parse(raw); } catch { /* ignoré */ }
        fakeRequests.push({ path: req.url, body });
        if (fakeMode === 'overloaded') {
            res.writeHead(529, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ type: 'error', error: { type: 'overloaded_error', message: 'Overloaded' } }));
            return;
        }
        const output = fakeMode === 'refusal' ? '' : fakeMode === 'summary' ? JSON.stringify({
            // Au moins 40 mots : plancher d'un bilan quand le mois compte des observations.
            text: 'En mai 2026, vous avez noté 42 observations de 17 espèces. Vos sorties ont été régulières et variées, et votre carnet garde la trace de chacune de ces rencontres, au fil des chemins, des haies et des mares que vous avez pris le temps de parcourir tout au long de ce mois.',
        }) : JSON.stringify({
            candidates: [{
                scientificName: 'Erithacus rubecula', commonName: 'Rougegorge familier', confidence: 'elevee',
                visibleCriteria: ['poitrine orange'], criteriaToCheck: ['chant'],
            }],
            photoNote: 'Photo nette.',
        });
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
            id: `msg_${randomUUID()}`, type: 'message', role: 'assistant', model: body.model,
            content: output ? [{ type: 'text', text: output }] : [],
            stop_reason: fakeMode === 'refusal' ? 'refusal' : 'end_turn', stop_sequence: null,
            usage: { input_tokens: 3000, output_tokens: 1200 },
        }));
    });
});

// En-tête JPEG minimal, lisible par la validation de la fonction.
function jpegBase64(width, height) {
    return Buffer.from([
        0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00,
        0xff, 0xc0, 0x00, 0x11, 0x08, height >> 8, height & 0xff, width >> 8, width & 0xff,
        0x03, 0x01, 0x22, 0x00, 0x02, 0x11, 0x01, 0x03, 0x11, 0x01, 0xff, 0xd9,
    ]).toString('base64');
}

let functionProcess = null;
let functionLogs = '';
async function startFunction(extraEnv = {}, name = 'ai-identify') {
    await stopFunction();
    functionLogs = '';
    const entry = path.resolve(`supabase/functions/${name}/index.ts`);
    functionProcess = spawn(process.env.DENO_BIN, ['run', '--allow-net', '--allow-env', '--allow-read', '--allow-sys', '--no-config', entry], {
        env: {
            PATH: process.env.PATH, HOME: process.env.HOME, DENO_DIR: process.env.DENO_DIR ?? '',
            SUPABASE_URL: api, SUPABASE_ANON_KEY: config.ANON_KEY, SUPABASE_SERVICE_ROLE_KEY: config.SERVICE_ROLE_KEY,
            ANTHROPIC_API_KEY: placeholderCredential, ANTHROPIC_BASE_URL: `http://127.0.0.1:${FAKE_ANTHROPIC_PORT}`,
            AI_EFFORT: 'low', AI_MONTHLY_BUDGET_USD: '18', ALLOWED_ORIGINS: ALLOWED_ORIGIN,
            ...extraEnv,
        },
        stdio: ['ignore', 'pipe', 'pipe'],
    });
    functionProcess.stdout.on('data', chunk => { functionLogs += chunk; });
    functionProcess.stderr.on('data', chunk => { functionLogs += chunk; });
    for (let i = 0; i < 300; i++) {
        try { await fetch(FUNCTION_URL, { method: 'OPTIONS', signal: AbortSignal.timeout(1000) }); return; } catch { /* démarrage */ }
        await new Promise(resolve => setTimeout(resolve, 200));
    }
    throw new Error(`La fonction n'a pas démarré :\n${functionLogs.slice(-2000)}`);
}
async function stopFunction() {
    if (!functionProcess) return;
    const proc = functionProcess;
    functionProcess = null;
    await new Promise(resolve => { proc.once('exit', resolve); proc.kill('SIGTERM'); });
}
async function callFunction({ token, body, rawBody, origin, method = 'POST' } = {}) {
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers.Authorization = `Bearer ${token}`;
    if (origin) headers.Origin = origin;
    const res = await fetch(FUNCTION_URL, {
        method, headers, signal: AbortSignal.timeout(30000),
        body: method === 'POST' ? (rawBody ?? JSON.stringify(body ?? {})) : undefined,
    });
    const text = await res.text();
    let json = null;
    try { json = text ? JSON.parse(text) : null; } catch { json = text; }
    return { status: res.status, json, headers: res.headers };
}

let budgetRowId = null;
try {
    await new Promise(resolve => fakeAnthropic.listen(FAKE_ANTHROPIC_PORT, '127.0.0.1', resolve));
    const a = await createUser('a');
    const b = await createUser('b');

    // --- Accès anonyme ---------------------------------------------------
    denied(await rest('/rest/v1/ai_access?select=*'), 'anon lit ai_access');
    denied(await rest('/rest/v1/ai_usage?select=*'), 'anon lit ai_usage');
    denied(await rest('/rest/v1/ai_access', { method: 'POST', body: { user_id: a.id, consent_version: CONSENT } }), 'anon insère');
    denied(await rest('/rest/v1/rpc/ai_my_status', { method: 'POST', body: {} }), 'anon ai_my_status');
    denied(await rest('/rest/v1/rpc/ai_reserve_call', { method: 'POST', body: { p_user: a.id, p_consent_version: CONSENT, p_model: 'x', p_budget_usd: 18, p_max_cost_usd: 0.04 } }), 'anon ai_reserve_call');
    passed('Accès anonyme refusé (lecture, insertion, fonctions)');

    // --- Demande d'accès : seulement « pending », seulement pour soi -------
    denied(await rest('/rest/v1/ai_access', { method: 'POST', token: a.token, body: { user_id: a.id, consent_version: CONSENT, status: 'approved' } }), "s'approuver à l'insertion");
    denied(await rest('/rest/v1/ai_access', { method: 'POST', token: a.token, body: { user_id: a.id, consent_version: CONSENT, monthly_quota: 1000 } }), 'choisir son quota');
    denied(await rest('/rest/v1/ai_access', { method: 'POST', token: a.token, body: { user_id: a.id, consent_version: CONSENT, note: 'ok' } }), 'écrire la note');
    denied(await rest('/rest/v1/ai_access', { method: 'POST', token: a.token, body: { user_id: b.id, consent_version: CONSENT } }), 'demander pour autrui');
    const request = await rest('/rest/v1/ai_access', { method: 'POST', token: a.token, body: { user_id: a.id, consent_version: CONSENT }, prefer: 'return=representation' });
    assert.equal(request.status, 201);
    assert.equal(request.json[0].status, 'pending');
    assert.equal(request.json[0].monthly_quota, 20);
    passed("Demande d'accès : pending, quota 20, impossible de s'approuver, de changer son quota ou de demander pour autrui");

    const patch = await rest(`/rest/v1/ai_access?user_id=eq.${a.id}`, { method: 'PATCH', token: a.token, body: { status: 'approved' } });
    denied(patch, 'PATCH de sa ligne');
    const upsert = await rest('/rest/v1/ai_access', { method: 'POST', token: a.token, body: { user_id: a.id, consent_version: CONSENT }, prefer: 'resolution=merge-duplicates' });
    denied(upsert, 'upsert de sa ligne');
    const afterPatch = await asService(`/rest/v1/ai_access?user_id=eq.${a.id}&select=status,monthly_quota`);
    assert.deepEqual(afterPatch.json, [{ status: 'pending', monthly_quota: 20 }]);
    passed('PATCH et upsert refusés, la ligne reste pending');

    const seenByB = await rest('/rest/v1/ai_access?select=user_id', { token: b.token });
    assert.equal(seenByB.status, 200);
    assert.deepEqual(seenByB.json, []);
    const deleteByB = await rest(`/rest/v1/ai_access?user_id=eq.${a.id}`, { method: 'DELETE', token: b.token, prefer: 'return=representation' });
    assert.deepEqual(deleteByB.json, []);
    passed("Un utilisateur ne voit ni ne supprime la demande d'un autre");

    // --- Fonctions réservées ------------------------------------------------
    denied(await rest('/rest/v1/rpc/ai_reserve_call', { method: 'POST', token: a.token, body: { p_user: a.id, p_consent_version: CONSENT, p_model: 'x', p_budget_usd: 18, p_max_cost_usd: 0.04 } }), 'authenticated ai_reserve_call');
    denied(await rest('/rest/v1/rpc/ai_finalize_call', { method: 'POST', token: a.token, body: { p_id: randomUUID(), p_status: 'ok', p_input_tokens: 0, p_output_tokens: 0, p_cost_usd: 0 } }), 'authenticated ai_finalize_call');
    denied(await rest('/rest/v1/ai_usage', { method: 'POST', token: a.token, body: { user_id: a.id, model: 'x', cost_usd: 0, status: 'ok' } }), 'insertion ai_usage');
    passed('ai_reserve_call, ai_finalize_call et insertion dans ai_usage refusées aux utilisateurs');

    // --- Réservation : accès et consentement -------------------------------
    assert.equal((await reserve(a.id)).json.reason, 'not_approved');
    assert.equal((await reserve(randomUUID())).json.reason, 'not_approved');
    const pendingStatus = await rest('/rest/v1/rpc/ai_my_status', { method: 'POST', token: a.token, body: {} });
    assert.equal(pendingStatus.json.status, 'pending');
    await approve(a.id, '2025-01-v0');
    assert.equal((await reserve(a.id)).json.reason, 'consent_outdated');
    passed('Réservation refusée sans accès approuvé et avec un consentement périmé');

    // --- Retrait puis nouvelle demande --------------------------------------
    const withdraw = await rest(`/rest/v1/ai_access?user_id=eq.${a.id}`, { method: 'DELETE', token: a.token, prefer: 'return=representation' });
    assert.equal(withdraw.status, 200);
    assert.equal(withdraw.json.length, 1);
    assert.equal((await rest('/rest/v1/rpc/ai_my_status', { method: 'POST', token: a.token, body: {} })).json.status, 'none');
    const again = await rest('/rest/v1/ai_access', { method: 'POST', token: a.token, body: { user_id: a.id, consent_version: CONSENT }, prefer: 'return=representation' });
    assert.equal(again.json[0].status, 'pending');
    assert.equal((await reserve(a.id)).json.reason, 'not_approved');
    passed("Retrait de l'accord puis nouvelle demande : retour en attente");

    // --- Anti double-clic : 25 appels simultanés, un seul passe ------------
    await approve(a.id);
    const burst = await Promise.all(Array.from({ length: 25 }, () => reserve(a.id)));
    const burstOk = burst.filter(r => r.json?.ok === true);
    assert.equal(burstOk.length, 1, `25 appels simultanés : ${burstOk.length} réservations`);
    assert(burst.filter(r => r.json?.ok !== true).every(r => r.json.reason === 'busy'));
    passed('25 réservations simultanées pour une personne : exactement 1 passe, les autres « busy »');

    // --- Quota : échecs non comptés, 20 par mois ----------------------------
    assert.equal((await finalize(burstOk[0].json.usage_id, 'failed', 0)).json, true);
    assert.equal((await finalize(burstOk[0].json.usage_id, 'ok', 5)).json, false, 'une ligne finalisée ne bouge plus');
    const remainings = [];
    for (let i = 0; i < 20; i++) {
        const r = await reserve(a.id);
        assert.equal(r.json.ok, true, `réservation ${i + 1} : ${JSON.stringify(r.json)}`);
        remainings.push(r.json.remaining);
        assert.equal((await finalize(r.json.usage_id, i % 2 ? 'refused' : 'ok')).json, true);
    }
    assert.deepEqual(remainings, Array.from({ length: 20 }, (_, i) => 19 - i));
    assert.equal((await reserve(a.id)).json.reason, 'quota_exceeded');
    const fullStatus = await rest('/rest/v1/rpc/ai_my_status', { method: 'POST', token: a.token, body: {} });
    assert.equal(fullStatus.json.used, 20);
    assert.equal(fullStatus.json.remaining, 0);
    passed('Quota : un appel « failed » ne compte pas, 20 passent puis quota_exceeded (ai_my_status cohérent)');

    // --- Une ligne pending ancienne compte, sans bloquer --------------------
    await approve(b.id);
    const oldPending = await asService('/rest/v1/ai_usage', {
        method: 'POST', prefer: 'return=representation',
        body: { user_id: b.id, model: 'claude-sonnet-5-5', cost_usd: MAX_COST, status: 'pending', created_at: new Date(Date.now() - 10 * 60_000).toISOString() },
    });
    assert.equal(oldPending.status, 201);
    const afterOld = await reserve(b.id);
    assert.equal(afterOld.json.ok, true);
    assert.equal(afterOld.json.remaining, 18);
    assert.equal((await reserve(b.id)).json.reason, 'busy');
    passed('Une ligne pending ancienne compte dans le quota ; une récente bloque (busy)');

    // --- Usage : lecture limitée à soi, aucune suppression ------------------
    const usageA = await rest('/rest/v1/ai_usage?select=user_id', { token: a.token });
    assert.equal(usageA.status, 200);
    assert(usageA.json.length >= 20 && usageA.json.every(row => row.user_id === a.id));
    const wipe = await rest(`/rest/v1/ai_usage?user_id=eq.${a.id}`, { method: 'DELETE', token: a.token });
    denied(wipe, 'suppression de son journal');
    passed("ai_usage : chacun ne lit que ses lignes et ne peut pas effacer son quota");

    // --- Budget : 5 personnes simultanées, exactement 2 passent -------------
    const budgetUsers = [];
    for (const name of ['c', 'd', 'e', 'f', 'g']) {
        const user = await createUser(name);
        await approve(user.id);
        budgetUsers.push(user);
    }
    const budget = Number(((await monthSpent()) + 0.1).toFixed(6));
    const budgetRun = await Promise.all(budgetUsers.map(user => reserve(user.id, { p_budget_usd: budget, p_max_cost_usd: MAX_COST })));
    const budgetOk = budgetRun.filter(r => r.json?.ok === true);
    assert.equal(budgetOk.length, 2, `budget : ${budgetOk.length} réservations`);
    assert(budgetRun.filter(r => r.json?.ok !== true).every(r => r.json.reason === 'budget_exhausted'));
    assert.equal((await reserve(budgetUsers[4].id, { p_budget_usd: 0 })).json.reason, 'budget_exhausted');
    passed('Budget de « dépense + 0,10 $ » avec coût max 0,042 $ : exactement 2 réservations sur 5 personnes ; budget 0 = arrêt');

    // --- Suppression d'un compte : la dépense du mois ne baisse pas ---------
    budgetRowId = budgetOk[0].json.usage_id;
    const owner = (await asService(`/rest/v1/ai_usage?id=eq.${budgetRowId}&select=user_id`)).json[0].user_id;
    const spentBefore = await monthSpent();
    const removed = await asService(`/auth/v1/admin/users/${owner}`, { method: 'DELETE' });
    assert.equal(removed.status, 200);
    for (const [name, user] of users) if (user.id === owner) users.delete(name);
    const spentAfter = await monthSpent();
    assert.equal(spentAfter.toFixed(6), spentBefore.toFixed(6));
    const orphan = await asService(`/rest/v1/ai_usage?id=eq.${budgetRowId}&select=user_id,cost_usd`);
    assert.equal(orphan.json[0].user_id, null);
    assert.deepEqual((await asService(`/rest/v1/ai_access?user_id=eq.${owner}`)).json, []);
    passed("Suppression d'un compte : accès supprimé, journal anonymisé, dépense du mois inchangée");

    // --- Consentements par fonctionnalité (ai_consents) ---------------------
    const t = await createUser('t');
    denied(await rest('/rest/v1/ai_consents?select=*'), 'anon lit ai_consents');
    denied(await rest('/rest/v1/ai_consents', { method: 'POST', body: { user_id: t.id, feature: 'summary', version: TEXT_CONSENT } }), 'anon insère un consentement');
    denied(await giveConsent(t, 'summary', TEXT_CONSENT, { given_at: '2020-01-01T00:00:00Z' }), 'choisir given_at');
    denied(await rest('/rest/v1/ai_consents', { method: 'POST', token: t.token, body: { user_id: b.id, feature: 'summary', version: TEXT_CONSENT } }), 'consentir pour autrui');
    const badFeature = await giveConsent(t, 'identify');
    assert(badFeature.status >= 400, `consentement « identify » : attendu un refus, reçu ${badFeature.status}`);
    const consent = await giveConsent(t, 'summary');
    assert.equal(consent.status, 201, JSON.stringify(consent.json));
    assert.equal(consent.json[0].version, TEXT_CONSENT);
    assert(Math.abs(Date.parse(consent.json[0].given_at) - Date.now()) < 120_000, 'given_at posé par le serveur');
    denied(await rest(`/rest/v1/ai_consents?user_id=eq.${t.id}`, { method: 'PATCH', token: t.token, body: { version: '2099-01-v9' } }), 'PATCH de son consentement');
    denied(await rest('/rest/v1/ai_consents', { method: 'POST', token: t.token, body: { user_id: t.id, feature: 'summary', version: '2099-01-v9' }, prefer: 'resolution=merge-duplicates' }), 'upsert de son consentement');
    // « ignore-duplicates » (on conflict do nothing) n'exige que INSERT : il peut
    // répondre sans erreur, mais ne doit jamais changer la version enregistrée.
    await rest('/rest/v1/ai_consents', { method: 'POST', token: t.token, body: { user_id: t.id, feature: 'summary', version: '2099-01-v9' }, prefer: 'resolution=ignore-duplicates' });
    assert.deepEqual((await asService(`/rest/v1/ai_consents?user_id=eq.${t.id}&select=feature,version`)).json, [{ feature: 'summary', version: TEXT_CONSENT }]);
    assert.deepEqual((await rest('/rest/v1/ai_consents?select=user_id', { token: b.token })).json, []);
    assert.deepEqual((await rest(`/rest/v1/ai_consents?user_id=eq.${t.id}`, { method: 'DELETE', token: b.token, prefer: 'return=representation' })).json, []);
    passed('ai_consents : anonyme refusé ; ni given_at choisi, ni consentement pour autrui, ni PATCH, ni upsert (version inchangée) ; invisible pour les autres');

    // --- Réservation par fonctionnalité -------------------------------------
    const reserveText = (user, feature, overrides = {}) => reserve(user.id, { p_consent_version: TEXT_CONSENT, p_feature: feature, ...overrides });
    assert.equal((await reserveText(t, 'summary')).json.reason, 'not_approved');
    await approve(t.id);
    assert.equal((await reserveText(t, 'note')).json.reason, 'consent_outdated', 'sans consentement « note »');
    assert.equal((await reserveText(t, 'summary', { p_consent_version: '2099-01-v9' })).json.reason, 'consent_outdated', 'version différente');
    const bogus = await reserveText(t, 'bogus');
    assert(bogus.status >= 400, `fonctionnalité inconnue : attendu une erreur, reçu ${bogus.status}`);
    const summaryCall = await reserveText(t, 'summary');
    assert.equal(summaryCall.json.ok, true, JSON.stringify(summaryCall.json));
    const summaryRow = (await asService(`/rest/v1/ai_usage?id=eq.${summaryCall.json.usage_id}&select=feature,status`)).json[0];
    assert.deepEqual(summaryRow, { feature: 'summary', status: 'pending' });
    passed('Réservation : accès exigé, consentement de la fonctionnalité exigé en égalité stricte, fonctionnalité inconnue refusée, feature enregistrée');

    // « busy » par fonctionnalité : un bilan en cours ne bloque pas la photo.
    assert.equal((await reserveText(t, 'summary')).json.reason, 'busy');
    const photoCall = await reserve(t.id);
    assert.equal(photoCall.json.ok, true, `photo pendant un bilan : ${JSON.stringify(photoCall.json)}`);
    assert.equal((await asService(`/rest/v1/ai_usage?id=eq.${photoCall.json.usage_id}&select=feature`)).json[0].feature, 'identify');
    assert.equal((await reserve(t.id)).json.reason, 'busy');
    passed('« busy » par fonctionnalité ; sans p_feature, la réservation reste « identify » (ai-identify inchangée)');

    // Quota partagé : 3 utilisations au total, toutes fonctionnalités confondues.
    const quotaPatch = await asService(`/rest/v1/ai_access?user_id=eq.${t.id}`, { method: 'PATCH', body: { monthly_quota: 3 } });
    assert(quotaPatch.status === 204 || quotaPatch.status === 200);
    assert.equal((await finalize(summaryCall.json.usage_id, 'ok')).json, true);
    assert.equal((await finalize(photoCall.json.usage_id, 'ok')).json, true);
    const third = await reserveText(t, 'summary');
    assert.equal(third.json.ok, true);
    assert.equal(third.json.remaining, 0);
    assert.equal((await finalize(third.json.usage_id, 'invalid_output')).json, true);
    assert.equal((await reserveText(t, 'summary')).json.reason, 'quota_exceeded');
    assert.equal((await reserve(t.id)).json.reason, 'quota_exceeded');
    const tStatus = (await rest('/rest/v1/rpc/ai_my_status', { method: 'POST', token: t.token, body: {} })).json;
    assert.equal(tStatus.used, 3);
    assert.equal(tStatus.remaining, 0);
    assert.equal(tStatus.consent_version, CONSENT);
    assert.deepEqual(tStatus.used_by_feature, { identify: 1, summary: 2 });
    assert.deepEqual(tStatus.consents, { summary: TEXT_CONSENT });
    passed('Quota partagé entre fonctionnalités ; ai_my_status détaille l’usage et les consentements');

    // Retrait du consentement : la fonctionnalité est refusée, l'accès reste.
    await asService(`/rest/v1/ai_access?user_id=eq.${t.id}`, { method: 'PATCH', body: { monthly_quota: 20 } });
    const withdrawn = await rest(`/rest/v1/ai_consents?user_id=eq.${t.id}&feature=eq.summary`, { method: 'DELETE', token: t.token, prefer: 'return=representation' });
    assert.equal(withdrawn.json.length, 1);
    assert.equal((await reserveText(t, 'summary')).json.reason, 'consent_outdated');
    assert.equal((await asService(`/rest/v1/ai_access?user_id=eq.${t.id}&select=status`)).json[0].status, 'approved');
    const renewed = await giveConsent(t, 'summary');
    assert.equal(renewed.status, 201);
    passed('Retrait puis nouvel accord : refus entre les deux, approbation conservée');

    // Suppression du compte : ses consentements disparaissent.
    const tId = t.id;
    assert.equal((await asService(`/auth/v1/admin/users/${tId}`, { method: 'DELETE' })).status, 200);
    users.delete('t');
    assert.deepEqual((await asService(`/rest/v1/ai_consents?user_id=eq.${tId}`)).json, []);
    passed("Suppression d'un compte : consentements supprimés");

    // --- Contrôles des privilèges en SQL (facultatif) -----------------------
    if (process.env.POSTGRES_MODULE) {
        const postgres = (await import(process.env.POSTGRES_MODULE)).default;
        const sql = postgres(config.DB_URL, { max: 1 });
        try {
            const [p] = await sql`select
                has_table_privilege('authenticated', 'public.ai_access', 'UPDATE') as auth_update_access,
                has_column_privilege('authenticated', 'public.ai_access', 'status', 'INSERT') as auth_insert_status,
                has_column_privilege('authenticated', 'public.ai_access', 'monthly_quota', 'INSERT') as auth_insert_quota,
                has_column_privilege('authenticated', 'public.ai_access', 'user_id', 'INSERT') as auth_insert_user,
                has_column_privilege('authenticated', 'public.ai_access', 'consent_version', 'INSERT') as auth_insert_consent,
                has_table_privilege('authenticated', 'public.ai_usage', 'INSERT') as auth_insert_usage,
                has_table_privilege('authenticated', 'public.ai_usage', 'UPDATE') as auth_update_usage,
                has_table_privilege('authenticated', 'public.ai_usage', 'DELETE') as auth_delete_usage,
                has_table_privilege('authenticated', 'public.ai_usage', 'TRUNCATE') as auth_truncate_usage,
                has_table_privilege('anon', 'public.ai_access', 'SELECT') as anon_select_access,
                has_table_privilege('anon', 'public.ai_usage', 'SELECT') as anon_select_usage,
                has_function_privilege('authenticated', 'public.ai_reserve_call(uuid, text, text, numeric, numeric, text)', 'EXECUTE') as auth_reserve,
                has_function_privilege('anon', 'public.ai_reserve_call(uuid, text, text, numeric, numeric, text)', 'EXECUTE') as anon_reserve,
                has_function_privilege('authenticated', 'public.ai_finalize_call(uuid, text, integer, integer, numeric)', 'EXECUTE') as auth_finalize,
                has_function_privilege('anon', 'public.ai_my_status()', 'EXECUTE') as anon_status,
                has_function_privilege('authenticated', 'public.ai_my_status()', 'EXECUTE') as auth_status,
                has_function_privilege('service_role', 'public.ai_reserve_call(uuid, text, text, numeric, numeric, text)', 'EXECUTE') as service_reserve,
                has_table_privilege('anon', 'public.ai_consents', 'SELECT') as anon_select_consents,
                has_table_privilege('authenticated', 'public.ai_consents', 'UPDATE') as auth_update_consents,
                has_table_privilege('authenticated', 'public.ai_consents', 'TRUNCATE') as auth_truncate_consents,
                has_column_privilege('authenticated', 'public.ai_consents', 'given_at', 'INSERT') as auth_insert_given_at,
                has_column_privilege('authenticated', 'public.ai_consents', 'version', 'INSERT') as auth_insert_version,
                has_table_privilege('authenticated', 'public.ai_consents', 'DELETE') as auth_delete_consents,
                (select count(*)::int from pg_proc where proname = 'ai_reserve_call' and pronamespace = 'public'::regnamespace) as reserve_versions,
                (select bool_and(relrowsecurity) from pg_class where oid in ('public.ai_access'::regclass, 'public.ai_usage'::regclass, 'public.ai_consents'::regclass)) as rls_on`;
            assert.deepEqual({ ...p }, {
                auth_update_access: false, auth_insert_status: false, auth_insert_quota: false,
                auth_insert_user: true, auth_insert_consent: true,
                auth_insert_usage: false, auth_update_usage: false, auth_delete_usage: false, auth_truncate_usage: false,
                anon_select_access: false, anon_select_usage: false,
                auth_reserve: false, anon_reserve: false, auth_finalize: false,
                anon_status: false, auth_status: true, service_reserve: true,
                anon_select_consents: false, auth_update_consents: false, auth_truncate_consents: false,
                auth_insert_given_at: false, auth_insert_version: true, auth_delete_consents: true,
                reserve_versions: 1, rls_on: true,
            });
            const updatePolicies = await sql`select count(*)::int as n from pg_policies
                where schemaname = 'public' and tablename in ('ai_access', 'ai_usage', 'ai_consents') and cmd in ('UPDATE', 'ALL')`;
            assert.equal(updatePolicies[0].n, 0);
        } finally {
            await sql.end();
        }
        passed('has_table/column/function_privilege conformes (dont ai_consents), une seule ai_reserve_call, RLS active, aucune règle UPDATE');
    } else {
        console.log('SKIP contrôles SQL des privilèges (POSTGRES_MODULE absent)');
    }

    // --- Fonction ai-identify de bout en bout (facultatif) ------------------
    if (process.env.DENO_BIN) {
        const image = jpegBase64(1280, 960);
        const h = await createUser('h'); // approuvé
        await approve(h.id);
        const n = await createUser('n'); // sans accès
        await startFunction();

        assert.equal((await callFunction({ body: { image } })).status, 401);
        assert.equal((await callFunction({ token: 'pas-un-jeton', body: { image } })).status, 401);
        passed('Fonction : 401 sans jeton ou avec un jeton invalide');

        const noAccess = await callFunction({ token: n.token, body: { image } });
        assert.equal(noAccess.status, 403);
        assert.equal(noAccess.json.error, 'not_approved');
        passed('Fonction : 403 sans accès approuvé');

        const tooLarge = await callFunction({ token: h.token, rawBody: JSON.stringify({ image: 'A'.repeat(2_100_000) }) });
        assert.equal(tooLarge.status, 413);
        const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]).toString('base64');
        assert.equal((await callFunction({ token: h.token, body: { image: png } })).status, 400);
        assert.equal((await callFunction({ token: h.token, body: { image: Buffer.from('octets quelconques').toString('base64') } })).status, 400);
        assert.equal((await callFunction({ token: h.token, body: { image: jpegBase64(2576, 1932) } })).status, 400);
        assert.equal((await callFunction({ token: h.token, rawBody: '{pas du json' })).status, 400);
        passed('Fonction : 413 au-delà de 2 Mo, 400 pour PNG, octets quelconques, JPEG trop grand ou JSON invalide');

        const foreign = await callFunction({ token: h.token, body: { image }, origin: 'https://pirate.example' });
        assert.equal(foreign.status, 403);
        assert.equal(foreign.headers.get('access-control-allow-origin'), null);
        const preflight = await callFunction({ method: 'OPTIONS', origin: ALLOWED_ORIGIN });
        assert.equal(preflight.status, 204);
        assert.equal(preflight.headers.get('access-control-allow-origin'), ALLOWED_ORIGIN);
        assert.match(preflight.headers.get('vary') ?? '', /Origin/);
        passed("Fonction : origine inconnue refusée sans en-tête CORS, origine autorisée acceptée (Vary: Origin)");

        fakeRequests.length = 0;
        fakeMode = 'ok';
        const ok = await callFunction({
            token: h.token, origin: ALLOWED_ORIGIN,
            body: { image, month: '2026-05', country: 'France', taxonomicGroup: 'Oiseaux', latitude: 44.8, longitude: -0.5, commune: 'Bordeaux' },
        });
        assert.equal(ok.status, 200, JSON.stringify(ok.json));
        assert.equal(ok.json.candidates[0].scientificName, 'Erithacus rubecula');
        assert.equal(ok.json.remaining, 19);
        assert.equal(fakeRequests.length, 1);
        const sent = fakeRequests[0].body;
        assert.equal(sent.model, 'claude-sonnet-5-5');
        assert.equal(sent.output_config.effort, 'low');
        assert.equal(sent.output_config.format.type, 'json_schema');
        assert.equal(sent.thinking, undefined);
        assert.equal(sent.fallbacks, undefined);
        assert.doesNotMatch(JSON.stringify(sent.messages), /44\.8|Bordeaux|-0\.5/);
        const okRow = (await asService(`/rest/v1/ai_usage?user_id=eq.${h.id}&select=status,cost_usd,input_tokens,output_tokens&order=created_at.desc&limit=1`)).json[0];
        assert.deepEqual({ ...okRow, cost_usd: Number(okRow.cost_usd) }, { status: 'ok', cost_usd: 0.018, input_tokens: 3000, output_tokens: 1200 });
        passed('Fonction : analyse réussie, coût réel enregistré (0,018 $), ni GPS ni commune envoyés, effort et format JSON transmis');

        fakeMode = 'overloaded';
        const overloaded = await callFunction({ token: h.token, body: { image } });
        assert.equal(overloaded.status, 503);
        assert.equal(overloaded.json.error, 'upstream_unavailable');
        const failedRow = (await asService(`/rest/v1/ai_usage?user_id=eq.${h.id}&select=status,cost_usd&order=created_at.desc&limit=1`)).json[0];
        assert.deepEqual({ ...failedRow, cost_usd: Number(failedRow.cost_usd) }, { status: 'failed', cost_usd: 0 });
        fakeMode = 'refusal';
        const refused = await callFunction({ token: h.token, body: { image } });
        assert.equal(refused.status, 422);
        assert.equal(refused.json.error, 'model_refused');
        fakeMode = 'ok';
        passed('Fonction : surcharge Anthropic → 503 et ligne failed à 0 $ ; refus du modèle → 422');

        assert.doesNotMatch(functionLogs, /\/9j\//, 'aucune image dans les journaux');
        assert(!functionLogs.includes(h.id), "aucun id d'utilisateur dans les journaux");
        assert.doesNotMatch(functionLogs, /Erithacus|Rougegorge/, 'aucune hypothèse dans les journaux');
        passed("Journaux : ni image, ni id d'utilisateur, ni hypothèse");

        await startFunction({ AI_MODEL: 'claude-inconnu-1' });
        const badModel = await callFunction({ token: h.token, body: { image } });
        assert.equal(badModel.status, 503);
        assert.equal(badModel.json.error, 'misconfigured');
        await startFunction({ AI_EFFORT: '' });
        assert.equal((await callFunction({ token: h.token, body: { image } })).json.error, 'misconfigured');
        passed('Fonction : modèle inconnu ou effort absent → 503 misconfigured');

        // --- Fonction ai-text de bout en bout --------------------------------
        const summaryBody = {
            feature: 'summary',
            payload: {
                month: '2026-05', totals: { observations: 42, species: 17, activeDays: 9 },
                groups: [{ group: 'Oiseaux', observations: 42, species: 17 }],
                topSpecies: [{ name: 'Mésange charbonnière', count: 14 }],
                newSpecies: ['Huppe fasciée'],
                commune: 'Bordeaux', latitude: 44.8,
            },
        };
        const textEnv = { AI_TEXT_MODEL: 'claude-haiku-5-5' };
        await startFunction(textEnv, 'ai-text');
        assert.equal((await callFunction({ body: summaryBody })).status, 401);
        const textForeign = await callFunction({ token: h.token, body: summaryBody, origin: 'https://pirate.example' });
        assert.equal(textForeign.status, 403);
        assert.equal(textForeign.headers.get('access-control-allow-origin'), null);
        const textPreflight = await callFunction({ method: 'OPTIONS', origin: ALLOWED_ORIGIN });
        assert.equal(textPreflight.status, 204);
        assert.equal(textPreflight.headers.get('access-control-allow-origin'), ALLOWED_ORIGIN);
        assert.equal((await callFunction({ token: h.token, rawBody: JSON.stringify({ feature: 'summary', payload: { pad: 'x'.repeat(17_000) } }) })).status, 413);
        assert.equal((await callFunction({ token: h.token, body: { feature: 'note', payload: {} } })).status, 400);
        assert.equal((await callFunction({ token: h.token, body: { feature: 'summary', payload: { month: '2026-13' } } })).status, 400);
        passed('ai-text : 401 sans jeton, CORS, 413 au-delà de 16 Ko, 400 pour une fonctionnalité non livrée ou une charge invalide');

        const noConsent = await callFunction({ token: h.token, body: summaryBody });
        assert.equal(noConsent.status, 403);
        assert.equal(noConsent.json.error, 'consent_outdated');
        assert.equal((await giveConsent(h, 'summary')).status, 201);

        fakeRequests.length = 0;
        fakeMode = 'summary';
        const summaryOk = await callFunction({ token: h.token, origin: ALLOWED_ORIGIN, body: summaryBody });
        assert.equal(summaryOk.status, 200, JSON.stringify(summaryOk.json));
        assert.match(summaryOk.json.result.text, /42 observations/);
        assert.equal(typeof summaryOk.json.remaining, 'number');
        assert.equal(fakeRequests.length, 1);
        const textSent = fakeRequests[0].body;
        assert.equal(textSent.model, 'claude-haiku-5-5');
        assert.equal(textSent.output_config.format.type, 'json_schema');
        assert.doesNotMatch(JSON.stringify(textSent.messages), /Bordeaux|44\.8/);
        const textRow = (await asService(`/rest/v1/ai_usage?user_id=eq.${h.id}&select=feature,status,cost_usd&order=created_at.desc&limit=1`)).json[0];
        assert.deepEqual({ ...textRow, cost_usd: Number(textRow.cost_usd) }, { feature: 'summary', status: 'ok', cost_usd: 0.0009 });
        passed('ai-text : consentement « summary » exigé ; bilan rédigé, ligne summary au coût réel (0,0009 $), ni commune ni GPS envoyés');

        assert(!functionLogs.includes(h.id), "ai-text : aucun id d'utilisateur dans les journaux");
        assert.doesNotMatch(functionLogs, /Mésange|Huppe|42 observations/, 'ai-text : ni chiffres ni texte dans les journaux');
        passed('ai-text : journaux sans utilisateur, sans noms d’espèces ni texte produit');

        await startFunction({ ...textEnv, AI_DISABLED_FEATURES: 'summary' }, 'ai-text');
        const disabledCall = await callFunction({ token: h.token, body: summaryBody });
        assert.equal(disabledCall.status, 503);
        assert.equal(disabledCall.json.error, 'feature_disabled');
        await startFunction({}, 'ai-text');
        assert.equal((await callFunction({ token: h.token, body: summaryBody })).json.error, 'misconfigured');
        await startFunction({ ...textEnv, AI_DISABLED_FEATURES: 'sumary' }, 'ai-text');
        assert.equal((await callFunction({ token: h.token, body: summaryBody })).json.error, 'misconfigured');
        fakeMode = 'ok';
        passed('ai-text : fonctionnalité coupée → 503 feature_disabled ; modèle absent ou liste de coupure fautive → misconfigured');
    } else {
        console.log('SKIP tests de la fonction (DENO_BIN absent)');
    }

    console.log(`\n${checks.length} contrôles réussis.`);
} finally {
    await stopFunction();
    fakeAnthropic.close();
    const ids = [...users.values()].map(user => user.id);
    if (ids.length) await asService(`/rest/v1/ai_usage?user_id=in.(${ids.join(',')})`, { method: 'DELETE' });
    if (budgetRowId) await asService(`/rest/v1/ai_usage?id=eq.${budgetRowId}`, { method: 'DELETE' });
    for (const user of users.values()) await asService(`/auth/v1/admin/users/${user.id}`, { method: 'DELETE' });
}
