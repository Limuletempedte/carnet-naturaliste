// Essai réel d'une fonctionnalité texte d'`ai-text` et choix du modèle
// (docs/ops/ASSISTANT-IA.md §6.3).
//
// Compare plusieurs modèles sur un jeu d'entrées, avec EXACTEMENT les prompts,
// le schéma de réponse, le plafond de sortie et la validation de la fonction
// (importés de supabase/functions/ai-text/logic.ts). L'appel part directement
// vers l'API Anthropic : ni Supabase, ni quota, ni consentement.
//
// ⚠️ Appels PAYANTS. À lancer avec la clé de l'espace d'ESSAI (plafond 2–5 $),
// jamais celle de la production. La clé est lue dans ANTHROPIC_API_KEY, depuis
// un fichier HORS du dépôt (--env-file), et n'est jamais affichée.
//
// Depuis la racine du dépôt (Deno ≥ 2) :
//   deno run --no-config --env-file="$HOME/.config/carnet-naturaliste/essai.env" \
//     --allow-env --allow-net=api.anthropic.com --allow-read --allow-write \
//     tests/security/ai-text-trial.mjs --feature summary \
//     --inputs tests/security/fixtures/ai-text-trial-summary.json \
//     --out "$HOME/essai-ai-text"
//
// Options :
//   --inputs a.json,b.json  plusieurs fichiers d'entrées [{ label, payload }]
//   --models a,b            défaut : tous les modèles de la table des prix
//   --effort low|medium     défaut : low
//   --max-usd 1             refuse de démarrer si le coût MAXIMUM le dépasse
//   --dry-run               valide les entrées et affiche le coût maximum,
//                           sans aucun appel (aucune clé nécessaire)
//   --base-url http://127.0.0.1:PORT
//                           faux serveur Anthropic LOCAL, pour vérifier le
//                           script sans rien payer : la clé n'est alors ni
//                           lue ni envoyée. Toute autre adresse est refusée.
//
// Sortie, dans --out (à garder hors du dépôt : les textes citent les espèces
// des entrées) : resultats.json (tout) et rapport.md (tableau + textes).

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import Anthropic from 'npm:@anthropic-ai/sdk@1.1.0';
import {
    ALLOWED_EFFORTS,
    MODEL_PRICES_USD_PER_MTOK,
    TEXT_FEATURES,
    classifyStopReason,
    computeCostUsd,
    maxCostUsd,
} from '../../supabase/functions/ai-text/logic.ts';

const TIMEOUT_MS = 50_000;
const LOOPBACK_HOSTS = ['127.0.0.1', 'localhost', '[::1]'];
// Valeur sans signification, envoyée au seul faux serveur local (--base-url).
const LOCAL_SERVER_PLACEHOLDER = 'faux-serveur-local';

function fail(message) {
    console.error(`Erreur : ${message}`);
    process.exit(1);
}

function parseArgs(argv) {
    const args = { dryRun: false };
    for (let i = 0; i < argv.length; i += 1) {
        const arg = argv[i];
        if (arg === '--dry-run') { args.dryRun = true; continue; }
        if (!arg.startsWith('--') || i + 1 >= argv.length) fail(`argument inattendu « ${arg} »`);
        args[arg.slice(2)] = argv[i + 1];
        i += 1;
    }
    return args;
}

function median(values) {
    if (values.length === 0) return 0;
    const sorted = [...values].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function mean(values) {
    return values.length === 0 ? 0 : values.reduce((sum, v) => sum + v, 0) / values.length;
}

function countWords(text) {
    return text.trim().split(/\s+/).filter(Boolean).length;
}

async function callModel(client, model, effort, feature, input, userPrompt) {
    const started = performance.now();
    let message;
    try {
        message = await client.messages.create({
            model,
            max_tokens: feature.maxOutputTokens,
            system: feature.systemPrompt,
            output_config: {
                effort,
                format: { type: 'json_schema', schema: feature.responseSchema },
            },
            messages: [{ role: 'user', content: userPrompt }],
        });
    } catch (err) {
        // Jamais le message d'erreur complet : seulement sa classe et son code.
        return {
            status: 'failed',
            seconds: (performance.now() - started) / 1000,
            error: err instanceof Anthropic.APIError ? `APIError ${err.status ?? '?'}` : (err?.constructor?.name ?? 'Error'),
            inputTokens: 0, outputTokens: 0, costUsd: 0, text: null, rawText: null,
        };
    }
    const seconds = (performance.now() - started) / 1000;
    const inputTokens = message.usage.input_tokens
        + (message.usage.cache_creation_input_tokens ?? 0)
        + (message.usage.cache_read_input_tokens ?? 0);
    const outputTokens = message.usage.output_tokens;
    const costUsd = computeCostUsd(model, message.usage);
    const outcome = classifyStopReason(message.stop_reason);
    const rawText = message.content.filter(block => block.type === 'text').map(block => block.text).join('');
    const base = { seconds, inputTokens, outputTokens, costUsd, stopReason: message.stop_reason, rawText };
    if (outcome !== 'ok') return { ...base, status: outcome, text: null };
    const parsed = feature.parseOutput(rawText, input);
    if (parsed === null) return { ...base, status: 'invalid_output', text: null };
    return { ...base, status: 'ok', text: typeof parsed.text === 'string' ? parsed.text : JSON.stringify(parsed) };
}

function buildReport({ featureName, effort, models, entries, results }) {
    const lines = [
        `# Essai ${featureName} — ${models.join(' contre ')} (effort ${effort})`,
        '',
        `${entries.length} entrées, ${results.length} appels.`,
        '',
        '| Modèle | Appels | OK | Sortie refusée par la validation | Refus du modèle | Échecs | Durée médiane | Tokens entrée (moy.) | Tokens sortie (moy.) | Mots (moy.) | Coût moyen | Coût total |',
        '|---|---|---|---|---|---|---|---|---|---|---|---|',
    ];
    for (const model of models) {
        const rows = results.filter(r => r.model === model);
        const ok = rows.filter(r => r.status === 'ok');
        const billed = rows.filter(r => r.status !== 'failed');
        lines.push([
            '', model, rows.length, ok.length,
            rows.filter(r => r.status === 'invalid_output').length,
            rows.filter(r => r.status === 'refused').length,
            rows.filter(r => r.status === 'failed').length,
            `${median(billed.map(r => r.seconds)).toFixed(1)} s`,
            Math.round(mean(billed.map(r => r.inputTokens))),
            Math.round(mean(billed.map(r => r.outputTokens))),
            Math.round(mean(ok.map(r => countWords(r.text)))),
            `${mean(billed.map(r => r.costUsd)).toFixed(5)} $`,
            `${rows.reduce((sum, r) => sum + r.costUsd, 0).toFixed(4)} $`,
            '',
        ].join(' | ').trim());
    }
    for (const entry of entries) {
        lines.push('', `## ${entry.label}`, '');
        if (!entry.valid) {
            lines.push('_Entrée refusée par la validation de la fonction : aucun appel._');
            continue;
        }
        for (const model of models) {
            const r = results.find(x => x.label === entry.label && x.model === model);
            if (!r) continue;
            lines.push(`**${model}** — ${r.status}, ${r.seconds.toFixed(1)} s, ${r.inputTokens} + ${r.outputTokens} tokens, ${r.costUsd.toFixed(5)} $${r.text ? `, ${countWords(r.text)} mots` : ''}`, '');
            if (r.status === 'ok') lines.push(r.text);
            else if (r.status === 'failed') lines.push(`_Appel échoué : ${r.error}._`);
            else lines.push(`_Sortie non retenue (${r.status}, stop_reason ${r.stopReason}). Texte brut :_`, '', '```', r.rawText ?? '', '```');
            lines.push('');
        }
    }
    return `${lines.join('\n')}\n`;
}

async function main() {
    const args = parseArgs(process.argv.slice(2));
    const featureName = args.feature ?? 'summary';
    const feature = TEXT_FEATURES[featureName];
    if (!feature) fail(`fonctionnalité inconnue ou pas encore livrée : « ${featureName} »`);
    if (!args.inputs) fail('--inputs manquant');
    const effort = args.effort ?? 'low';
    if (!ALLOWED_EFFORTS.includes(effort)) fail(`effort invalide : « ${effort} »`);
    const models = (args.models ?? Object.keys(MODEL_PRICES_USD_PER_MTOK).join(',')).split(',').map(m => m.trim()).filter(Boolean);
    for (const model of models) {
        if (!Object.prototype.hasOwnProperty.call(MODEL_PRICES_USD_PER_MTOK, model)) fail(`modèle sans prix connu : « ${model} »`);
    }
    const maxUsd = Number(args['max-usd'] ?? '1');
    if (!Number.isFinite(maxUsd) || maxUsd <= 0) fail('--max-usd invalide');

    // Entrées : validées par la fonction elle-même.
    const entries = [];
    for (const file of args.inputs.split(',').map(f => f.trim()).filter(Boolean)) {
        const list = JSON.parse(fs.readFileSync(file, 'utf8'));
        if (!Array.isArray(list)) fail(`${file} : un tableau [{ label, payload }] est attendu`);
        for (const item of list) {
            if (typeof item?.label !== 'string') fail(`${file} : entrée sans « label »`);
            if (entries.some(e => e.label === item.label)) fail(`label en double : « ${item.label} »`);
            const validation = feature.validate(item.payload);
            entries.push(validation.ok
                ? { label: item.label, valid: true, input: validation.value, userPrompt: feature.buildUserPrompt(validation.value) }
                : { label: item.label, valid: false });
        }
    }
    const valid = entries.filter(e => e.valid);
    const maxCost = valid.reduce((sum, e) => sum + models.reduce((s, m) => s + maxCostUsd(m, feature, e.userPrompt), 0), 0);
    console.log(`${entries.length} entrées (${entries.length - valid.length} refusées par la validation), ${models.length} modèles, effort ${effort}.`);
    console.log(`Appels prévus : ${valid.length * models.length}. Coût MAXIMUM : ${maxCost.toFixed(2)} $ (plafond --max-usd : ${maxUsd} $).`);
    for (const e of entries.filter(x => !x.valid)) console.log(`  refusée par la validation : ${e.label}`);
    if (args.dryRun) {
        console.log('Essai à blanc : aucun appel envoyé.');
        return;
    }
    if (maxCost > maxUsd) fail('le coût maximum dépasse --max-usd : rien n\'a été envoyé.');
    if (!args.out) fail('--out manquant (dossier de sortie, hors du dépôt)');
    // L'adresse est toujours fixée ici : une variable ANTHROPIC_BASE_URL traînant
    // dans l'environnement ne peut pas détourner la vraie clé.
    let baseURL = 'https://api.anthropic.com';
    const localUrl = args['base-url'];
    if (localUrl) {
        if (!LOOPBACK_HOSTS.includes(new URL(localUrl).hostname)) fail('--base-url : adresse locale uniquement (faux serveur de test).');
        baseURL = localUrl;
        console.log(`Faux serveur local ${baseURL} : aucune clé lue, aucun appel payant.`);
    }
    // Avec un faux serveur local, la vraie clé n'est ni lue ni envoyée.
    const credential = localUrl ? LOCAL_SERVER_PLACEHOLDER : process.env.ANTHROPIC_API_KEY;
    if (!credential) fail('ANTHROPIC_API_KEY absente : la fournir par --env-file (clé de l\'espace d\'ESSAI).');

    const client = new Anthropic({ apiKey: credential, baseURL, timeout: TIMEOUT_MS, maxRetries: 0 });
    const results = [];
    for (const [index, entry] of valid.entries()) {
        // Les modèles en parallèle, les entrées une par une : charge légère.
        const batch = await Promise.all(models.map(async model => ({
            label: entry.label,
            model,
            ...(await callModel(client, model, effort, feature, entry.input, entry.userPrompt)),
        })));
        results.push(...batch);
        console.log(`[${index + 1}/${valid.length}] ${entry.label} : ${batch.map(r => `${r.model} ${r.status}`).join(', ')}`);
    }

    fs.mkdirSync(args.out, { recursive: true });
    fs.writeFileSync(path.join(args.out, 'resultats.json'), `${JSON.stringify({ feature: featureName, effort, models, results }, null, 2)}\n`);
    fs.writeFileSync(path.join(args.out, 'rapport.md'), buildReport({ featureName, effort, models, entries, results }));
    const total = results.reduce((sum, r) => sum + r.costUsd, 0);
    console.log(`Terminé. Coût réel : ${total.toFixed(4)} $. Rapport : ${path.join(args.out, 'rapport.md')}`);
}

await main();
