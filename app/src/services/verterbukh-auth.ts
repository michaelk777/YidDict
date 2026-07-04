import * as SecureStore from 'expo-secure-store';
import axios from 'axios';
import { parse } from 'node-html-parser';

const BASE_URL = 'https://verterbukh.org/vb';
const CREDENTIALS_KEY = 'verterbukh_credentials';

export interface VerterbukhCredentials {
  username: string;
  password: string;
}

export interface VerterbukhQuota {
  used: number;
  total: number;
}

/**
 * Parses "used X/Y" out of the .quota-box present on any authenticated
 * Verterbukh response (login or search) — null when logged out or the
 * markup doesn't match.
 */
export function parseVerterbukhQuota(html: string): VerterbukhQuota | null {
  const quotaBox = parse(html).querySelector('.quota-box');
  if (!quotaBox) return null;
  const match = quotaBox.text.match(/used\s+(\d+)\/(\d+)/i);
  if (!match) return null;
  return { used: parseInt(match[1], 10), total: parseInt(match[2], 10) };
}

// ---------------------------------------------------------------------------
// Session tracking (module-level — resets on app quit / module reload)
// ---------------------------------------------------------------------------

// True once login() succeeds during this app instance. Set back to false on
// logout. Used by ensureSession to enforce "app quit = session ends" when
// keepLoggedIn is off.
let sessionActiveThisInstance = false;
let sessionStartedAt: number | null = null;

const SESSION_MAX_MS = 24 * 60 * 60 * 1000; // 24 hours

// True iff credentials are currently stored in SecureStore (keep-logged-in mode).
// Initialized from SecureStore by initAuth() at app startup.
let credentialsPersisted = false;

// Short-term session credentials held in memory only — never written to SecureStore
// when keepLoggedIn is off. Cleared on logout or app restart.
let inMemoryCredentials: VerterbukhCredentials | null = null;

export function startSession(): void {
  sessionActiveThisInstance = true;
  sessionStartedAt = Date.now();
}

export function endSession(): void {
  sessionActiveThisInstance = false;
  sessionStartedAt = null;
}

// Only for Jest — resets module-level state between tests.
export function __resetSessionState(): void {
  sessionActiveThisInstance = false;
  sessionStartedAt = null;
  credentialsPersisted = false;
  inMemoryCredentials = null;
}

/**
 * Call once at app startup (after initDatabase) to sync credentialsPersisted
 * with what is actually in SecureStore.
 */
export async function initAuth(): Promise<void> {
  const stored = await SecureStore.getItemAsync(CREDENTIALS_KEY);
  credentialsPersisted = stored !== null;
}

/**
 * Store credentials in memory only (short-term mode — never written to SecureStore).
 * Cleared automatically when the module reloads (app restart).
 */
export function setInMemoryCredentials(credentials: VerterbukhCredentials | null): void {
  inMemoryCredentials = credentials;
}

/**
 * Reports whether Verterbukh is actually usable right now, mirroring the
 * gating logic in ensureSession without making a network call.
 *
 * keepLoggedIn=true: true if credentials are persisted in SecureStore (will
 *   auto-re-auth transparently) OR an active session exists this instance.
 * keepLoggedIn=false: true only if login() has run this app instance and
 *   the 24h window hasn't elapsed.
 */
export function hasActiveSession(keepLoggedIn: boolean): boolean {
  if (keepLoggedIn) return credentialsPersisted || sessionActiveThisInstance;
  if (!sessionActiveThisInstance || sessionStartedAt === null) return false;
  return Date.now() - sessionStartedAt <= SESSION_MAX_MS;
}

// ---------------------------------------------------------------------------
// Credential storage
// ---------------------------------------------------------------------------

export async function saveCredentials(credentials: VerterbukhCredentials): Promise<void> {
  await SecureStore.setItemAsync(CREDENTIALS_KEY, JSON.stringify(credentials));
  credentialsPersisted = true;
}

export async function getCredentials(): Promise<VerterbukhCredentials | null> {
  const stored = await SecureStore.getItemAsync(CREDENTIALS_KEY);
  if (stored) return JSON.parse(stored) as VerterbukhCredentials;
  return inMemoryCredentials;
}

export async function deleteCredentials(): Promise<void> {
  await SecureStore.deleteItemAsync(CREDENTIALS_KEY);
  credentialsPersisted = false;
}

// ---------------------------------------------------------------------------
// Login / Logout
// ---------------------------------------------------------------------------

/**
 * POST login credentials to Verterbukh.
 * On success sets session-active state and the native cookie store captures
 * the session cookie automatically. Throws if the response still shows the
 * login form (wrong credentials or network issue). Returns the account's
 * quota parsed from the login response itself, so the caller can display
 * the token count immediately without waiting for a search.
 */
export async function login(credentials: VerterbukhCredentials): Promise<VerterbukhQuota | null> {
  const params = new URLSearchParams({
    html_login: '1',
    username: credentials.username,
    password: credentials.password,
    dir: 'from',
    mode: 'html',
    tsu: 'en',
  });

  console.log('[YidDict] VerterbukhAuth: attempting login');

  const response = await axios.post(BASE_URL, params.toString(), {
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  });

  if (isLoggedOut(response.data)) {
    throw new Error('Login failed — check your username and password');
  }

  startSession();
  console.log('[YidDict] VerterbukhAuth: login successful');
  return parseVerterbukhQuota(response.data);
}

/**
 * Log out: invalidate the server-side session, delete local credentials,
 * and clear in-memory session state. The server call is best-effort — local
 * state is always cleared even if the network request fails.
 */
export async function logout(): Promise<void> {
  endSession();
  inMemoryCredentials = null;
  await deleteCredentials();
  try {
    await axios.get(BASE_URL, { params: { page: 'logout' } });
    console.log('[YidDict] VerterbukhAuth: server session invalidated');
  } catch {
    console.log('[YidDict] VerterbukhAuth: server logout failed (credentials still deleted locally)');
  }
}

// ---------------------------------------------------------------------------
// Session helpers
// ---------------------------------------------------------------------------

/**
 * Returns true if the HTML response indicates we are NOT logged in.
 * Two signals: login form is present (html_login hidden field), or
 * quota box is absent (shown only to authenticated users).
 */
export function isLoggedOut(html: string): boolean {
  return html.includes('name="html_login"') || !html.includes('quota-box');
}

/**
 * Ensures an active session exists before making a Verterbukh request.
 *
 * keepLoggedIn=true (indefinite mode):
 *   - Re-authenticates transparently whenever the server-side cookie expires.
 *
 * keepLoggedIn=false (short-term mode, default):
 *   - Throws if no login has occurred during this app instance (app-quit gate).
 *   - Throws if the session is older than 24 hours.
 *   - Within those bounds, still re-authenticates transparently if the HTTP
 *     cookie expires mid-session (same as above).
 *
 * Throws if no credentials are stored or if re-authentication fails.
 */
export async function ensureSession(
  lastResponseHtml?: string,
  keepLoggedIn = false,
): Promise<void> {
  if (!keepLoggedIn) {
    if (!sessionActiveThisInstance) {
      throw new Error('Not logged in — please log in in Settings to use Verterbukh');
    }
    if (sessionStartedAt !== null && Date.now() - sessionStartedAt > SESSION_MAX_MS) {
      endSession();
      throw new Error('Session expired after 24 hours — please log in again in Settings');
    }
  }

  if (lastResponseHtml !== undefined && !isLoggedOut(lastResponseHtml)) {
    return; // HTTP session still valid
  }

  const credentials = await getCredentials();
  if (!credentials) {
    throw new Error('Verterbukh credentials not saved — add them in Settings');
  }

  await login(credentials);
}
