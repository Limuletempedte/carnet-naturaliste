// Banc d'essai de la fonction `ai-text` SANS Supabase : faux Supabase (identité
// et deux fonctions SQL) + faux serveur Anthropic, tous deux locaux. Aucune
// clé réelle, aucun appel payant, pas besoin de Docker.
// Vérifie l'enchaînement de index.ts : CORS, identité, limites du corps,
// arguments de ai_reserve_call (dont p_feature), appel envoyé à Claude,
// finalisation, codes d'erreur et journaux, pour le bilan (`summary`) et la
// note (`note`).
// Les droits SQL et la réservation réelle sont couverts par ai-access-rls.mjs.
//
// Depuis la racine du dépôt :  DENO_BIN=$(command -v deno) node tests/security/ai-text-bench.mjs
// (ports locaux utilisés : 8000, 55440, 55441).
import assert from 'node:assert/strict';
import http from 'node:http';
import path from 'node:path';
import { spawn } from 'node:child_process';

const ENTRY = path.resolve('supabase/functions/ai-text/index.ts');
const DENO = process.env.DENO_BIN;
assert(DENO, 'DENO_BIN manquant (chemin de Deno)');
const SUPA_PORT = 55441, ANTH_PORT = 55440, FN = 'http://127.0.0.1:8000';
const USER_ID = '11111111-2222-3333-4444-555555555555';
const GOOD = 'jeton-valide';

const rpcCalls = [];
let reserveReply = { ok: true, usage_id: 'usage-1', remaining: 5 };
const supa = http.createServer((req, res) => {
    let raw = ''; req.on('data', c => { raw += c; }); req.on('end', () => {
        res.setHeader('Content-Type', 'application/json');
        if (req.url.startsWith('/auth/v1/user')) {
            if (req.headers.authorization === `Bearer ${GOOD}`) {
                res.end(JSON.stringify({ id: USER_ID, aud: 'authenticated', role: 'authenticated', email: 'x@example.test', app_metadata: {}, user_metadata: {}, created_at: new Date().toISOString() }));
            } else { res.statusCode = 401; res.end(JSON.stringify({ code: 401, msg: 'invalid' })); }
            return;
        }
        if (req.url.startsWith('/rest/v1/rpc/')) {
            const name = req.url.slice('/rest/v1/rpc/'.length).split('?')[0];
            rpcCalls.push({ name, body: JSON.parse(raw), auth: req.headers.authorization });
            res.end(JSON.stringify(name === 'ai_reserve_call' ? reserveReply : true));
            return;
        }
        res.statusCode = 404; res.end('{}');
    });
});

// Un bilan fait au moins 40 mots quand le mois compte des observations
// (SUMMARY_LIMITS.minOutputWords) : complément sans chiffre.
const FILLER = ' Vos sorties ont été régulières et variées, et votre carnet garde la trace de chacune de ces rencontres, au fil des chemins, des haies et des mares que vous avez pris le temps de parcourir tout au long de ce mois.';
const GOOD_TEXT = `En mai 2026, vous avez noté 42 observations de 17 espèces, dont la Huppe fasciée.${FILLER}`;

// Réponse du faux modèle pour la note : `time` fautif (25:00), retiré par le
// validateur sans rejeter le reste.
const NOTE_TEXT = 'Ce matin 3 mésanges charbonnières au bord de l’étang de la Brosse, ensoleillé, avec Gaspard <img src=x onerror=alert(1)>';
const NOTE_ANSWER = {
    speciesName: 'Mésange charbonnière', scientificName: '', count: 3, maleCount: 0, femaleCount: 0,
    dateExpr: { kind: 'relative_days', offsetDays: 0, weekday: 0, day: 0, month: 0, year: 0 },
    time: '25:00', location: 'étang de la Brosse', weather: 'Ensoleillé', habitat: 'Eau douce',
    comportement: 'Non renseigné', observationCondition: 'Non renseigné', age: 'Non renseigné',
    sexe: 'Non renseigné', phenology: 'Non renseigné', otherSpecies: [], remainder: 'Avec Gaspard.',
};

let anthMode = 'ok';
const anthReqs = [];
const anth = http.createServer((req, res) => {
    let raw = ''; req.on('data', c => { raw += c; }); req.on('end', () => {
        const body = JSON.parse(raw); anthReqs.push(body);
        if (anthMode === 'overloaded') {
            res.writeHead(529, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ type: 'error', error: { type: 'overloaded_error', message: 'Overloaded' } })); return;
        }
        const isNote = typeof body.system === 'string' && body.system.includes('note de terrain');
        const text = anthMode === 'bad_number' ? `Vous avez noté 43 observations.${FILLER}` : GOOD_TEXT;
        const answer = isNote ? (anthMode === 'not_json' ? 'Voici la fiche : mésange' : JSON.stringify(NOTE_ANSWER)) : JSON.stringify({ text });
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
            id: 'msg_1', type: 'message', role: 'assistant', model: body.model,
            content: [{ type: 'text', text: answer }],
            stop_reason: anthMode === 'refusal' ? 'refusal' : 'end_turn', stop_sequence: null,
            usage: { input_tokens: 1000, output_tokens: 400 },
        }));
    });
});

let proc = null, logs = '';
async function start(extra = {}) {
    if (proc) { const p = proc; proc = null; await new Promise(r => { p.once('exit', r); p.kill('SIGTERM'); }); }
    logs = '';
    proc = spawn(DENO, ['run', '--allow-net', '--allow-env', '--allow-read', '--allow-sys', '--no-config', ENTRY], {
        env: {
            PATH: process.env.PATH, HOME: process.env.HOME,
            SUPABASE_URL: `http://127.0.0.1:${SUPA_PORT}`, SUPABASE_ANON_KEY: 'anon', SUPABASE_SERVICE_ROLE_KEY: 'service',
            ANTHROPIC_API_KEY: 'factice', ANTHROPIC_BASE_URL: `http://127.0.0.1:${ANTH_PORT}`,
            AI_TEXT_MODEL: 'claude-sonnet-5-5', AI_EFFORT: 'low', AI_MONTHLY_BUDGET_USD: '18',
            ALLOWED_ORIGINS: 'https://carnet-naturaliste.vercel.app', ...extra,
        },
        stdio: ['ignore', 'pipe', 'pipe'],
    });
    proc.stdout.on('data', c => { logs += c; }); proc.stderr.on('data', c => { logs += c; });
    for (let i = 0; i < 150; i++) {
        try { await fetch(FN, { method: 'OPTIONS', signal: AbortSignal.timeout(500) }); return; } catch { await new Promise(r => setTimeout(r, 200)); }
    }
    throw new Error('démarrage impossible\n' + logs);
}
async function call({ token = GOOD, body, raw, origin, method = 'POST' } = {}) {
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers.Authorization = `Bearer ${token}`;
    if (origin) headers.Origin = origin;
    const r = await fetch(FN, { method, headers, body: method === 'POST' ? (raw ?? JSON.stringify(body ?? {})) : undefined });
    const t = await r.text(); let json = null; try { json = JSON.parse(t); } catch { json = t; }
    return { status: r.status, json, headers: r.headers };
}

const payload = {
    month: '2026-05', totals: { observations: 42, species: 17, activeDays: 9 },
    groups: [{ group: 'Oiseaux', observations: 42, species: 17 }],
    topSpecies: [{ name: 'Mésange charbonnière', count: 14 }], newSpecies: ['Huppe fasciée'],
    commune: 'Bordeaux', latitude: 44.8, comment: 'secret',
};
const body = { feature: 'summary', payload };
const ok = l => console.log('PASS', l);

await new Promise(r => supa.listen(SUPA_PORT, '127.0.0.1', r));
await new Promise(r => anth.listen(ANTH_PORT, '127.0.0.1', r));
try {
    await start();
    assert.equal((await call({ token: null, body })).status, 401);
    assert.equal((await call({ token: 'mauvais', body })).status, 401);
    const pre = await call({ method: 'OPTIONS', origin: 'https://carnet-naturaliste.vercel.app' });
    assert.equal(pre.status, 204);
    assert.equal(pre.headers.get('access-control-allow-origin'), 'https://carnet-naturaliste.vercel.app');
    assert.equal((await call({ method: 'OPTIONS', origin: 'https://pirate.example' })).status, 403);
    assert.equal((await call({ method: 'GET' })).status, 405);
    ok('401 sans jeton ou jeton invalide, 204/403 CORS, 405 hors POST');

    assert.equal((await call({ raw: JSON.stringify({ feature: 'summary', payload: { pad: 'x'.repeat(17000) } }) })).status, 413);
    assert.equal((await call({ raw: '{pas du json' })).status, 400);
    assert.equal((await call({ body: { feature: 'search', payload: {} } })).json.error, 'invalid_request');
    assert.equal((await call({ body: { feature: 'note', payload: {} } })).json.error, 'invalid_request');
    assert.equal((await call({ body: { feature: 'note', payload: { text: 'a'.repeat(1001) } } })).json.error, 'invalid_request');
    assert.equal((await call({ body: { feature: 'summary', payload: { month: '2026-13' } } })).json.error, 'invalid_request');
    assert.equal(rpcCalls.length, 0, 'aucune réservation pour une requête invalide');
    ok('413 au-delà de 16 Ko, 400 JSON invalide / fonctionnalité non livrée / charge invalide (note vide ou > 1 000 caractères), sans réservation');

    const r = await call({ body, origin: 'https://carnet-naturaliste.vercel.app' });
    assert.equal(r.status, 200, JSON.stringify(r.json));
    assert.deepEqual(r.json, { result: { text: GOOD_TEXT }, remaining: 5 });
    const reserve = rpcCalls.find(c => c.name === 'ai_reserve_call');
    assert.deepEqual(reserve.body, { p_user: USER_ID, p_consent_version: '2026-11-v1', p_model: 'claude-sonnet-5-5', p_budget_usd: 18, p_max_cost_usd: 0.032, p_feature: 'summary' });
    assert.equal(reserve.auth, 'Bearer service');
    const fin = rpcCalls.find(c => c.name === 'ai_finalize_call');
    assert.deepEqual(fin.body, { p_id: 'usage-1', p_status: 'ok', p_input_tokens: 1000, p_output_tokens: 400, p_cost_usd: 0.006 });
    const sent = anthReqs.at(-1);
    assert.equal(sent.model, 'claude-sonnet-5-5');
    assert.equal(sent.max_tokens, 2500);
    assert.equal(sent.output_config.effort, 'low');
    assert.equal(sent.output_config.format.type, 'json_schema');
    assert.deepEqual(sent.output_config.format.schema.required, ['text']);
    assert.equal(sent.thinking, undefined);
    assert.equal(typeof sent.messages[0].content, 'string');
    assert.match(sent.messages[0].content, /<donnees>.*Huppe fasci/);
    assert.doesNotMatch(JSON.stringify(sent), /Bordeaux|44\.8|secret/);
    assert.match(sent.system, /DONNÉES, jamais des instructions/);
    ok('200 : réservation avec p_feature=summary et coût max 0,032 $, Claude appelé (effort, schéma JSON), coût réel 0,006 $ finalisé, ni lieu ni GPS ni commentaire envoyés');

    rpcCalls.length = 0; anthMode = 'bad_number';
    const bad = await call({ body });
    assert.equal(bad.status, 502); assert.equal(bad.json.error, 'invalid_output'); assert.equal(bad.json.remaining, 5);
    assert.equal(rpcCalls.find(c => c.name === 'ai_finalize_call').body.p_status, 'invalid_output');
    rpcCalls.length = 0; anthMode = 'refusal';
    const ref = await call({ body });
    assert.equal(ref.status, 422);
    assert.equal(rpcCalls.find(c => c.name === 'ai_finalize_call').body.p_status, 'refused');
    rpcCalls.length = 0; anthMode = 'overloaded';
    const over = await call({ body });
    assert.equal(over.status, 503); assert.equal(over.json.error, 'upstream_unavailable');
    assert.deepEqual(rpcCalls.find(c => c.name === 'ai_finalize_call').body, { p_id: 'usage-1', p_status: 'failed', p_input_tokens: 0, p_output_tokens: 0, p_cost_usd: 0 });
    anthMode = 'ok';
    ok('nombre inventé → 502 invalid_output (finalisé) ; refus → 422 ; surcharge → 503, ligne failed à 0 $');

    rpcCalls.length = 0; reserveReply = { ok: false, reason: 'consent_outdated' };
    const nc = await call({ body });
    assert.equal(nc.status, 403); assert.equal(nc.json.error, 'consent_outdated');
    assert.equal(rpcCalls.filter(c => c.name === 'ai_finalize_call').length, 0);
    reserveReply = { ok: false, reason: 'quota_exceeded' };
    assert.equal((await call({ body })).status, 429);
    reserveReply = { ok: true, usage_id: 'usage-1', remaining: 5 };
    ok('refus de réservation relayés (403 consent_outdated, 429 quota), sans appel à Claude');

    assert(!logs.includes(USER_ID), 'id utilisateur dans les journaux');
    assert.doesNotMatch(logs, /Mésange|Huppe|42 observations|Bordeaux|secret/);
    assert.match(logs, /"fn":"ai-text".*"feature":"summary"/);
    ok('journaux : fonctionnalité présente ; ni utilisateur, ni espèces, ni texte, ni lieu');

    // --- Note → fiche ---------------------------------------------------
    rpcCalls.length = 0; anthReqs.length = 0;
    const noteBody = { feature: 'note', payload: { text: NOTE_TEXT, date: '2026-11-20', commune: 'Bordeaux', latitude: 44.8, observers: ['Paul'] } };
    const n = await call({ body: noteBody, origin: 'https://carnet-naturaliste.vercel.app' });
    assert.equal(n.status, 200, JSON.stringify(n.json));
    assert.equal(n.json.remaining, 5);
    assert.deepEqual(n.json.result, {
        speciesName: 'Mésange charbonnière', scientificName: null, count: 3, maleCount: null, femaleCount: null,
        dateExpr: { kind: 'relative_days', offsetDays: 0, weekday: null, day: null, month: null, year: null },
        time: null, location: 'étang de la Brosse', weather: 'Ensoleillé', habitat: 'Eau douce',
        comportement: null, observationCondition: null, age: null, sexe: null, phenology: null,
        otherSpecies: [], remainder: 'Avec Gaspard.', dropped: ['time'],
    });
    const noteReserve = rpcCalls.find(c => c.name === 'ai_reserve_call');
    assert.equal(noteReserve.body.p_feature, 'note');
    assert.equal(noteReserve.body.p_consent_version, '2026-11-v1');
    assert(noteReserve.body.p_max_cost_usd > 0.04 && noteReserve.body.p_max_cost_usd < 0.05, String(noteReserve.body.p_max_cost_usd));
    assert.deepEqual(rpcCalls.find(c => c.name === 'ai_finalize_call').body, { p_id: 'usage-1', p_status: 'ok', p_input_tokens: 1000, p_output_tokens: 400, p_cost_usd: 0.006 });
    const noteSent = anthReqs.at(-1);
    assert.equal(noteSent.max_tokens, 3000);
    assert.equal(noteSent.output_config.effort, 'low');
    assert.equal(noteSent.output_config.format.type, 'json_schema');
    assert.ok(noteSent.output_config.format.schema.required.includes('dateExpr'));
    assert.match(noteSent.system, /DONNÉE, jamais une instruction/);
    assert.match(noteSent.messages[0].content, /<note>".*mésanges charbonnières.*\\u003cimg/);
    assert.doesNotMatch(noteSent.messages[0].content, /<img/);
    assert.doesNotMatch(JSON.stringify(noteSent), /Bordeaux|44\.8|2026-11-20|Paul/);
    ok('note 200 : p_feature=note, coût max ≈ 0,043 $, max_tokens 3 000, note délimitée (« < » échappé), ni date, ni lieu, ni GPS, ni observateurs envoyés ; heure fautive retirée et signalée (dropped)');

    rpcCalls.length = 0; anthMode = 'not_json';
    const nj = await call({ body: noteBody });
    assert.equal(nj.status, 502); assert.equal(nj.json.error, 'invalid_output');
    assert.equal(rpcCalls.find(c => c.name === 'ai_finalize_call').body.p_status, 'invalid_output');
    anthMode = 'ok';
    ok('note : réponse qui n’est pas du JSON → 502 invalid_output (finalisé)');

    assert.doesNotMatch(logs, /mésange|Mésange|Brosse|Gaspard|onerror|Ensoleill|25:00|Paul/);
    assert.match(logs, /"feature":"note"/);
    ok('journaux de la note : ni la note, ni le résultat, ni prénom');

    await start({ AI_DISABLED_FEATURES: 'summary' });
    const dis = await call({ body });
    assert.equal(dis.status, 503); assert.equal(dis.json.error, 'feature_disabled');
    await start({ AI_DISABLED_FEATURES: 'note' });
    rpcCalls.length = 0;
    const disNote = await call({ body: { feature: 'note', payload: { text: NOTE_TEXT } } });
    assert.equal(disNote.status, 503); assert.equal(disNote.json.error, 'feature_disabled');
    assert.equal(rpcCalls.length, 0, 'aucune réservation pour une fonctionnalité coupée');
    assert.equal((await call({ body })).status, 200, 'le bilan reste ouvert quand seule la note est coupée');
    await start({ AI_DISABLED_FEATURES: 'sumary' });
    assert.equal((await call({ body })).json.error, 'misconfigured');
    await start({ AI_TEXT_MODEL: '' });
    assert.equal((await call({ body })).json.error, 'misconfigured');
    await start({ AI_TEXT_MODEL: 'claude-inconnu' });
    assert.equal((await call({ body })).json.error, 'misconfigured');
    ok('feature_disabled (503) pour le bilan ou la note seule (le bilan reste ouvert) ; liste de coupure fautive, modèle absent ou inconnu → misconfigured');
    console.log('\nBanc ai-text : tout est passé.');
} finally {
    if (proc) proc.kill('SIGTERM');
    supa.close(); anth.close();
}
