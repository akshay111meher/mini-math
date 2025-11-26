// eslint.config.mjs
import tseslint from 'typescript-eslint'
import prettier from 'eslint-plugin-prettier'
import eslintConfigPrettier from 'eslint-config-prettier'

export default tseslint.config(
  // Ignore build artifacts and deps
  {
    ignores: [
      '**/dist/**',
      '**/node_modules/**',
      '**/.turbo/**',
      '**/coverage/**',
      // 'packages/compiler/src/NodeFactory/utils/cdpService.ts',
      // 'packages/compiler/src/NodeFactory/CdpTransaction.ts',
      // 'packages/compiler/src/NodeFactory/CdpSmartContract.ts',
      // 'packages/compiler/src/NodeFactory/CdpSign.ts',
    ],
  },

  // Basic recommended TS/JS rules (no type-checking pass needed)
  ...tseslint.configs.recommended,

  // Disable stylistic rules that may clash with Prettier
  eslintConfigPrettier,

  // Run Prettier as an ESLint rule (optional but nice for single “lint” gate)
  {
    plugins: { prettier },
    rules: {
      'prettier/prettier': 'warn',

      // You can add opinionated TS rules here later. For now, keep it light.
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
    },
  },

  // File globs
  {
    files: ['**/*.{ts,tsx,js,mjs,cjs}'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
    },
  },
)
