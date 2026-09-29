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
const profile = await fs.mkdtemp(path.join(path.dirname(dist), 'lot1-browser-profile-'));
const launch = () => chromium.launchPersistentContext(profile, { headless: true, executablePath: process.env.CHROMIUM_EXECUTABLE,
    serviceWorkers: 'block', viewport: { width: 1440, height: 1000 } });
let context = await launch();
const checks = [];
function passed(name) { checks.push(name); console.log(`PASS ${name}`); }
try {
    const A = await account('A'), B = await account('B');
    await context.addInitScript(() => localStorage.setItem('onboarding-seen-v1', 'true'));
    const routeExternal = route => {
        const url = new URL(route.request().url());
        const host = url.hostname;
        return ['127.0.0.1', 'localhost'].includes(host) ? route.continue()
            : route.fulfill({ json: host === 'nominatim.openstreetmap.org' || url.pathname.endsWith('/suggest') ? [] : { results: [], features: [], query: { pages: {} }, hourly: { time: [], weather_code: [] } } });
    };
    await context.route('**/*', routeExternal);
    const page = await context.newPage();
    page.on('pageerror', error => console.error('Erreur navigateur :', error.message));
    page.on('console', message => { if (message.type() === 'error') console.error('Console :', message.text()); });
    page.setDefaultTimeout(15000);
    await page.goto(base);
    async function login(target, user) {
        await target.locator('#login-email').fill(user.email);
        await target.locator('#login-password').fill(user.password);
        await target.locator('form button[type=submit]').click();
        await target.locator('#login-email').waitFor({ state: 'hidden' });
    }
    async function logout(target) {
        await target.getByRole('button', { name: 'Menu utilisateur' }).click();
        await target.getByRole('menuitem', { name: 'Se déconnecter', exact: true }).click();
    }
    const rowButton = (target, label) => target.getByRole('button', { name: `Voir l'observation de PRIVE_${label}`, exact: true });
    await login(page, A);
    await rowButton(page, 'A').waitFor();
    const understood = page.getByRole('button', { name: 'Compris', exact: true });
    if (await understood.isVisible()) await understood.click();
    await rowButton(page, 'A').click();
    await page.getByRole('button', { name: 'Modifier', exact: true }).click();
    await page.locator('#speciesName').waitFor();
    assert.equal(await page.locator('#speciesName').inputValue(), 'PRIVE_A');
    passed('A consulte et modifie sa propre observation');
    const second = await context.newPage();
    await second.goto(base);
    await rowButton(second, 'A').waitFor();
    await logout(page);
    await page.locator('#login-email').waitFor();
    await second.locator('#login-email').waitFor();
    passed('Déconnexion propagée au deuxième onglet');
    await login(page, B);
    for (const target of [page, second]) {
        await rowButton(target, 'B').waitFor();
        assert(!(await target.locator('body').innerText()).includes('PRIVE_A'));
        assert.equal(await target.locator('#speciesName').count(), 0);
        const cache = await target.evaluate(id => localStorage.getItem(`local_observations_cache:${id}`), B.id);
        assert(!cache?.includes('PRIVE_A'));
    }
    passed('B voit ses données sans formulaire ni cache de A dans deux onglets');
    await second.reload();
    await rowButton(second, 'B').waitFor();
    assert(!(await second.locator('body').innerText()).includes('PRIVE_A'));
    passed('Rechargement conserve uniquement le compte B');
    const forbidden = await request('GET', `/rest/v1/observations?id=eq.${A.row.id}`, B.token);
    assert.deepEqual(forbidden, []);
    const own = await request('GET', `/rest/v1/observations?id=eq.${B.row.id}`, B.token);
    assert.equal(own.length, 1);
    passed('Supabase réel refuse B → A et autorise B → B');
    await logout(page);
    await login(page, A);
    await rowButton(page, 'A').waitFor();
    await rowButton(second, 'A').waitFor();
    let release;
    const gate = new Promise(resolve => { release = resolve; });
    let arrived;
    const waiting = new Promise(resolve => { arrived = resolve; });
    const pattern = '**/rest/v1/observations?*';
    await page.route(pattern, async route => {
        const response = await route.fetch();
        arrived();
        await gate;
        await route.fulfill({ response }).catch(() => {}); // Requête annulée après déconnexion.
    }, { times: 1 });
    await page.reload({ waitUntil: 'domcontentloaded' });
    await Promise.race([waiting, new Promise((_, reject) => setTimeout(() => reject(new Error('Requête A non interceptée')), 15000))]);
    await logout(second);
    await login(second, B);
    release();
    await rowButton(page, 'B').waitFor();
    assert(!(await page.locator('body').innerText()).includes('PRIVE_A'));
    const cacheB = await page.evaluate(id => localStorage.getItem(`local_observations_cache:${id}`), B.id);
    assert(!cacheB?.includes('PRIVE_A'));
    passed('Réponse réseau A retardée après connexion B sans fuite');
    await page.unroute(pattern);
    await rowButton(page, 'B').click();
    await page.getByRole('button', { name: 'Modifier', exact: true }).click();
    await page.locator('#speciesName').fill('SAISIE_HORS_LIGNE_B');
    await context.setOffline(true);
    await page.getByRole('button', { name: 'Sauvegarder', exact: true }).last().click();
    await page.getByRole('button', { name: "Voir l'observation de SAISIE_HORS_LIGNE_B", exact: true }).waitFor();
    const warning = page.waitForEvent('dialog');
    const pendingLogout = logout(page);
    const dialog = await warning;
    assert(dialog.message().includes('non synchronisée'));
    await dialog.dismiss(); await pendingLogout;
    assert.equal(await page.getByRole('button', { name: 'Menu utilisateur' }).count(), 1);
    const queue = await page.evaluate(id => localStorage.getItem(`offline_sync_queue:${id}`), B.id);
    assert(queue?.includes('SAISIE_HORS_LIGNE_B'));
    passed('Saisie hors ligne conservée après annulation de la déconnexion');
    await context.setOffline(false);
    await context.close();
    context = await launch();
    await context.route('**/*', routeExternal);
    const restarted = await context.newPage();
    await restarted.goto(base);
    await restarted.getByRole('button', { name: "Voir l'observation de SAISIE_HORS_LIGNE_B", exact: true }).waitFor();
    assert(!(await restarted.locator('body').innerText()).includes('PRIVE_A'));
    passed('Redémarrage du navigateur : compte B et saisie conservés, aucune donnée de A');
    console.log(JSON.stringify({ status: 'passed', checks, backend: 'Supabase local réel', serviceWorker: 'bloqué : couverture spécifique au lot 2' }));
} finally {
    await context.close();
    await fs.rm(profile, { recursive: true, force: true });
    for (const user of accounts) await request('DELETE', `/auth/v1/admin/users/${user.id}`);
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
}
