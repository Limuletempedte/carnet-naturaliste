
import path from 'path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig(() => {
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
          runtimeCaching: [
            {
              urlPattern: ({ url }) => url.pathname.startsWith('/Logo/'),
              handler: 'StaleWhileRevalidate',
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
            },
            {
              urlPattern: /^https:\/\/xowiezzqehadcfnbjio\.supabase\.co\/storage\/v1\/object\/public\/.*/i,
              handler: 'StaleWhileRevalidate',
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
            }
          ]
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
