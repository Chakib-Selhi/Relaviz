import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import { defineConfig, globalIgnores } from 'eslint/config';
import globals from 'globals';

/**
 * Globals du navigateur interdits dans le moteur et les données :
 * le moteur doit rester exécutable sous Node (tests) et réutilisable hors React.
 */
const BROWSER_ONLY_GLOBALS = [
  'window',
  'document',
  'navigator',
  'location',
  'history',
  'localStorage',
  'sessionStorage',
  'alert',
].map((name) => ({
  name,
  message: 'Le moteur ne doit pas dépendre du DOM ni du navigateur (voir docs/architecture.md).',
}));

export default defineConfig([
  globalIgnores(['dist', 'coverage']),

  // Règles communes à tout le JavaScript du dépôt.
  {
    files: ['**/*.{js,jsx}'],
    extends: [js.configs.recommended],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    rules: {
      'no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      eqeqeq: ['error', 'always'],
      'prefer-const': 'error',
    },
  },

  // Interface React : hooks et rechargement à chaud.
  {
    files: ['src/ui/**/*.{js,jsx}', 'src/main.jsx'],
    extends: [reactHooks.configs.flat.recommended, reactRefresh.configs.vite],
    languageOptions: { globals: globals.browser },
  },

  // Moteur et données : JavaScript pur, sans React ni DOM.
  {
    files: ['src/engine/**/*.js', 'src/data/**/*.js'],
    languageOptions: { globals: globals['shared-node-browser'] },
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['react', 'react/*', 'react-dom', 'react-dom/*'],
              message: 'Le moteur ne doit pas dépendre de React (voir docs/architecture.md).',
            },
            {
              group: ['**/ui', '**/ui/**'],
              message: "Le moteur ne doit pas importer l'interface (voir docs/architecture.md).",
            },
          ],
        },
      ],
      'no-restricted-globals': ['error', ...BROWSER_ONLY_GLOBALS],
    },
  },

  // Tests et fichiers de configuration exécutés par Node.
  {
    files: ['tests/**/*.js', '*.config.js'],
    languageOptions: { globals: globals.node },
  },

  // Désactive les règles de style qui entreraient en conflit avec Prettier.
  prettier,
]);
