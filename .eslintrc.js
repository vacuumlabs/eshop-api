module.exports = {
  extends: [
    'vacuumlabs',

    // Baseline configurations
    'eslint:recommended',

    // Disable ESLint rules conflicting with Prettier and use Prettier rules
    'prettier',
    'prettier/prettier',
    'plugin:prettier/recommended',
  ],
  env: {node: true},
  ignorePatterns: ['dist'],
  plugins: ['simple-import-sort'],
  rules: {
    'simple-import-sort/imports': 'error',
    'simple-import-sort/exports': 'error',
    'import/first': 'error',
    'import/newline-after-import': 'error',
    // no-duplicate-imports does't have autofix
    'no-duplicate-imports': 'off',
    'import/no-duplicates': 'error',
  },
}
