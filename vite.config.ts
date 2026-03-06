
import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

const escapeRegex = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const buildSupabaseStoragePattern = (supabaseUrl?: string): RegExp | null => {
  if (!supabaseUrl) return null;

  try {
    const hostname = new URL(supabaseUrl).hostname;
    if (!hostname) return null;

    return new RegExp(`^https://${escapeRegex(hostname)}/storage/v1/object/public/.*`, 'i');
  } catch {
    return null;
  }
};

type RuntimeCachingRule = {
  urlPattern: RegExp | (({ url }: { url: URL }) => boolean);
  handler: 'StaleWhileRevalidate';
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

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const supabaseStoragePattern = buildSupabaseStoragePattern(env.VITE_SUPABASE_URL);
  const runtimeCaching: RuntimeCachingRule[] = [
    {
      urlPattern: ({ url }: { url: URL }) => url.pathname.startsWith('/Logo/'),
      handler: 'StaleWhileRevalidate' as const,
      options: {
        cacheName: 'logo-assets-cache',
        expiration: {
          maxEntries: 80,
          maxAgeSeconds: 60 * 60 * 24 * 30
        },
        cacheableResponse: {
          statuses: [0, 200]
        }
      }
    }
  ];

  if (supabaseStoragePattern) {
    runtimeCaching.push({
      urlPattern: supabaseStoragePattern,
      handler: 'StaleWhileRevalidate' as const,
      options: {
        cacheName: 'supabase-storage-cache',
        expiration: {
          maxEntries: 50,
          maxAgeSeconds: 60 * 60 * 24 * 30 // 30 days
        },
        cacheableResponse: {
          statuses: [0, 200]
        }
      }
    });
  } else {
    console.warn('[vite-config] Supabase storage cache rule disabled: invalid or missing VITE_SUPABASE_URL.');
  }

  return {
    plugins: [
      react(),
      VitePWA({
        registerType: 'autoUpdate',
        includeAssets: ['favicon.ico', 'apple-touch-icon.png', 'masked-icon.svg'],
        manifest: {
          name: 'Carnet Naturaliste',
          short_name: 'CarnetNat',
          description: 'Application de gestion d\'observations naturalistes',
          theme_color: '#ffffff',
          icons: [
            {
              src: 'pwa-192x192.png',
              sizes: '192x192',
              type: 'image/png'
            },
            {
              src: 'pwa-512x512.png',
              sizes: '512x512',
              type: 'image/png'
            }
          ],
          display: 'standalone',
          start_url: '/',
          background_color: '#ffffff'
        },
        workbox: {
          maximumFileSizeToCacheInBytes: 3 * 1024 * 1024, // 3 MiB to accommodate the large main bundle
          globPatterns: ['**/*.{js,css,html,ico,png,svg}'],
          globIgnores: ['**/Logo/*'],
          runtimeCaching
        }
      })
    ],
    build: {
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (!id.includes('node_modules')) return undefined;

            if (id.includes('leaflet') || id.includes('leaflet.markercluster')) {
              return 'vendor-leaflet';
            }

            if (id.includes('/xlsx/')) {
              return 'vendor-xlsx';
            }

            if (id.includes('/jspdf/')) {
              return 'vendor-jspdf';
            }

            if (id.includes('/html2canvas/')) {
              return 'vendor-html2canvas';
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
