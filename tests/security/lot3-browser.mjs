// Test d'intégration local uniquement : vrai bundle React et véritable Supabase.
// LOCAL_STATUS_FILE : JSON produit par `supabase status -o json` (jamais versionné).
// AUDIT_BUILD_DIR : bundle compilé avec les clés publiques du laboratoire.
// PLAYWRIGHT_MODULE / CHROMIUM_EXECUTABLE : facultatifs selon l'installation.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

const config = JSON.parse(await fs.readFile(process.env.LOCAL_STATUS_FILE, 'utf8'));
const api = config.API_URL;
assert(['localhost', '127.0.0.1', '::1'].includes(new URL(api).hostname), 'Laboratoire local obligatoire');
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const dist = path.resolve(process.env.AUDIT_BUILD_DIR || 'dist');
const headers = JSON.parse(await fs.readFile('vercel.json', 'utf8')).headers[0].headers;
const server = http.createServer(async (req, res) => {
    const requested = path.resolve(dist, '.' + new URL(req.url, 'http://localhost').pathname);
    if (!requested.startsWith(dist + path.sep) && requested !== dist) { res.writeHead(403).end(); return; }
    let file = requested;
    try { if (!(await fs.stat(file)).isFile()) file = path.join(dist, 'index.html'); }
    catch { file = path.join(dist, 'index.html'); }
    for (const h of headers) res.setHeader(h.key, h.key === 'Content-Security-Policy'
        ? h.value.replace("connect-src 'self'", `connect-src 'self' ${api}`) : h.value);
    const mime = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2' };
    res.setHeader('Content-Type', mime[path.extname(file)] || 'application/octet-stream');
    res.end(await fs.readFile(file));
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const base = `http://127.0.0.1:${server.address().port}`;
const accounts = [];
async function request(method, endpoint, token, body) {
    const response = await fetch(api + endpoint, { method, signal: AbortSignal.timeout(15000), headers: {
        apikey: config.ANON_KEY, Authorization: `Bearer ${token || config.SERVICE_ROLE_KEY}`,
        'Content-Type': 'application/json', Prefer: 'return=representation',
    }, body: body === undefined ? undefined : JSON.stringify(body) });
    assert(response.ok, `API ${method} ${endpoint.split('?')[0]} : ${response.status}`);
    return response.status === 204 ? null : response.json();
}
async function account(label) {
    const email = `security-${randomUUID()}@example.test`, password = `Test-${randomUUID()}!`;
    const user = await request('POST', '/auth/v1/admin/users', null, { email, password, email_confirm: true });
    const auth = await request('POST', '/auth/v1/token?grant_type=password', config.ANON_KEY, { email, password });
    const row = { id: randomUUID(), user_id: user.id, species_name: `PRIVE_${label}`, date: '2026-09-19', taxonomic_group: 'Oiseaux', count: 1,
        location: 'Bois fictif', gps_lat: 48.1, gps_lon: 2.1, comment: `SECRET_FICTIF_${label}`, status: 'NE', protocol: 'Opportuniste',
        latin_name: '', time: '10:00', municipality: '', department: '', country: 'France', atlas_code: '',
        sexe: 'Non renseigné', age: 'Non renseigné', observation_condition: 'Non renseigné', comportement: 'Non renseigné', weather_condition: 'Non renseigné' };
    await request('POST', '/rest/v1/observations', auth.access_token, row);
    const value = { id: user.id, email, password, token: auth.access_token, row };
    accounts.push(value); return value;
}
const profile = await fs.mkdtemp(path.join(path.dirname(dist), 'lot3-browser-profile-'));
const launch = () => chromium.launchPersistentContext(profile, { headless: true, executablePath: process.env.CHROMIUM_EXECUTABLE,
    serviceWorkers: 'allow', viewport: { width: 1440, height: 1000 } });
let context = await launch();
const checks = []; const passed = name => { checks.push(name); console.log(`PASS ${name}`); };
const uploaded = [];
try {
    const A = await account('A');
    await context.route('**/*', route => ['127.0.0.1', 'localhost'].includes(new URL(route.request().url()).hostname)
        ? route.continue() : route.fulfill({ json: { results: [], features: [], query: { pages: {} } } }));
    let page = await context.newPage(); page.setDefaultTimeout(15000);
    await page.addInitScript(() => {
        const NativeWorker = window.Worker;
        window.Worker = class extends NativeWorker {
            constructor(url, options) {
                const target = new URL(url, location.href);
                if (window.__stallImport && target.pathname.includes('importWorker-')) target.searchParams.set('fixture', 'stall');
                super(target, options);
            }
        };
    });
    await page.goto(base);
    await page.evaluate(() => { localStorage.setItem('onboarding-seen-v1', 'true'); localStorage.setItem('storage_consent_accepted', '1'); });
    await page.locator('#login-email').fill(A.email); await page.locator('#login-password').fill(A.password);
    await page.locator('form button[type=submit]').click();
    await page.getByRole('button', { name: "Voir l'observation de PRIVE_A", exact: true }).waitFor();
    await page.evaluate(async () => { await navigator.serviceWorker.ready; });
    const input = () => page.locator('input[type=file][accept=".json,.xlsx,.xls,.zip"]').first();
    const row = { id: randomUUID(), speciesName: 'IMPORT_FICTIF', latinName: '', taxonomicGroup: 'Oiseaux', date: '2026-09-19', time: '10:00', count: 1,
        location: 'Bois fictif', gps: { lat: 48.1, lon: 2.1 }, municipality: '', department: '', country: 'France', altitude: null,
        comment: '', status: 'NE', atlasCode: '', protocol: 'Opportuniste', sexe: 'Non renseigné', age: 'Non renseigné', observationCondition: 'Non renseigné', comportement: 'Non renseigné', weather: 'Non renseigné' };
    let workerCount = 0; const active = new Set();
    page.on('worker', worker => { workerCount++; active.add(worker); worker.on('close', () => active.delete(worker)); });
    async function workersClosed() {
        for (let i = 0; active.size && i < 40; i++) await new Promise(resolve => setTimeout(resolve, 50));
        assert.equal(active.size, 0);
    }
    await input().setInputFiles({ name: 'valide.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify([row])) });
    await page.getByRole('button', { name: "Confirmer l'import", exact: true }).waitFor();
    assert(workerCount > 0);
    assert.equal((await request('GET', `/rest/v1/observations?id=eq.${row.id}`, A.token)).length, 0);
    await page.getByRole('button', { name: 'Annuler', exact: true }).click();
    passed('JSON analysé dans un véritable Worker, prévisualisation sans écriture et annulation');
    await input().setInputFiles({ name: 'gros.json', mimeType: 'application/json', buffer: Buffer.alloc(15 * 1024 * 1024 + 1) });
    await page.getByText('Fichier trop volumineux.', { exact: true }).waitFor();
    assert.equal(workerCount, 1);
    passed('JSON trop volumineux refusé avant création du Worker');
    const { default: JSZip } = await import('jszip');
    const bomb = new JSZip(); bomb.file('data.json', '[]'); bomb.file('images/bombe.jpg', Buffer.alloc(20 * 1024 * 1024 + 1));
    await input().setInputFiles({ name: 'bombe.zip', mimeType: 'application/zip', buffer: await bomb.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' }) });
    await page.getByText('Entrée décompressée trop volumineuse.', { exact: true }).waitFor();
    passed('ZIP piégé refusé sans prévisualisation partielle');
    const { default: ExcelJS } = await import('exceljs');
    const workbook = new ExcelJS.Workbook(); const sheet = workbook.addWorksheet('Observations');
    sheet.addRow(["Nom de l'espèce", 'Date']); sheet.addRow(['EXCEL_FICTIF', '2026-09-19']);
    await input().setInputFiles({ name: 'valide.xlsx', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', buffer: Buffer.from(await workbook.xlsx.writeBuffer()) });
    await page.getByRole('button', { name: "Confirmer l'import", exact: true }).waitFor();
    await page.getByRole('button', { name: 'Annuler', exact: true }).click();
    passed('Excel légitime accepté après précontrôle');
    // Un Worker volontairement bloqué simule un parseur pathologique : le thread principal doit rester vivant.
    await page.route('**/assets/importWorker-*.js?fixture=stall', route => route.fulfill({ contentType: 'application/javascript', body: 'while (true) {}' }));
    await page.evaluate(() => { window.__stallImport = true; });
    await page.evaluate(() => { window.__importTicks = 0; window.__importTimer = setInterval(() => window.__importTicks++, 50); });
    await input().setInputFiles({ name: 'timeout.json', mimeType: 'application/json', buffer: Buffer.from('[]') });
    await page.getByText('Analyse interrompue après 30 secondes. Réduisez la taille du fichier.', { exact: true }).waitFor({ timeout: 35000 });
    assert((await page.evaluate(() => window.__importTicks)) > 100);
    await page.evaluate(() => clearInterval(window.__importTimer));
    await workersClosed();
    passed('Worker réellement bloqué terminé après 30 secondes, interface restée réactive');
    await input().setInputFiles({ name: 'annuler.json', mimeType: 'application/json', buffer: Buffer.from('[]') });
    await page.getByRole('button', { name: 'Annuler analyse', exact: true }).first().click();
    await page.getByText('Analyse annulée.', { exact: true }).waitFor();
    await workersClosed();
    passed('Annulation utilisateur termine le Worker');
    await page.unroute('**/assets/importWorker-*.js?fixture=stall');
    await page.evaluate(() => { window.__stallImport = false; });
    const jpeg = Buffer.from(await page.evaluate(() => { const c = document.createElement('canvas'); c.width = c.height = 8; return c.toDataURL('image/jpeg').split(',')[1]; }), 'base64');
    const zip = new JSZip(); row.photo = `${api}/storage/v1/object/public/photos/${A.id}/photos/ancienne.jpg`;
    zip.file('data.json', JSON.stringify([row])); zip.file('images/ancienne.jpg', jpeg);
    await input().setInputFiles({ name: 'restauration.zip', mimeType: 'application/zip', buffer: await zip.generateAsync({ type: 'nodebuffer' }) });
    await page.getByRole('button', { name: "Confirmer l'import", exact: true }).waitFor();
    await context.setOffline(true);
    await page.getByRole('button', { name: "Confirmer l'import", exact: true }).click();
    await page.getByRole('button', { name: "Voir l'observation de IMPORT_FICTIF", exact: true }).waitFor();
    const photo = () => page.waitForFunction(() => [...document.images].some(i => i.alt === 'IMPORT_FICTIF' && i.src.startsWith('blob:') && i.naturalWidth > 0));
    await photo(); await page.reload(); await photo();
    const queued = await page.evaluate(id => localStorage.getItem(`offline_sync_queue:${id}`), A.id);
    assert(queued.includes('pending-media:')); assert(!queued.includes('blob:')); assert(!queued.includes('base64,'));
    passed('ZIP restauré hors ligne : Blob durable, photo visible après rechargement, aucune base64 dans la file');
    await context.setOffline(false);
    let stored;
    for (let i = 0; i < 40; i++) {
        const rows = await request('GET', `/rest/v1/observations?id=eq.${row.id}`, A.token);
        if (rows[0]?.photo_url?.startsWith(api)) { stored = rows[0]; break; }
        await new Promise(resolve => setTimeout(resolve, 250));
    }
    assert(stored, 'Observation importée synchronisée sur Supabase réel');
    const object = stored.photo_url.split('/storage/v1/object/public/photos/')[1]; uploaded.push(object);
    const media = await fetch(`${api}/storage/v1/object/authenticated/photos/${object}`, { headers: { apikey: config.ANON_KEY, Authorization: `Bearer ${A.token}` } });
    assert(media.ok); assert.equal((await media.arrayBuffer()).byteLength, jpeg.length);
    passed('Retour en ligne : observation et ancienne photo synchronisées vers Supabase réel');
    console.log(JSON.stringify({ status: 'passed', checks }));
} finally {
    await context.close(); await fs.rm(profile, { recursive: true, force: true });
    if (uploaded.length) await request('DELETE', '/storage/v1/object/photos', null, { prefixes: uploaded });
    for (const user of accounts) await request('DELETE', `/auth/v1/admin/users/${user.id}`);
    server.closeAllConnections(); await new Promise(resolve => server.close(resolve));
}
