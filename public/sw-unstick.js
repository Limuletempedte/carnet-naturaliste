// Débloque un visiteur resté sur une ancienne version qui ne démarre plus.
//
// En mode « prompt » (vite.config.ts), une nouvelle version du service worker
// attend que l'utilisateur clique sur « Mettre à jour ». Si l'ancienne version
// ne démarre plus, ce bandeau ne s'affiche jamais : la page reste blanche, la
// nouvelle version attend pour toujours, et recharger ne change rien.
// Cas réel (2026-11-26) : les versions d'avant la PR #135 importaient au
// démarrage vendor-jspdf-*.js, exclu du pré-cache ; après un redéploiement, ce
// fichier n'existe plus sur le serveur.
//
// À l'installation d'une nouvelle version, ce script vérifie que l'ancienne
// peut encore démarrer : chaque fichier JavaScript que son entrée importe au
// démarrage (imports statiques, en profondeur) doit être dans le pré-cache,
// dans le cache des chunks vendeur ou sur le serveur, et être bien du
// JavaScript. Sinon seulement, la nouvelle version s'active tout de suite et
// recharge les fenêtres ouvertes. Une ancienne version qui démarre garde le
// fonctionnement normal. En cas de doute (réseau coupé, erreur), rien ne change.
// Garde-fou : tests/swUnstick.test.ts.
(() => {
    const PRECACHE_PREFIX = 'workbox-precache-';
    const VENDOR_CACHE = 'vendor-chunks-cache';
    // Imports statiques du JavaScript produit par Vite : `from"./x.js"` et
    // `import"./x.js"`. Les imports dynamiques `import("./x.js")` sont exclus.
    const STATIC_IMPORT = /(?:\bfrom|\bimport)\s*["'](\.{1,2}\/[^"']+\.js)["']/g;

    let reloadWindows = false;

    const isJavaScript = (response) =>
        Boolean(response && response.ok && /javascript/i.test(response.headers.get('content-type') || ''));

    /** Adresse du script d'entrée (`<script type="module" src>`) d'une page. */
    const entryOf = (html, pageUrl) => {
        for (const [tag] of html.matchAll(/<script\b[^>]*>/gi)) {
            const src = /\bsrc="([^"]+)"/i.exec(tag);
            if (/\btype="module"/i.test(tag) && src) return new URL(src[1], pageUrl).href;
        }
        return null;
    };

    /** Texte d'un chunk tel que l'ancienne version l'obtiendrait, ou null. */
    const loadChunk = async (url, precache, vendorCache) => {
        for (const cache of [precache, vendorCache]) {
            const cached = cache ? await cache.match(url) : undefined;
            if (isJavaScript(cached)) return cached.text();
        }
        try {
            const response = await fetch(url, { cache: 'no-store' });
            return isJavaScript(response) ? response.text() : null;
        } catch {
            return null;
        }
    };

    const canStart = async (entryUrl, precache, vendorCache) => {
        const seen = new Set([entryUrl]);
        const queue = [entryUrl];
        while (queue.length > 0) {
            const url = queue.shift();
            const code = await loadChunk(url, precache, vendorCache);
            if (code === null) return false;
            for (const [, specifier] of code.matchAll(STATIC_IMPORT)) {
                const dependency = new URL(specifier, url).href;
                if (!seen.has(dependency)) {
                    seen.add(dependency);
                    queue.push(dependency);
                }
            }
        }
        return true;
    };

    const oldVersionCannotStart = async () => {
        if (!self.registration.active) return false; // première installation
        const precacheName = (await caches.keys()).find((name) => name.startsWith(PRECACHE_PREFIX));
        if (!precacheName) return false;

        const current = await fetch(new URL('/index.html', self.location.origin).href, { cache: 'no-store' });
        if (!current.ok) return false;
        const currentEntry = entryOf(await current.text(), current.url || self.location.origin);

        const precache = await caches.open(precacheName);
        const vendorCache = (await caches.has(VENDOR_CACHE)) ? await caches.open(VENDOR_CACHE) : null;
        const shells = (await precache.keys()).filter((request) => new URL(request.url).pathname === '/index.html');
        for (const request of shells) {
            const page = await precache.match(request);
            const entry = page ? entryOf(await page.text(), request.url) : null;
            if (!entry || entry === currentEntry) continue;
            if (!(await canStart(entry, precache, vendorCache))) return true;
        }
        return false;
    };

    self.addEventListener('install', (event) => {
        event.waitUntil(
            oldVersionCannotStart()
                .then((stuck) => {
                    if (!stuck) return undefined;
                    reloadWindows = true;
                    return self.skipWaiting();
                })
                .catch(() => undefined)
        );
    });

    self.addEventListener('activate', (event) => {
        if (!reloadWindows) return;
        const claimed = self.clients.claim();
        event.waitUntil(claimed);
        // Recharger après l'activation : attendre la navigation dans waitUntil
        // bloquerait l'activation dont cette navigation dépend.
        claimed
            .then(() => self.clients.matchAll({ type: 'window' }))
            .then((windows) => Promise.all(windows.map((client) => client.navigate(client.url).catch(() => undefined))))
            .catch(() => undefined);
    });
})();
