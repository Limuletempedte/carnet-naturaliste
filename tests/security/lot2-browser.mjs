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
const profile = await fs.mkdtemp(path.join(path.dirname(dist), 'lot2-browser-profile-'));
const launch = () => chromium.launchPersistentContext(profile, { headless: true, executablePath: process.env.CHROMIUM_EXECUTABLE,
    serviceWorkers: 'allow', viewport: { width: 1440, height: 1000 } });
let context = await launch();
const checks = [];
const passed = name => { checks.push(name); console.log(`PASS ${name}`); };
const uploaded = [];
try {
    const A = await account('A'), B = await account('B');
    const page = await context.newPage();
    page.on('pageerror', error => console.error('Erreur navigateur :', error.message));
    page.on('console', message => { if (message.type() === 'error') console.error('Console :', message.text()); });
    page.setDefaultTimeout(15000);
    const jpeg = Buffer.from(await page.evaluate(() => {
        const c = document.createElement('canvas'); c.width = c.height = 8;
        const ctx = c.getContext('2d'); ctx.fillStyle = '#008000'; ctx.fillRect(0, 0, 8, 8);
        return c.toDataURL('image/jpeg').split(',')[1];
    }), 'base64');
    const wav = Buffer.alloc(44 + 800);
    wav.write('RIFF'); wav.writeUInt32LE(wav.length - 8, 4); wav.write('WAVEfmt ', 8);
    wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22);
    wav.writeUInt32LE(8000, 24); wav.writeUInt32LE(8000, 28); wav.writeUInt16LE(1, 32); wav.writeUInt16LE(8, 34);
    wav.write('data', 36); wav.writeUInt32LE(800, 40); wav.fill(128, 44);
    for (const user of [A, B]) {
        for (const [folder, name, bytes, mime] of [['photos', 'historique.jpg', jpeg, 'image/jpeg'], ['sounds', 'historique.wav', wav, 'audio/wav']]) {
            const object = `${user.id}/${folder}/${name}`;
            const response = await fetch(`${api}/storage/v1/object/photos/${object}`, { method: 'POST', headers: {
                apikey: config.ANON_KEY, Authorization: `Bearer ${user.token}`, 'Content-Type': mime,
            }, body: bytes });
            assert(response.ok, `Upload propriétaire ${response.status}`); uploaded.push(object);
            user[folder === 'photos' ? 'photo' : 'sound'] = `${api}/storage/v1/object/public/photos/${object}`;
        }
        await request('PATCH', `/rest/v1/observations?id=eq.${user.row.id}`, user.token, { photo_url: user.photo, sound_url: user.sound });
    }
    const mediaPath = A.photo.replace('/public/', '/authenticated/');
    for (const [name, token, allowed] of [['propriétaire', A.token, true], ['autre compte', B.token, false], ['sans connexion', config.ANON_KEY, false]]) {
        const response = await fetch(mediaPath, { headers: { apikey: config.ANON_KEY, Authorization: `Bearer ${token}` } });
        assert.equal(response.ok, allowed, name);
    }
    assert.equal((await fetch(A.photo)).ok, false);
    assert.equal((await fetch(A.sound)).ok, false);
    passed('Serveur réel : propriétaire autorisé, B/anonyme et anciens liens publics refusés');
    const publicRequests = [];
    await context.route('**/*', route => {
        const url = new URL(route.request().url());
        if (url.pathname.startsWith('/storage/v1/object/public/')) publicRequests.push(url.pathname);
        return ['127.0.0.1', 'localhost'].includes(url.hostname) ? route.continue()
            : route.fulfill({ json: url.hostname === 'nominatim.openstreetmap.org' || url.pathname.endsWith('/suggest') ? [] : { results: [], features: [], query: { pages: {} } } });
    });
    await page.goto(base);
    await page.evaluate(async () => {
        localStorage.setItem('onboarding-seen-v1', 'true'); localStorage.setItem('storage_consent_accepted', '1');
        const old = await caches.open('supabase-storage-cache');
        await old.put('/ancienne-photo-fictive', new Response('secret fictif'));
    });
    await page.evaluate(async () => { await navigator.serviceWorker.ready; });
    await page.evaluate(async () => {
        const old = await caches.open('supabase-storage-cache'); await old.put('/ancienne-photo-fictive', new Response('secret fictif'));
        const registration = await navigator.serviceWorker.register('/sw.js', { scope: '/activation-test/' });
        const worker = registration.installing || registration.waiting || registration.active;
        if (worker.state !== 'activated') await new Promise(resolve => worker.addEventListener('statechange', () => { if (worker.state === 'activated') resolve(); }));
        if (await caches.has('supabase-storage-cache')) throw new Error('Ancien cache non purgé à activation');
        await registration.unregister();
    });
    passed('Activation du nouveau service worker : ancien cache partagé supprimé');
    // La transition d'identité purge aussi le cache d'un worker historique déjà actif.
    async function login(user) {
        await page.locator('#login-email').fill(user.email); await page.locator('#login-password').fill(user.password);
        await page.locator('form button[type=submit]').click();
        await page.getByRole('button', { name: `Voir l'observation de PRIVE_${user === A ? 'A' : 'B'}`, exact: true }).waitFor();
    }
    async function photoLoaded(label, target = page) {
        try {
            await target.waitForFunction(label => [...document.images].some(img => img.alt === label && img.src.startsWith('blob:') && img.complete && img.naturalWidth > 0), label, { timeout: 30000 });
        } catch (error) {
            console.error('État du laboratoire :', (await page.locator('body').innerText()).slice(0, 1200));
            throw error;
        }
    }
    await login(A); await photoLoaded('PRIVE_A');
    assert.equal(await page.evaluate(() => caches.has('supabase-storage-cache')), false);
    passed('Ancienne photo affichée en blob, ancien cache partagé purgé');
    async function seedCache(count, size) {
        await page.evaluate(async ({ owner, count, size }) => {
            await new Promise((resolve, reject) => {
                const req = indexedDB.open('cn-private-media-v1');
                req.onsuccess = () => {
                    const tx = req.result.transaction('media', 'readwrite'), store = tx.objectStore('media');
                    store.clear();
                    const blob = new Blob([new Uint8Array(size)], { type: 'image/jpeg' });
                    for (let i = 0; i < count; i++) store.put({ key: `seed-${i}`, owner, blob, size, created: Date.now(), accessed: Date.now() - count + i });
                    tx.oncomplete = () => { req.result.close(); resolve(); }; tx.onerror = () => reject(tx.error);
                };
            });
        }, { owner: A.id, count, size });
    }
    await seedCache(51, 1); await page.reload(); await photoLoaded('PRIVE_A');
    let entries = await cacheEntries();
    assert.equal(entries.length, 50); assert(!entries.some(entry => entry.key === 'seed-0')); assert(entries.some(entry => entry.key === 'seed-50'));
    passed('IndexedDB réel : plafond 50 et éviction des moins récemment utilisés');
    await seedCache(6, 20 * 1024 * 1024); await page.reload(); await photoLoaded('PRIVE_A');
    entries = await cacheEntries();
    assert(entries.reduce((sum, entry) => sum + entry.size, 0) <= 100 * 1024 * 1024);
    passed('IndexedDB réel : plafond de 100 Mio');
    await page.evaluate(() => new Promise(resolve => {
        const req = indexedDB.open('cn-private-media-v1'); req.onsuccess = () => {
            const tx = req.result.transaction('media', 'readwrite'), store = tx.objectStore('media'), read = store.getAll();
            read.onsuccess = () => read.result.forEach(entry => store.put({ ...entry, created: Date.now() - 31 * 24 * 60 * 60 * 1000 }));
            tx.oncomplete = () => { req.result.close(); resolve(); };
        };
    }));
    await page.reload(); await photoLoaded('PRIVE_A'); entries = await cacheEntries();
    assert(entries.every(entry => Date.now() - entry.created < 30 * 24 * 60 * 60 * 1000));
    passed('IndexedDB réel : médias de plus de 30 jours expirés');
    await page.getByRole('button', { name: "Voir l'observation de PRIVE_A", exact: true }).click();
    await page.waitForFunction(() => document.querySelector('audio')?.src.startsWith('blob:'));
    assert.equal(await page.locator('audio').evaluate(audio => audio.error?.code ?? null), null);
    passed('Photo et son privés dans la vue détail');
    await context.setOffline(true);
    await page.reload();
    await photoLoaded('PRIVE_A');
    passed('Rechargement PWA hors ligne : média disponible pour A');
    await context.setOffline(false);
    await page.getByRole('button', { name: 'Menu utilisateur' }).click();
    const downloaded = page.waitForEvent('download');
    await page.getByRole('menuitem', { name: 'Exporter mes données', exact: true }).click();
    const download = await downloaded;
    const zipPath = await download.path();
    const { default: JSZip } = await import('jszip');
    const zip = await JSZip.loadAsync(await fs.readFile(zipPath));
    assert.equal((await zip.file('images/historique.jpg').async('uint8array')).length, jpeg.length);
    assert.equal((await zip.file('sounds/historique.wav').async('uint8array')).length, wav.length);
    passed('Sauvegarde ZIP contient les octets des anciennes photo et son');
    async function cacheEntries() {
        return page.evaluate(() => new Promise((resolve, reject) => {
            const req = indexedDB.open('cn-private-media-v1');
            req.onsuccess = () => { const q = req.result.transaction('media').objectStore('media').getAll(); q.onsuccess = () => { resolve(q.result.map(({ key, size, owner, created }) => ({ key, size, owner, created }))); req.result.close(); }; };
            req.onerror = () => reject(req.error);
        }));
    }
    assert((await cacheEntries()).every(entry => entry.owner === A.id));
    const second = await context.newPage(); await second.goto(base); await photoLoaded('PRIVE_A', second);
    const blobUrl = await page.getByAltText('PRIVE_A', { exact: true }).first().getAttribute('src');
    const canRender = url => page.evaluate(url => new Promise(resolve => {
        const image = new Image(); image.onload = () => resolve(true); image.onerror = () => resolve(false); image.src = url;
    }), url);
    assert.equal(await canRender(blobUrl), true);
    await page.getByRole('button', { name: 'Menu utilisateur' }).click();
    await page.getByRole('menuitem', { name: 'Se déconnecter', exact: true }).click();
    await page.locator('#login-email').waitFor();
    await second.locator('#login-email').waitFor();
    await page.waitForFunction(() => new Promise(resolve => {
        const req = indexedDB.open('cn-private-media-v1'); req.onsuccess = () => {
            const q = req.result.transaction('media').objectStore('media').count(); q.onsuccess = () => { resolve(q.result === 0); req.result.close(); };
        };
    }));
    assert.equal(await canRender(blobUrl), false);
    await login(B); await photoLoaded('PRIVE_B');
    await photoLoaded('PRIVE_B', second);
    assert((await cacheEntries()).every(entry => entry.owner === B.id));
    await context.setOffline(true); await page.reload(); await photoLoaded('PRIVE_B');
    assert(!(await page.locator('body').innerText()).includes('PRIVE_A'));
    passed('Déconnexion entre onglets : cache A supprimé, blobs révoqués, B reste utilisable hors ligne');
    assert.deepEqual(publicRequests, []);
    passed('Aucune lecture directe des références publiques par le navigateur');
    console.log(JSON.stringify({ status: 'passed', checks, backend: 'Supabase local réel, bucket privé', serviceWorker: 'actif' }));
} finally {
    await context.close(); await fs.rm(profile, { recursive: true, force: true });
    if (uploaded.length) await request('DELETE', '/storage/v1/object/photos', null, { prefixes: uploaded });
    for (const user of accounts) await request('DELETE', `/auth/v1/admin/users/${user.id}`);
    server.closeAllConnections(); await new Promise(resolve => server.close(resolve));
}
