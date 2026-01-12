import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, '.', '');
    return {
      server: {
        port: 3000,
        host: '0.0.0.0',
      },
      plugins: [
        react(),
        VitePWA({
          registerType: 'autoUpdate',
          includeAssets: ['favicon.ico', 'apple-touch-icon.png'],
          manifest: {
            name: 'Conferente Pro',
            short_name: 'Conferente',
            description: 'Control de pesaje inteligente y conferencias',
            theme_color: '#2563eb',
            background_color: '#eff6ff',
            display: 'standalone',
            scope: '/',
            start_url: '/',
            icons: [
              {
                src: 'https://www.pwabuilder.com/assets/icons/icon_192.png',
                sizes: '192x192',
                type: 'image/png',
                purpose: 'any'
              },
              {
                src: 'https://www.pwabuilder.com/assets/icons/icon_512.png',
                sizes: '512x512',
                type: 'image/png',
                purpose: 'maskable'
              }
            ]
          },
          workbox: {
            runtimeCaching: [
              {
                urlPattern: /^https:\/\/generativelanguage\.googleapis\.com\/.*/i,
                handler: 'NetworkFirst',
                options: {
                  cacheName: 'gemini-cache',
                  expiration: {
                    maxEntries: 10,
                    maxAgeSeconds: 60 * 60 * 24 * 7 // 1 semana
                  }
                }
              }
            ]
          }
        })
      ],
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        }
      }
    };
});
