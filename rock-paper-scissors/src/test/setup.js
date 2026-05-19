import '@webcomponents/webcomponentsjs/webcomponents-bundle.js';

Object.defineProperty(globalThis, 'crypto', {
  value: {
    randomUUID: () => 'test-uuid'
  },
  configurable: true
});