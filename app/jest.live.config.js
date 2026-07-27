// Separate Jest config for *.live.test.ts files (real network requests).
//
// These tests don't touch React Native/Expo APIs at all — they just exercise
// a plain axios-based service function. Running them under the normal
// jest-expo preset (via `preset: 'jest-expo'`) pulls in Expo's "winter"
// runtime polyfills via the preset's setupFiles, which collide with axios's
// own fetch-adapter feature detection at import time ("Cannot cancel a
// stream that already has a reader"). Jest merges (concatenates) a preset's
// setupFiles with the project's own rather than letting the project override
// them, so `preset: 'jest-expo'` + `setupFiles: []` does NOT drop them.
//
// Instead, flatten the resolved jest-expo preset object into this config via
// plain object spread (bypassing Jest's own preset-merge step entirely) so
// `setupFiles: []` below actually runs, while still reusing the preset's
// babel-jest transform so TypeScript compiles correctly.
const jestExpoPreset = require('jest-expo/jest-preset');
const localJestConfig = require('./package.json').jest;

module.exports = {
  ...jestExpoPreset,
  moduleNameMapper: {
    ...jestExpoPreset.moduleNameMapper,
    ...localJestConfig.moduleNameMapper,
  },
  testEnvironment: 'node',
  setupFiles: ['<rootDir>/jest.live.setup.js'],
  testMatch: ['<rootDir>/src/__tests__/**/*.live.test.ts'],
  testPathIgnorePatterns: ['/node_modules/'],
};
