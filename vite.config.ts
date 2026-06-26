import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig, loadEnv} from 'vite';

export default defineConfig(({mode}) => {
  const env = loadEnv(mode, '.', '');
  return {
    plugins: [
      react(), 
      tailwindcss(),
      {
        name: 'api-middleware-fallback',
        configureServer(server) {
          let wrapperApp: any = null;
          let latestApiModule: any = null;
          server.middlewares.use(async (req, res, next) => {
            const parsedUrl = req.url ? req.url.split('?')[0] : '';
            if (parsedUrl.startsWith('/api/') || parsedUrl === '/api') {
              try {
                latestApiModule = await server.ssrLoadModule('./src/server-api.ts');
                if (!wrapperApp) {
                  const express = await import('express');
                  wrapperApp = express.default();
                  wrapperApp.use((reqVal: any, resVal: any, nextVal: any) => {
                    if (latestApiModule && latestApiModule.app) {
                      latestApiModule.app(reqVal, resVal, nextVal);
                    } else {
                      nextVal();
                    }
                  });
                }
                wrapperApp(req as any, res as any, next);
                return;
              } catch (err: any) {
                console.error('[API-Plugin] Request forwarding error:', err.message || err);
              }
            }
            next();
          });
        }
      }
    ],
    define: {
      'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY),
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modifyâfile watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
