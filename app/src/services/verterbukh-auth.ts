import * as SecureStore from 'expo-secure-store';
import axios from 'axios';

const BASE_URL = 'https://verterbukh.org/vb';
const CREDENTIALS_KEY = 'vb_credentials';

export interface VbCredentials {
  username: string;
  password: string;
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
}

// ---------------------------------------------------------------------------
// Credential storage
// ---------------------------------------------------------------------------

export async function saveCredentials(credentials: VbCredentials): Promise<void> {
  await SecureStore.setItemAsync(CREDENTIALS_KEY, JSON.stringify(credentials));
}

export async function getCredentials(): Promise<VbCredentials | null> {
  const stored = await SecureStore.getItemAsync(CREDENTIALS_KEY);
  if (!stored) return null;
  return JSON.parse(stored) as VbCredentials;
}

export async function deleteCredentials(): Promise<void> {
  await SecureStore.deleteItemAsync(CREDENTIALS_KEY);
}

// ---------------------------------------------------------------------------
// Login / Logout
// ---------------------------------------------------------------------------

/**
 * POST login credentials to Verterbukh.
 * On success sets session-active state and the native cookie store captures
 * the session cookie automatically. Throws if the response still shows the
 * login form (wrong credentials or network issue).
 */
export async function login(credentials: VbCredentials): Promise<void> {
  const params = new URLSearchParams({
    html_login: '1',
    username: credentials.username,
    password: credentials.password,
    dir: 'from',
    mode: 'html',
    tsu: 'en',
  });

  console.log('[YidDict] VerterbukAuth: attempting login');

  const response = await axios.post(BASE_URL, params.toString(), {
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  });

  if (isLoggedOut(response.data)) {
    throw new Error('Login failed — check your username and password');
  }

  startSession();
  console.log('[YidDict] VerterbukAuth: login successful');
}

/**
 * Log out: invalidate the server-side session, delete local credentials,
 * and clear in-memory session state. The server call is best-effort — local
 * state is always cleared even if the network request fails.
 */
export async function logout(): Promise<void> {
  endSession();
  await deleteCredentials();
  try {
    await axios.get(BASE_URL, { params: { page: 'logout' } });
    console.log('[YidDict] VerterbukAuth: server session invalidated');
  } catch {
    console.log('[YidDict] VerterbukAuth: server logout failed (credentials still deleted locally)');
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
