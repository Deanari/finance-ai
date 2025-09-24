module.exports = {
  root: true,
  parser: '@typescript-eslint/parser',
  parserOptions: {
    ecmaVersion: 'latest',
    sourceType: 'module',
    ecmaFeatures: { jsx: true },
  },
  env: { browser: true, es2023: true },
  plugins: [
    '@typescript-eslint',
    'react',
    'react-hooks',
    'jsx-a11y',
    'simple-import-sort',
    'prettier',
  ],
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
    'plugin:react/recommended',
    'plugin:react-hooks/recommended',
    'plugin:jsx-a11y/recommended',
    // Desactiva reglas de estilo que chocan con Prettier y
    // agrega la regla "prettier/prettier"
    'plugin:prettier/recommended',
  ],
  settings: { react: { version: 'detect' } },
  rules: {
    // Orden automático de imports
    'simple-import-sort/imports': 'warn',
    'simple-import-sort/exports': 'warn',

    // TS
    '@typescript-eslint/no-unused-vars': [
      'warn',
      { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
    ],

    // Delega formato a Prettier
    'prettier/prettier': 'warn',
    'react/react-in-jsx-scope': 'off',
  },
  ignorePatterns: ['dist/', 'build/', 'node_modules/'],
};
