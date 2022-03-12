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

  env: {
    node: true,
  },

  ignorePatterns: ['dist'],

  // don't use extended react rules as this is not a react app
  rules: {'react/no-deprecated': 'off'},
}
