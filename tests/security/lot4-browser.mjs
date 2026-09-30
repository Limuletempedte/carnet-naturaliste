// Laboratoire exclusivement local : GoTrue réel, fournisseur CAPTCHA HTTPS simulé.
// Préparation et variables : docs/audits/v5/CORRECTIONS-LOT4.md.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { captchaWidgetScript } from './fixtures/turnstile-widget.mjs';

const config = JSON.parse(await fs.readFile(process.env.LOCAL_STATUS_FILE, 'utf8'));
assert.equal(new URL(config.API_URL).hostname, '127.0.0.1');
const main = 'http://127.0.0.1:54321';
const auth = 'http://127.0.0.1:55432';
const api = 'http://127.0.0.1:55431';
const base = 'http://127.0.0.1:55430';
const dist = path.resolve(process.env.AUDIT_BUILD_DIR || 'dist');
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const checks = []; const accounts = new Set();
const passed = label => { checks.push(label); console.log(`PASS ${label}`); };
const valid = () => `valid-${randomUUID()}`;

async function request(endpoint, body, { token = config.ANON_KEY, method = 'POST', origin = auth } = {}) {
    const res = await fetch(origin + endpoint, { method, signal: AbortSignal.timeout(15000),
        headers: { apikey: config.ANON_KEY, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body) });
    const json = await res.json().catch(() => ({}));
    return { status: res.status, json };
}
async function createOldAccount() {
    const email = `lot4-${randomUUID()}@example.test`, password = 'ancien7';
    const r = await request('/auth/v1/admin/users', { email, password, email_confirm: true }, { origin: main, token: config.SERVICE_ROLE_KEY });
    assert.equal(r.status, 200); accounts.add(r.json.id);
    return { email, password, id: r.json.id };
}

// Le proxy conserve les vrais contrôles Auth ; aucune réponse d'authentification simulée.
const proxy = http.createServer((req, res) => {
    const isAuth = req.url.startsWith('/auth/v1/');
    const target = new URL(isAuth ? req.url.slice('/auth/v1'.length) : req.url, isAuth ? auth : main);
    const upstream = http.request(target, { method: req.method, headers: { ...req.headers, host: target.host } }, response => {
        res.writeHead(response.statusCode, response.headers); response.pipe(res);
    });
    upstream.on('error', () => res.writeHead(502).end());
    req.pipe(upstream);
});
const headers = JSON.parse(await fs.readFile('vercel.json', 'utf8')).headers[0].headers;
const server = http.createServer(async (req, res) => {
    const requested = path.resolve(dist, '.' + new URL(req.url, base).pathname);
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

let browser;
async function newPage({ failScript = false } = {}) {
    const context = await browser.newContext({ serviceWorkers: 'allow', viewport: { width: 1440, height: 1000 } });
    let failed = false;
    await context.route('**/*', route => {
        const url = new URL(route.request().url());
        if (url.hostname === '127.0.0.1') return route.continue();
        if (url.hostname === 'challenges.cloudflare.com' && url.pathname.endsWith('/api.js')) {
            if (failScript && !failed) { failed = true; return route.abort(); }
            return route.fulfill({ contentType: 'application/javascript', body: captchaWidgetScript });
        }
        if (url.hostname === 'challenges.cloudflare.com' && url.pathname === '/test-frame') return route.fulfill({ contentType: 'text/html', body: '<p>Cadre de test local</p>' });
        return route.fulfill({ json: { results: [], features: [], query: { pages: {} } } });
    });
    await context.addInitScript(() => {
        localStorage.setItem('onboarding-seen-v1', 'true'); localStorage.setItem('storage_consent_accepted', '1');
        window.fixtureCspErrors = [];
        document.addEventListener('securitypolicyviolation', e => { window.fixtureCspErrors.push(e.blockedURI); });
    });
    const page = await context.newPage(); page.setDefaultTimeout(15000); await page.goto(base);
    await page.locator('#login-email').waitFor();
    return page;
}
async function verify(page) { await page.getByRole('button', { name: 'Valider le CAPTCHA de test' }).click(); }
async function fillLogin(page, user) { await page.locator('#login-email').fill(user.email); await page.locator('#login-password').fill(user.password); }

try {
    await new Promise(resolve => proxy.listen(55431, '127.0.0.1', resolve));
    await new Promise(resolve => server.listen(55430, '127.0.0.1', resolve));
    const old = await createOldAccount();
    for (const endpoint of ['/token?grant_type=password', '/signup', '/recover']) {
        for (const token of [undefined, 'invalid-local-token']) {
            const r = await request(endpoint, { email: old.email, password: old.password,
                ...(token ? { gotrue_meta_security: { captcha_token: token } } : {}) });
            assert.equal(r.status, 400, `${endpoint} doit refuser le CAPTCHA absent/invalide`);
            assert.equal(r.json.error_code, 'captcha_failed');
        }
    }
    passed('GoTrue réel refuse CAPTCHA absent/invalide sur connexion, inscription et récupération');

    const token = valid();
    const login = await request('/token?grant_type=password', { ...old, gotrue_meta_security: { captcha_token: token } });
    assert.equal(login.status, 200); assert(login.json.access_token);
    const replay = await request('/token?grant_type=password', { ...old, gotrue_meta_security: { captcha_token: token } });
    assert.equal(replay.json.error_code, 'captcha_failed');
    passed('CAPTCHA valide accepté, jeton déjà utilisé refusé, ancien mot de passe court accepté');

    const signupEmail = `lot4-${randomUUID()}@example.test`;
    const weak = await request('/signup', { email: signupEmail, password: '12345678901', gotrue_meta_security: { captcha_token: valid() } });
    assert.equal(weak.status, 422); assert.equal(weak.json.error_code, 'weak_password');
    const strong = await request('/signup', { email: signupEmail, password: '123456789012', gotrue_meta_security: { captcha_token: valid() } });
    assert.equal(strong.status, 200); accounts.add(strong.json.user?.id || strong.json.id);
    const weakReset = await request('/user', { password: '12345678901' }, { method: 'PUT', token: login.json.access_token });
    assert.equal(weakReset.status, 422); assert.equal(weakReset.json.error_code, 'weak_password');
    passed('Serveur : minimum12 effectif pour inscription et mise à jour du mot de passe');

    browser = await chromium.launch({ headless: true, executablePath: process.env.CHROMIUM_EXECUTABLE });
    const page = await newPage({ failScript: true });
    const submit = () => page.locator('form button[type=submit]');
    await page.getByText('Réessayer la vérification').waitFor();
    await page.waitForFunction(() => document.querySelector('form button[type=submit]')?.disabled === true);
    await page.getByText('Réessayer la vérification').click();
    await verify(page); await page.waitForFunction(() => document.querySelector('form button[type=submit]')?.disabled === false);
    await page.evaluate(() => window.fixtureCaptcha['expired-callback']());
    await page.waitForFunction(() => document.querySelector('form button[type=submit]')?.disabled === true);
    await page.getByText('Réessayer la vérification').click(); await verify(page);
    await page.evaluate(() => window.fixtureCaptcha['error-callback']());
    await page.waitForFunction(() => document.querySelector('form button[type=submit]')?.disabled === true);
    await page.getByText('Réessayer la vérification').click(); await verify(page);
    await page.getByText('Mot de passe oublié ?').click(); await page.waitForFunction(() => document.querySelector('form button[type=submit]')?.disabled === true);
    await page.getByText('Retour à la connexion').click(); await page.waitForFunction(() => document.querySelector('form button[type=submit]')?.disabled === true);
    passed('Navigateur : échec de chargement, expiration, erreur et changement de formulaire bloquent sans contournement');

    await fillLogin(page, { ...old, password: 'incorrect' }); await verify(page); await submit().click();
    await page.getByText('Email ou mot de passe incorrect.').waitFor(); await page.waitForFunction(() => document.querySelector('form button[type=submit]')?.disabled === true);
    await fillLogin(page, old); await verify(page); await submit().click();
    await page.locator('#login-email').waitFor({ state: 'detached' });
    await page.getByRole('button', { name: '+ Observation', exact: true }).waitFor();
    assert.deepEqual(await page.evaluate(() => window.fixtureCspErrors.filter(url => url.includes('challenges.cloudflare.com'))), []);
    await page.reload(); await page.getByRole('button', { name: '+ Observation', exact: true }).waitFor();
    passed('Connexion réelle depuis le frontend, nouvelle tentative, ancien mot de passe et session après rechargement');

    const signup = await newPage();
    await signup.getByRole('button', { name: "S'inscrire", exact: true }).click();
    await signup.locator('#login-email').fill(`lot4-${randomUUID()}@example.test`);
    await signup.locator('#login-password').fill('12345678901');
    await signup.getByRole('checkbox').check(); await verify(signup);
    await signup.locator('form button[type=submit]').click();
    await signup.getByText('Le mot de passe doit contenir au moins 12 caractères.').waitFor();
    await signup.locator('#login-password').fill('Douze-minimum!');
    const registration = signup.waitForResponse(r => r.url().includes('/auth/v1/signup') && r.request().method() === 'POST');
    await signup.locator('form button[type=submit]').click();
    const response = await registration; const registrationData = await response.json();
    assert.equal(response.status(), 200); accounts.add(registrationData.user?.id || registrationData.id);
    passed('Inscription depuis le navigateur : consentement, minimum12 et CAPTCHA transmis au vrai serveur');

    const recovery = await newPage();
    await recovery.getByText('Mot de passe oublié ?').click();
    await recovery.locator('#forgot-email').fill(old.email); await verify(recovery);
    const send = recovery.waitForResponse(r => r.url().includes('/auth/v1/recover') && r.request().method() === 'POST');
    await recovery.getByText('Envoyer le lien', { exact: true }).click(); assert.equal((await send).status(), 200);
    await recovery.getByText(/Si un compte existe pour cet email/).waitFor();
    let mail;
    for (let i = 0; i < 30; i++) {
        const inbox = await (await fetch('http://127.0.0.1:54324/api/v1/messages')).json();
        const message = inbox.messages.find(m => m.To.some(to => to.Address === old.email));
        if (message) {
            mail = await (await fetch(`http://127.0.0.1:54324/api/v1/message/${message.ID}`)).json(); break;
        }
        await new Promise(resolve => setTimeout(resolve, 100));
    }
    assert(mail, 'Email de récupération local reçu');
    const content = (mail.HTML || mail.Text).replaceAll('&amp;', '&');
    const link = content.match(/http:\/\/127\.0\.0\.1:55431\/auth\/v1\/verify[^\s"<>]+/)?.[0];
    assert(link, 'Lien de récupération dirigé uniquement vers le labo');
    await recovery.goto(link);
    await recovery.locator('#reset-password').waitFor();
    for (const value of ['12345678901', 'Nouveau-test12!']) {
        await recovery.locator('#reset-password').fill(value); await recovery.locator('#reset-password-confirm').fill(value);
        await recovery.getByText('Mettre à jour le mot de passe', { exact: true }).click();
        if (value.length === 11) await recovery.getByText('Le mot de passe doit contenir au moins 12 caractères.').waitFor();
    }
    await recovery.getByRole('button', { name: '+ Observation', exact: true }).waitFor();
    const recovered = await request('/token?grant_type=password', { email: old.email, password: 'Nouveau-test12!', gotrue_meta_security: { captcha_token: valid() } });
    assert.equal(recovered.status, 200);
    passed('Récupération complète : email local réel, lien, écran de réinitialisation, minimum12 et reconnexion');
    console.log(`RESULT ${checks.length} contrôles réussis. Aucun appel de test vers un fournisseur externe.`);
} finally {
    await browser?.close();
    for (const id of accounts) if (id) await request(`/auth/v1/admin/users/${id}`, undefined, { method: 'DELETE', origin: main, token: config.SERVICE_ROLE_KEY });
    await Promise.all([new Promise(resolve => server.close(resolve)), new Promise(resolve => proxy.close(resolve))]);
}
