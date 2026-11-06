
import path from 'path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

type RuntimeCachingRule = {
  urlPattern: RegExp | (({ url }: { url: URL }) => boolean);
  handler: 'StaleWhileRevalidate' | 'CacheFirst';
  options: {
    cacheName: string;
    expiration: {
      maxEntries: number;
      maxAgeSeconds: number;
    };
    cacheableResponse: {
      statuses: number[];
    };
  };
};

export default defineConfig(() => {
  const runtimeCaching: RuntimeCachingRule[] = [
    {
      // Audit v2 (lot C) : les chunks vendeur lourds sont exclus du precache
      // (globIgnores PE-11) mais n'étaient couverts par AUCUNE règle runtime :
      // après un redéploiement Vercel, un onglet déjà ouvert demandant
      // vendor-exceljs-<ancien hash>.js recevait un 404 (export/import cassés).
      // CacheFirst est sûr : les noms de fichiers sont hashés (immuables).
      urlPattern: ({ url }: { url: URL }) => /^\/assets\/vendor-.*\.js$/.test(url.pathname),
      handler: 'CacheFirst' as const,
      options: {
        cacheName: 'vendor-chunks-cache',
        expiration: {
          maxEntries: 12,
          maxAgeSeconds: 60 * 60 * 24 * 30 // 30 jours
        },
        cacheableResponse: {
          statuses: [0, 200]
        }
      }
    },
    {
      urlPattern: ({ url }: { url: URL }) => url.pathname.startsWith('/Logo/'),
      handler: 'StaleWhileRevalidate' as const,
      options: {
        cacheName: 'logo-assets-cache',
        expiration: {
          maxEntries: 80,
          // CO-07: TTL 30j applique sur Android/desktop. iOS Safari evicte
          // toutefois les caches SW apres ~7j d'inactivite (limite plateforme,
          // non modifiable cote app). Documente ici pour reference.
          maxAgeSeconds: 60 * 60 * 24 * 30
        },
        cacheableResponse: {
          statuses: [0, 200]
        }
      }
    }
  ];


  return {
    worker: { format: 'es' },
    plugins: [
      react(),
      VitePWA({
        // Audit v2 (lot C, H14) : 'autoUpdate' rendait la bannière CO-06
        // (index.tsx onNeedRefresh) inopérante — onNeedRefresh n'est appelé
        // qu'en mode 'prompt' — et un déploiement pouvait recharger l'app
        // pendant une saisie. En 'prompt', l'utilisateur choisit le moment.
        registerType: 'prompt',
        // CO-01: masked-icon.svg n'existe pas (feature Safari pinned-tab deprecated), retire de la liste.
        // EE-5: logo.svg precache (affiche sur l'ecran de connexion et l'ecran hors-ligne).
        // Icones generees par `npm run icons` (scripts/generate-icons.py).
        includeAssets: ['favicon.ico', 'favicon.svg', 'apple-touch-icon.png', 'logo.svg'],
        manifest: {
          name: 'Carnet Naturaliste',
          short_name: 'CarnetNat',
          description: 'Application de gestion d\'observations naturalistes',
          // CO-04: langue passee de 'en' (defaut) a 'fr' pour la conformite store/PWA
          lang: 'fr',
          // CO-05: couleurs alignees sur le theme nature-beige plutot que blanc
          theme_color: '#F2F2F7',
          background_color: '#F2F2F7',
          // CO-10: metadonnees PWA additionnelles pour stores et lanceurs
          categories: ['productivity', 'education', 'utilities'],
          orientation: 'any',
          icons: [
            // CO-09: tailles intermediaires pour Android (144) et splash haute resolution (384)
            {
              src: 'pwa-144x144.png',
              sizes: '144x144',
              type: 'image/png'
            },
            {
              src: 'pwa-192x192.png',
              sizes: '192x192',
              type: 'image/png'
            },
            {
              src: 'pwa-384x384.png',
              sizes: '384x384',
              type: 'image/png'
            },
            {
              src: 'pwa-512x512.png',
              sizes: '512x512',
              type: 'image/png'
            },
            // CO-09 / EE-5: variants maskable dedies (oiseau dans la zone de securite 80 %)
            {
              src: 'pwa-maskable-192x192.png',
              sizes: '192x192',
              type: 'image/png',
              purpose: 'maskable'
            },
            {
              src: 'pwa-maskable-512x512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'maskable'
            }
          ],
          display: 'standalone',
          start_url: '/',
          // CO-10: raccourci PWA pour creer une nouvelle observation rapidement
          shortcuts: [
            {
              name: 'Nouvelle observation',
              short_name: 'Nouvelle obs.',
              description: 'Ajouter une nouvelle observation naturaliste',
              url: '/',
              icons: [{ src: 'pwa-192x192.png', sizes: '192x192' }]
            }
          ]
        },
        workbox: {
          importScripts: ['/sw-private-media-cleanup.js'],
          maximumFileSizeToCacheInBytes: 3 * 1024 * 1024, // 3 MiB to accommodate the large main bundle
          globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
          // PE-11: Exclude heavy vendor chunks from precache (loaded on-demand via runtime cache)
          globIgnores: ['**/Logo/*', '**/vendor-exceljs*', '**/vendor-jspdf*', '**/vendor-html2canvas*', '**/vendor-jszip*', '**/vendor-file-saver*'],
          // CO-08: page de fallback offline servie quand une navigation echoue
          navigateFallback: '/index.html',
          navigateFallbackDenylist: [/^\/api\//, /^\/auth\//],
          runtimeCaching
        }
      })
    ],
    build: {
      // CO-13: cible navigateurs explicite alignee sur le .browserslistrc.
      // Minimum effectif: Chrome 92, Firefox 95, Safari 15.2, Edge 92.
      target: ['es2020', 'chrome92', 'firefox95', 'safari15.2', 'edge92'],
      // PE-30: Exclut les chunks vendeur lourds du modulepreload automatique de Vite.
      // Ces chunks sont destinés à être chargés uniquement quand l'utilisateur
      // déclenche l'action correspondante (export Excel/PDF, backup ZIP).
      // Les précharger au boot fait gaspiller la bande passante pour les utilisateurs
      // qui n'exporteront jamais. Les autres chunks (vendor-core, vendor-leaflet…)
      // restent préchargés normalement pour accélérer leur premier usage.
      modulePreload: {
        resolveDependencies: (_filename, deps) => {
          const HEAVY_ON_DEMAND_CHUNKS = [
            'vendor-exceljs',
            'vendor-jspdf',
            'vendor-html2canvas',
            'vendor-jszip',
            'vendor-file-saver'
          ];
          return deps.filter(dep => !HEAVY_ON_DEMAND_CHUNKS.some(chunk => dep.includes(chunk)));
        }
      },
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (!id.includes('node_modules')) return undefined;

            if (id.includes('leaflet') || id.includes('leaflet.markercluster')) {
              return 'vendor-leaflet';
            }

            if (id.includes('/exceljs/')) {
              return 'vendor-exceljs';
            }

            if (id.includes('/jspdf/')) {
              return 'vendor-jspdf';
            }

            if (id.includes('/html2canvas/')) {
              return 'vendor-html2canvas';
            }

            if (id.includes('/@sentry/') || id.includes('/@sentry-internal/')) {
              return 'vendor-sentry';
            }

            // PE-10: Additional vendor chunks for better cache invalidation
            if (id.includes('/recharts/') || id.includes('/d3-')) {
              return 'vendor-recharts';
            }

            if (id.includes('/jszip/')) {
              return 'vendor-jszip';
            }

            if (id.includes('/file-saver/')) {
              return 'vendor-file-saver';
            }

            if (id.includes('/react-calendar/')) {
              return 'vendor-react-calendar';
            }

            if (id.includes('/react/') || id.includes('/react-dom/') || id.includes('/@supabase/')) {
              return 'vendor-core';
            }

            return undefined;
          }
        }
      }
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      }
    }
  };
});
