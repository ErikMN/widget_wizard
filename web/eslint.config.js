import pkg from 'globals'; // CommonJS import workaround
const { browser: browserGlobals, node: nodeGlobals } = pkg; // Destructure globals

import typescriptParser from '@typescript-eslint/parser';
import typescriptPlugin from '@typescript-eslint/eslint-plugin';
import reactHooksPlugin from 'eslint-plugin-react-hooks';

export default [
  {
    files: ['*.js', '*.jsx', '*.ts', '*.tsx'],
    languageOptions: {
      parser: typescriptParser,
      globals: {
        ...browserGlobals // Add browser globals like window, document, etc.
      }
    },
    plugins: {
      '@typescript-eslint': typescriptPlugin,
      'react-hooks': reactHooksPlugin
    },
    rules: {
      // ESLint recommended rules
      'no-unused-vars': 'warn',
      'no-extra-semi': 'error',
      'no-undef': 'error',

      // TypeScript rules
      '@typescript-eslint/no-unused-vars': 'warn',
      '@typescript-eslint/no-explicit-any': 'warn',

      // React Hooks rules
      'react-hooks/rules-of-hooks': 'error', // Checks rules of Hooks
      'react-hooks/exhaustive-deps': 'warn', // Checks effect dependencies

      // Prettier configuration
      'prettier/prettier': 'off'
    },
    ignores: ['node_modules', 'dist', 'build']
  },
  {
    files: ['vite.config.ts'], // Target specific config files
    languageOptions: {
      globals: {
        ...nodeGlobals // Add Node.js globals like process
      }
    }
  }
];
