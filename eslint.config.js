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
        typescript: { project: './jsconfig.json' }
      }
    },
    rules: {
      'multiline-comment-style': ['error', 'starred-block'],
      'no-lonely-if': 'error',
      curly: ['error', 'all'],
      'no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      'no-console': 'error',
      'import/extensions': ['error', 'ignorePackages', { js: 'always', mjs: 'always' }],
      'import/no-unresolved': 'error',
      'import/order': ['warn', { 'newlines-between': 'never' }]
    }
  },
  prettierConfig
]
