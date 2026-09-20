import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv, mergeConfig } from 'vite';
import { defineConfig as defineVitestConfig } from 'vitest/config';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');

  return mergeConfig(
    {
      plugins: [react()],
      server: {
        port: 5173,
        proxy: {
          '/api': {
            target: env.VITE_API_URL || 'http://localhost:3001',
            changeOrigin: true
          }
        }
      },
      build: {
        outDir: 'dist',
        emptyOutDir: true
      }
    },
    defineVitestConfig({
      test: {
        environment: 'jsdom',
        globals: true,
        setupFiles: './src/setupTests.ts'
      }
    })
  );
});
