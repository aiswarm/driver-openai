import js from '@eslint/js'
import { importX } from 'eslint-plugin-import-x'
import prettierConfig from 'eslint-config-prettier'
import globals from 'globals'

export default [
  {
    ignores: ['node_modules/']
  },
  js.configs.recommended,
  importX.flatConfigs.recommended,
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
      'import-x/resolver': {
        typescript: { project: './jsconfig.json' }
      }
    },
    rules: {
      'multiline-comment-style': ['error', 'starred-block'],
      'no-lonely-if': 'error',
      curly: ['error', 'all'],
      'no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      'no-console': 'error',
      'import-x/extensions': ['error', 'ignorePackages', { js: 'always', mjs: 'always' }],
      'import-x/no-unresolved': 'error',
      'import-x/order': ['warn', { 'newlines-between': 'never' }]
    }
  },
  prettierConfig
]
