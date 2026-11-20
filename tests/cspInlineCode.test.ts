import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

// Non-régression CSP : en production, vercel.json impose `script-src 'self' …`
// sans 'unsafe-inline'. Le navigateur bloque alors tout code JavaScript écrit
// dans le HTML (onfocus=, onclick=, <script> sans src, liens javascript:).
// Le défaut a cassé le lien « Aller au contenu principal » (index.html) et le
// bouton « Réessayer » de la page hors-ligne, sans aucune erreur en local.

const ROOT = resolve(__dirname, '..');
const read = (path: string) => readFileSync(resolve(ROOT, path), 'utf8');

const STATIC_FILES = [
    'index.html',
    ...readdirSync(resolve(ROOT, 'public'))
        .filter(name => /\.(html|svg)$/.test(name))
        .map(name => `public/${name}`)
];

/** Balises ouvrantes du fichier, commentaires HTML retirés. */
const openingTags = (source: string) =>
    source.replace(/<!--[\s\S]*?-->/g, '').match(/<[a-zA-Z][^>]*>/g) ?? [];

describe('Aucun code JavaScript en ligne dans les fichiers statiques', () => {
    it.each(STATIC_FILES)('%s : aucun attribut de gestionnaire d’évènement (on…=)', (path) => {
        const offending = openingTags(read(path)).filter(tag => /\son[a-z]+\s*=/i.test(tag));
        expect(offending).toEqual([]);
    });

    it.each(STATIC_FILES)('%s : chaque <script> charge un fichier externe', (path) => {
        const scripts = openingTags(read(path)).filter(tag => /^<script\b/i.test(tag));
        expect(scripts.filter(tag => !/\ssrc\s*=/i.test(tag))).toEqual([]);
    });

    it.each(STATIC_FILES)('%s : aucun lien javascript:', (path) => {
        expect(read(path)).not.toMatch(/javascript:/i);
    });

    it('la CSP de production reste stricte pour les scripts', () => {
        const config = JSON.parse(read('vercel.json')) as {
            headers: Array<{ headers: Array<{ key: string; value: string }> }>;
        };
        const csp = config.headers
            .flatMap(entry => entry.headers)
            .find(header => header.key === 'Content-Security-Policy')?.value ?? '';
        const scriptSrc = csp.split(';').map(part => part.trim()).find(part => part.startsWith('script-src ')) ?? '';
        expect(scriptSrc).toContain("'self'");
        expect(scriptSrc).not.toMatch(/'unsafe-inline'|'unsafe-hashes'|'unsafe-eval'|'sha(256|384|512)-/);
    });
});

describe('Lien d’évitement « Aller au contenu principal »', () => {
    const html = read('index.html');
    const css = read('index.css');
    const skipLink = openingTags(html).find(tag => tag.includes('href="#main-content"')) ?? '';

    it('existe et repose sur la classe CSS .skip-link, sans style en ligne', () => {
        expect(skipLink).toContain('class="skip-link"');
        // Un style en ligne l'emporterait sur la règle :focus et garderait le lien caché.
        expect(skipLink).not.toMatch(/\sstyle\s*=/i);
    });

    it('devient visible au focus grâce au CSS, y compris en mode sombre', () => {
        const focusRule = css.match(/\.skip-link:focus\s*\{([^}]*)\}/)?.[1] ?? '';
        expect(focusRule).toMatch(/position:\s*fixed/);
        expect(focusRule).toMatch(/width:\s*auto/);
        expect(focusRule).toMatch(/overflow:\s*visible/);
        expect(css).toMatch(/\.dark \.skip-link:focus\s*\{/);
    });

    it('pointe vers <main id="main-content"> qui peut recevoir le focus', () => {
        const app = read('App.tsx');
        const mainTag = app.match(/<main\b[^>]*>/)?.[0] ?? '';
        expect(mainTag).toContain('id="main-content"');
        expect(mainTag).toContain('tabIndex={-1}');
    });
});
