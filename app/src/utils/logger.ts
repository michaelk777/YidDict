/**
 * Dev-only logging — no-ops in production builds so debug traces never ship.
 * console.error is untouched and should still be used directly for real errors.
 */
export function log(...args: unknown[]): void {
  if (__DEV__) {
    console.log(...args);
  }
}
