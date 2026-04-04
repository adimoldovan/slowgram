import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import globals from 'globals';

export default [
  { ignores: ['dist/'] },
  js.configs.recommended,
  prettier,
  {
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: {
        ...globals.browser,
        __COMMIT_HASH__: 'readonly',
      },
    },
    rules: {
      // Best practices (from airbnb-base)
      'no-eval': 'error',
      'no-implied-eval': 'error',
      'no-new-func': 'error',
      'no-new-wrappers': 'error',
      'no-return-assign': ['error', 'always'],
      'no-self-compare': 'error',
      'no-throw-literal': 'error',
      'no-unused-expressions': ['error', { allowShortCircuit: true, allowTernary: true }],
      'no-useless-concat': 'error',
      'no-useless-return': 'error',
      'no-void': 'error',
      'no-loop-func': 'error',
      'no-multi-str': 'error',
      'no-new': 'error',
      'no-proto': 'error',
      'no-extend-native': 'error',
      'no-iterator': 'error',
      'no-labels': 'error',
      'no-lone-blocks': 'error',
      'no-caller': 'error',
      curly: ['error', 'multi-line'],
      'default-case': 'error',
      'default-case-last': 'error',
      eqeqeq: ['error', 'always', { null: 'ignore' }],
      'grouped-accessor-pairs': 'error',
      'guard-for-in': 'error',
      'no-alert': 'warn',
      'no-constructor-return': 'error',
      'no-else-return': ['error', { allowElseIf: false }],
      radix: 'error',
      yoda: 'error',
      'prefer-promise-reject-errors': 'error',

      // Variables
      'no-shadow': 'error',
      'no-undef-init': 'error',
      'no-use-before-define': ['error', { functions: false, classes: true, variables: true }],

      // Style (non-formatting, not handled by prettier)
      'no-array-constructor': 'error',
      'no-bitwise': 'error',
      'no-continue': 'error',
      'no-lonely-if': 'error',
      'no-nested-ternary': 'error',
      'no-unneeded-ternary': ['error', { defaultAssignment: false }],
      'one-var': ['error', 'never'],
      'operator-assignment': ['error', 'always'],
      'prefer-object-spread': 'error',

      // ES6
      'no-var': 'error',
      'prefer-const': ['error', { destructuring: 'any', ignoreReadBeforeAssign: true }],
      'prefer-arrow-callback': ['error', { allowNamedFunctions: false, allowUnboundThis: true }],
      'prefer-destructuring': ['error', { array: true, object: true }, { enforceForRenamedProperties: false }],
      'prefer-rest-params': 'error',
      'prefer-spread': 'error',
      'prefer-template': 'error',
      'no-useless-computed-key': 'error',
      'no-useless-constructor': 'error',
      'no-useless-rename': 'error',
      'no-duplicate-imports': 'error',
      'object-shorthand': ['error', 'always', { ignoreConstructors: false, avoidQuotes: true }],
      'symbol-description': 'error',
    },
  },
  {
    files: ['vite.config.js', 'bin/**/*.mjs'],
    languageOptions: {
      globals: {
        ...globals.node,
      },
    },
  },
];
