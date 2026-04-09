import * as SecureStore from 'expo-secure-store';
import axios from 'axios';

const BASE_URL = 'https://verterbukh.org/vb';
const CREDENTIALS_KEY = 'vb_credentials';

export interface VbCredentials {
  username: string;
  password: string;
}

// ---------------------------------------------------------------------------
// Credential storage
// ---------------------------------------------------------------------------

export async function saveCredentials(credentials: VbCredentials): Promise<void> {
  await SecureStore.setItemAsync(CREDENTIALS_KEY, JSON.stringify(credentials));
  console.log('[YidDict] VerterbukAuth: credentials saved');
}

export async function getCredentials(): Promise<VbCredentials | null> {
  const stored = await SecureStore.getItemAsync(CREDENTIALS_KEY);
  if (!stored) return null;
  return JSON.parse(stored) as VbCredentials;
}

export async function deleteCredentials(): Promise<void> {
  await SecureStore.deleteItemAsync(CREDENTIALS_KEY);
  console.log('[YidDict] VerterbukAuth: credentials deleted');
}

// ---------------------------------------------------------------------------
// Login
// ---------------------------------------------------------------------------

/**
 * POST login credentials to Verterbukh.
 * On success the native cookie store captures the session cookie automatically.
 * Throws if the response still shows the login form (wrong credentials).
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

  console.log('[YidDict] VerterbukAuth: login successful');
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
 * Call before every Verterbukh request.
 * Pass the HTML from the previous response (if any) — if it shows an expired
 * session, re-authenticates using stored credentials before the next request.
 * Throws if no credentials are stored or if login fails.
 */
export async function ensureSession(lastResponseHtml?: string): Promise<void> {
  if (lastResponseHtml !== undefined && !isLoggedOut(lastResponseHtml)) {
    return; // session looks valid
  }

  const credentials = await getCredentials();
  if (!credentials) {
    throw new Error('Verterbukh credentials not saved — add them in Settings');
  }

  await login(credentials);
}
