import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

// https://vite.dev/config/ et https://vitest.dev/config/
export default defineConfig({
  plugins: [react()],
  test: {
    // Le moteur ne dépend pas du DOM : les tests tournent sous Node. Les tests de l'interface
    // choisissent jsdom avec le commentaire `@vitest-environment jsdom`.
    environment: 'node',
    include: ['tests/**/*.test.{js,jsx}'],
    coverage: {
      provider: 'v8',
      include: ['src/engine/**/*.js'],
      // types.js ne contient que des typedefs JSDoc, sans code exécutable.
      exclude: ['src/engine/types.js'],
      reporter: ['text', 'html', 'lcov'],
      thresholds: { statements: 85, branches: 85, functions: 85, lines: 85 },
    },
  },
});
