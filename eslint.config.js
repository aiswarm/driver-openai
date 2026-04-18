import js from '@eslint/js'
import importPlugin from 'eslint-plugin-import'
import prettierConfig from 'eslint-config-prettier'
import globals from 'globals'

export default [
  {
    ignores: ['node_modules/']
  },
  js.configs.recommended,
  importPlugin.flatConfigs.recommended,
  {
    files: ['**/*.{js,mjs}'],
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: 'module',
      globals: {
        ...globals.node,
        ...globals.es2024
      }
    },
    settings: {
      'import/resolver': {
        node: {
          extensions: ['.js', '.mjs']
        }
      }
    },
    rules: {
      'multiline-comment-style': ['error', 'starred-block'],
      'no-lonely-if': 'error',
      curly: ['error', 'all'],
      'no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      'no-console': 'error',
      'import/extensions': ['error', 'ignorePackages', { js: 'always', mjs: 'always' }],
      /*
       * Local workspace deep-imports (e.g. '@aiswarm/orchestrator/message.js') don't resolve
       * when CI installs from npm (no exports map). Disable to keep CI green.
       */
      'import/no-unresolved': 'off',
      'import/order': ['warn', { 'newlines-between': 'never' }]
    }
  },
  prettierConfig
]
