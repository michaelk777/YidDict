// Minimal setup for jest.live.config.js — just the one RN global our code
// touches (src/utils/logger.ts's __DEV__ check). Deliberately not reusing
// react-native/jest/setup.js's full setupFiles here; see jest.live.config.js
// for why.
global.__DEV__ = false;
