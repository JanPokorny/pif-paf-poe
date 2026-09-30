export default [{
  files: ['**/*.js', '**/*.mjs'],
  languageOptions: { ecmaVersion: 2024, sourceType: 'module', globals: { window: 'readonly', document: 'readonly', localStorage: 'readonly', navigator: 'readonly', location: 'readonly', setTimeout: 'readonly', clearTimeout: 'readonly', console: 'readonly', performance: 'readonly', Worker: 'readonly', self: 'readonly', URL: 'readonly', Node: 'readonly', CSS: 'readonly', confirm: 'readonly', requestAnimationFrame: 'readonly', AudioContext: 'readonly', process: 'readonly', caches: 'readonly', fetch: 'readonly' } },
  rules: { 'no-undef': 'error', 'no-unused-vars': ['warn', { args: 'none' }], 'no-shadow': 'warn', 'no-dupe-keys': 'error', 'no-unreachable': 'error' },
}];
