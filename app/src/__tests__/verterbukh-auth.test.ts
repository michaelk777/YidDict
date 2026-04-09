/**
 * verterbukh-auth.test.ts
 *
 * Tests for credential storage, login POST, session detection, and
 * ensureSession re-auth logic. All external dependencies (expo-secure-store,
 * axios) are mocked.
 */

import * as SecureStore from 'expo-secure-store';
import axios from 'axios';
import {
  saveCredentials,
  getCredentials,
  deleteCredentials,
  login,
  isLoggedOut,
  ensureSession,
  VbCredentials,
} from '../services/verterbukh-auth';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

jest.mock('expo-secure-store');
jest.mock('axios');

const { __resetStore } = SecureStore as typeof SecureStore & { __resetStore: () => void };
const mockPost = axios.post as jest.Mock;

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const CREDS: VbCredentials = { username: 'testuser', password: 'testpass' };

const LOGGED_IN_HTML = `
  <div class="quota-box">
    <a href="?page=editUser">testuser</a>
    used 0/5 Eng.
  </div>
`;

const LOGGED_OUT_HTML = `
  <form action="vb" method="post">
    <input type="hidden" name="html_login" value="1">
    <input type="text" name="username">
    <input type="password" name="password">
  </form>
`;

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  jest.clearAllMocks();
  __resetStore();
});

// ---------------------------------------------------------------------------
// Credential storage
// ---------------------------------------------------------------------------

describe('saveCredentials', () => {
  it('serialises credentials to JSON and stores under the correct key', async () => {
    await saveCredentials(CREDS);
    expect(SecureStore.setItemAsync).toHaveBeenCalledWith(
      'vb_credentials',
      JSON.stringify(CREDS)
    );
  });
});

describe('getCredentials', () => {
  it('returns null when nothing is stored', async () => {
    expect(await getCredentials()).toBeNull();
  });

  it('returns the parsed credentials after saving', async () => {
    await saveCredentials(CREDS);
    expect(await getCredentials()).toEqual(CREDS);
  });
});

describe('deleteCredentials', () => {
  it('removes credentials from the store', async () => {
    await saveCredentials(CREDS);
    await deleteCredentials();
    expect(SecureStore.deleteItemAsync).toHaveBeenCalledWith('vb_credentials');
    expect(await getCredentials()).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// isLoggedOut
// ---------------------------------------------------------------------------

describe('isLoggedOut', () => {
  it('returns true when html_login field is present', () => {
    expect(isLoggedOut(LOGGED_OUT_HTML)).toBe(true);
  });

  it('returns true when quota-box is absent', () => {
    expect(isLoggedOut('<html><body>no quota box here</body></html>')).toBe(true);
  });

  it('returns false when quota-box is present and no login form', () => {
    expect(isLoggedOut(LOGGED_IN_HTML)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// login
// ---------------------------------------------------------------------------

describe('login', () => {
  it('POSTs to the correct endpoint with all required fields', async () => {
    mockPost.mockResolvedValue({ data: LOGGED_IN_HTML });
    await login(CREDS);

    expect(mockPost).toHaveBeenCalledTimes(1);
    const [url, body, config] = mockPost.mock.calls[0];
    expect(url).toBe('https://verterbukh.org/vb');
    expect(config.headers['Content-Type']).toBe('application/x-www-form-urlencoded');

    const params = new URLSearchParams(body as string);
    expect(params.get('html_login')).toBe('1');
    expect(params.get('username')).toBe(CREDS.username);
    expect(params.get('password')).toBe(CREDS.password);
    expect(params.get('dir')).toBe('from');
    expect(params.get('mode')).toBe('html');
    expect(params.get('tsu')).toBe('en');
  });

  it('resolves without throwing on a successful login', async () => {
    mockPost.mockResolvedValue({ data: LOGGED_IN_HTML });
    await expect(login(CREDS)).resolves.toBeUndefined();
  });

  it('throws when the response still shows the login form', async () => {
    mockPost.mockResolvedValue({ data: LOGGED_OUT_HTML });
    await expect(login(CREDS)).rejects.toThrow('Login failed');
  });

  it('throws when axios itself throws (network error)', async () => {
    mockPost.mockRejectedValue(new Error('Network Error'));
    await expect(login(CREDS)).rejects.toThrow('Network Error');
  });
});

// ---------------------------------------------------------------------------
// ensureSession
// ---------------------------------------------------------------------------

describe('ensureSession', () => {
  it('does nothing when lastResponseHtml shows a valid session', async () => {
    await ensureSession(LOGGED_IN_HTML);
    expect(mockPost).not.toHaveBeenCalled();
  });

  it('re-authenticates when lastResponseHtml shows session expired', async () => {
    await saveCredentials(CREDS);
    mockPost.mockResolvedValue({ data: LOGGED_IN_HTML });
    await ensureSession(LOGGED_OUT_HTML);
    expect(mockPost).toHaveBeenCalledTimes(1);
  });

  it('re-authenticates when called with no lastResponseHtml', async () => {
    await saveCredentials(CREDS);
    mockPost.mockResolvedValue({ data: LOGGED_IN_HTML });
    await ensureSession();
    expect(mockPost).toHaveBeenCalledTimes(1);
  });

  it('throws when session is expired and no credentials are stored', async () => {
    await expect(ensureSession(LOGGED_OUT_HTML)).rejects.toThrow('credentials not saved');
  });

  it('throws when session is expired and login fails', async () => {
    await saveCredentials(CREDS);
    mockPost.mockResolvedValue({ data: LOGGED_OUT_HTML });
    await expect(ensureSession(LOGGED_OUT_HTML)).rejects.toThrow('Login failed');
  });
});
