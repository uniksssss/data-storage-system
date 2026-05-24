import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react({ jsxImportSource: '@emotion/react' }),
    VitePWA({
      registerType: 'autoUpdate',
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.ts',
      manifest: {
        name: 'Data Storage System',
        short_name: 'DataStorage',
        description: 'Data Storage System PWA',
        display: 'standalone',
        scope: '/',
        start_url: '/',
      },
      devOptions: {
        enabled: true,
        type: 'module'
      }
    }),
  ],
  test: {
  globals: true,
  environment: 'node',
  coverage: {
    provider: 'v8',
    reporter: ['text', 'html'],
    include: ['src/domain/**/*.ts'],
    exclude: ['**/*.test.ts'],
  },
} 
});
