/**
 * verterbukh-auth.test.ts
 *
 * Tests for credential storage, login/logout, session detection, and
 * ensureSession re-auth logic. All external dependencies (expo-secure-store,
 * axios) are mocked.
 */

import * as SecureStore from 'expo-secure-store';
import axios from 'axios';
import {
  saveCredentials,
  getCredentials,
  deleteCredentials,
  setInMemoryCredentials,
  initAuth,
  login,
  logout,
  isLoggedOut,
  parseVerterbukhQuota,
  ensureSession,
  startSession,
  endSession,
  hasActiveSession,
  __resetSessionState,
  VerterbukhCredentials,
} from '../services/verterbukh-auth';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

jest.mock('expo-secure-store');
jest.mock('axios');

const { __resetStore } = SecureStore as typeof SecureStore & { __resetStore: () => void };
const mockPost = axios.post as jest.Mock;
const mockGet = axios.get as jest.Mock;

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const CREDS: VerterbukhCredentials = { username: 'testuser', password: 'testpass' };

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
  __resetSessionState();
});

// ---------------------------------------------------------------------------
// Credential storage
// ---------------------------------------------------------------------------

describe('saveCredentials', () => {
  it('serialises credentials to JSON and stores under the correct key', async () => {
    await saveCredentials(CREDS);
    expect(SecureStore.setItemAsync).toHaveBeenCalledWith(
      'verterbukh_credentials',
      JSON.stringify(CREDS)
    );
  });
});

describe('getCredentials', () => {
  it('returns null when nothing is stored and no in-memory credentials', async () => {
    expect(await getCredentials()).toBeNull();
  });

  it('returns the parsed credentials after saving to SecureStore', async () => {
    await saveCredentials(CREDS);
    expect(await getCredentials()).toEqual(CREDS);
  });

  it('returns in-memory credentials when SecureStore is empty', async () => {
    setInMemoryCredentials(CREDS);
    expect(await getCredentials()).toEqual(CREDS);
  });

  it('prefers SecureStore credentials over in-memory', async () => {
    const persistedCreds = { username: 'persisted', password: 'p1' };
    const memCreds = { username: 'inmemory', password: 'p2' };
    await saveCredentials(persistedCreds);
    setInMemoryCredentials(memCreds);
    expect(await getCredentials()).toEqual(persistedCreds);
  });
});

describe('deleteCredentials', () => {
  it('removes credentials from the store', async () => {
    await saveCredentials(CREDS);
    await deleteCredentials();
    expect(SecureStore.deleteItemAsync).toHaveBeenCalledWith('verterbukh_credentials');
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

describe('parseVerterbukhQuota', () => {
  it('parses "used X/Y" out of the quota-box', () => {
    expect(parseVerterbukhQuota(LOGGED_IN_HTML)).toEqual({ used: 0, total: 5 });
  });

  it('returns null when there is no quota-box', () => {
    expect(parseVerterbukhQuota(LOGGED_OUT_HTML)).toBeNull();
  });

  it('returns null when the quota-box text does not match "used X/Y"', () => {
    expect(parseVerterbukhQuota('<div class="quota-box">no number here</div>')).toBeNull();
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

  it('returns the quota parsed from the login response itself, without throwing', async () => {
    mockPost.mockResolvedValue({ data: LOGGED_IN_HTML });
    await expect(login(CREDS)).resolves.toEqual({ used: 0, total: 5 });
  });

  it('returns null when the response has no quota box', async () => {
    mockPost.mockResolvedValue({ data: '<div class="quota-box"></div>' });
    await expect(login(CREDS)).resolves.toBeNull();
  });

  it('throws when the response still shows the login form', async () => {
    mockPost.mockResolvedValue({ data: LOGGED_OUT_HTML });
    await expect(login(CREDS)).rejects.toThrow('Login failed');
  });

  it('throws when axios itself throws (network error)', async () => {
    mockPost.mockRejectedValue(new Error('Network Error'));
    await expect(login(CREDS)).rejects.toThrow('Network Error');
  });

  it('does not include credentials in the error message', async () => {
    mockPost.mockResolvedValue({ data: LOGGED_OUT_HTML });
    await expect(login(CREDS)).rejects.toThrow(
      expect.not.stringContaining(CREDS.password)
    );
  });
});

// ---------------------------------------------------------------------------
// logout
// ---------------------------------------------------------------------------

describe('logout', () => {
  it('deletes credentials and ends the session', async () => {
    await saveCredentials(CREDS);
    startSession();
    mockGet.mockResolvedValue({});
    await logout();
    expect(await getCredentials()).toBeNull();
  });

  it('calls the server logout endpoint', async () => {
    mockGet.mockResolvedValue({});
    await logout();
    expect(mockGet).toHaveBeenCalledWith(
      'https://verterbukh.org/vb',
      { params: { page: 'logout' } }
    );
  });

  it('still clears local state even when the server logout request fails', async () => {
    await saveCredentials(CREDS);
    startSession();
    mockGet.mockRejectedValue(new Error('Network Error'));
    await expect(logout()).resolves.toBeUndefined();
    expect(await getCredentials()).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// ensureSession — keepLoggedIn=true (indefinite mode)
// ---------------------------------------------------------------------------

describe('ensureSession (keepLoggedIn=true)', () => {
  it('does nothing when lastResponseHtml shows a valid session', async () => {
    await ensureSession(LOGGED_IN_HTML, true);
    expect(mockPost).not.toHaveBeenCalled();
  });

  it('re-authenticates when lastResponseHtml shows session expired', async () => {
    await saveCredentials(CREDS);
    mockPost.mockResolvedValue({ data: LOGGED_IN_HTML });
    await ensureSession(LOGGED_OUT_HTML, true);
    expect(mockPost).toHaveBeenCalledTimes(1);
  });

  it('re-authenticates when called with no lastResponseHtml', async () => {
    await saveCredentials(CREDS);
    mockPost.mockResolvedValue({ data: LOGGED_IN_HTML });
    await ensureSession(undefined, true);
    expect(mockPost).toHaveBeenCalledTimes(1);
  });

  it('throws when session is expired and no credentials are stored', async () => {
    await expect(ensureSession(LOGGED_OUT_HTML, true)).rejects.toThrow('credentials not saved');
  });

  it('throws when session is expired and login fails', async () => {
    await saveCredentials(CREDS);
    mockPost.mockResolvedValue({ data: LOGGED_OUT_HTML });
    await expect(ensureSession(LOGGED_OUT_HTML, true)).rejects.toThrow('Login failed');
  });
});

// ---------------------------------------------------------------------------
// ensureSession — keepLoggedIn=false (short-term mode, default)
// ---------------------------------------------------------------------------

describe('ensureSession (keepLoggedIn=false)', () => {
  it('throws immediately when no login has occurred this app instance', async () => {
    await saveCredentials(CREDS);
    await expect(ensureSession(LOGGED_IN_HTML)).rejects.toThrow('Not logged in');
  });

  it('does nothing when session is active and HTML shows valid session', async () => {
    startSession();
    await ensureSession(LOGGED_IN_HTML);
    expect(mockPost).not.toHaveBeenCalled();
  });

  it('re-authenticates mid-session when HTTP cookie expires', async () => {
    startSession();
    await saveCredentials(CREDS);
    mockPost.mockResolvedValue({ data: LOGGED_IN_HTML });
    await ensureSession(LOGGED_OUT_HTML);
    expect(mockPost).toHaveBeenCalledTimes(1);
  });

  it('throws when session is older than 24 hours', async () => {
    startSession();
    // Backdate the session start by 25 hours
    jest.spyOn(Date, 'now').mockReturnValue(Date.now() + 25 * 60 * 60 * 1000);
    await expect(ensureSession(LOGGED_IN_HTML)).rejects.toThrow('Session expired after 24 hours');
    (Date.now as jest.Mock).mockRestore?.();
    jest.restoreAllMocks();
  });

  it('clears session state when 24h expiry is triggered', async () => {
    startSession();
    jest.spyOn(Date, 'now').mockReturnValue(Date.now() + 25 * 60 * 60 * 1000);
    await expect(ensureSession(LOGGED_IN_HTML)).rejects.toThrow();
    jest.restoreAllMocks();
    // A subsequent call should also fail (session is now ended)
    await expect(ensureSession(LOGGED_IN_HTML)).rejects.toThrow('Not logged in');
  });

  it('throws when session is active but no credentials are stored (for HTTP re-auth)', async () => {
    startSession();
    await expect(ensureSession(LOGGED_OUT_HTML)).rejects.toThrow('credentials not saved');
  });
});

// ---------------------------------------------------------------------------
// startSession / endSession
// ---------------------------------------------------------------------------

describe('startSession / endSession', () => {
  it('endSession prevents ensureSession from proceeding', async () => {
    startSession();
    endSession();
    await expect(ensureSession(LOGGED_IN_HTML)).rejects.toThrow('Not logged in');
  });
});

// ---------------------------------------------------------------------------
// hasActiveSession
// ---------------------------------------------------------------------------

describe('hasActiveSession', () => {
  it('returns false when keepLoggedIn is true but no credentials persisted and no active session', () => {
    expect(hasActiveSession(true)).toBe(false);
  });

  it('returns true when keepLoggedIn is true and credentials are persisted in SecureStore', async () => {
    await saveCredentials(CREDS);
    expect(hasActiveSession(true)).toBe(true);
  });

  it('returns true when keepLoggedIn is true and an active session exists this instance', () => {
    startSession();
    expect(hasActiveSession(true)).toBe(true);
  });

  it('returns false when keepLoggedIn is false and no login has occurred this instance', () => {
    expect(hasActiveSession(false)).toBe(false);
  });

  it('returns true when keepLoggedIn is false but login occurred this instance and is within 24h', () => {
    startSession();
    expect(hasActiveSession(false)).toBe(true);
  });

  it('returns false after endSession even if keepLoggedIn is false', () => {
    startSession();
    endSession();
    expect(hasActiveSession(false)).toBe(false);
  });

  it('returns false when keepLoggedIn is false and the 24h window has elapsed', () => {
    const realNow = Date.now;
    Date.now = () => 1000;
    startSession();
    Date.now = () => 1000 + 24 * 60 * 60 * 1000 + 1;
    expect(hasActiveSession(false)).toBe(false);
    Date.now = realNow;
  });
});

describe('initAuth', () => {
  it('sets credentialsPersisted to true when SecureStore has credentials', async () => {
    await saveCredentials(CREDS);
    // Reset the flag (simulates app restart after saveCredentials ran in a prev session)
    __resetSessionState();
    expect(hasActiveSession(true)).toBe(false); // flag is cleared
    await initAuth();
    expect(hasActiveSession(true)).toBe(true);  // flag restored from SecureStore
  });

  it('leaves credentialsPersisted false when SecureStore is empty', async () => {
    await initAuth();
    expect(hasActiveSession(true)).toBe(false);
  });
});
