import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  StyleSheet,
} from 'react-native';
import { useTheme } from '../context/ThemeContext';
import {
  getCredentials,
  saveCredentials,
  deleteCredentials,
  login,
} from '../services/verterbukh-auth';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type LoginStatus = 'idle' | 'loading' | 'success' | 'error';

// ---------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------

export default function SettingsScreen() {
  const { theme } = useTheme();
  const s = makeStyles(theme);

  const [savedUsername, setSavedUsername] = useState<string | null>(null);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loginStatus, setLoginStatus] = useState<LoginStatus>('idle');
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  // Load saved credentials on mount to determine login state
  useEffect(() => {
    getCredentials().then(creds => {
      if (creds) setSavedUsername(creds.username);
    });
  }, []);

  const handleLogin = useCallback(async () => {
    const trimmedUser = username.trim();
    const trimmedPass = password.trim();
    if (!trimmedUser || !trimmedPass) {
      setStatusMessage('Please enter both username and password.');
      return;
    }

    setLoginStatus('loading');
    setStatusMessage(null);

    try {
      const creds = { username: trimmedUser, password: trimmedPass };
      await login(creds);
      await saveCredentials(creds);
      setSavedUsername(trimmedUser);
      setUsername('');
      setPassword('');
      setLoginStatus('success');
    } catch {
      setLoginStatus('error');
      setStatusMessage('Login failed — check your username and password.');
    }
  }, [username, password]);

  const handleLogout = useCallback(async () => {
    await deleteCredentials();
    setSavedUsername(null);
    setLoginStatus('idle');
    setStatusMessage(null);
  }, []);

  const isLoggedIn = savedUsername !== null;

  return (
    <ScrollView
      style={{ backgroundColor: theme.background }}
      contentContainerStyle={s.scrollContent}
      testID="settings-root"
    >
      {/* Verterbukh Login — active */}
      <SectionHeader label="Verterbukh Login" theme={theme} />
      <View style={[s.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
        {isLoggedIn ? (
          <>
            <Text style={[s.statusLine, { color: theme.text }]} testID="logged-in-status">
              Logged in as{' '}
              <Text style={{ fontWeight: '700' }}>{savedUsername}</Text>
            </Text>
            <TouchableOpacity
              style={[s.button, s.logoutButton]}
              onPress={handleLogout}
              testID="logout-button"
            >
              <Text style={s.logoutButtonText}>Logout</Text>
            </TouchableOpacity>
          </>
        ) : (
          <>
            <TextInput
              style={[s.input, { borderColor: theme.border, color: theme.text, backgroundColor: theme.background }]}
              placeholder="Username"
              placeholderTextColor={theme.textSecondary}
              value={username}
              onChangeText={setUsername}
              autoCorrect={false}
              autoCapitalize="none"
              testID="username-input"
            />
            <TextInput
              style={[s.input, { borderColor: theme.border, color: theme.text, backgroundColor: theme.background }]}
              placeholder="Password"
              placeholderTextColor={theme.textSecondary}
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              testID="password-input"
            />
            {loginStatus === 'loading' ? (
              <ActivityIndicator color={theme.primary} style={s.spinner} testID="login-loading" />
            ) : (
              <TouchableOpacity
                style={[s.button, { backgroundColor: theme.primary }]}
                onPress={handleLogin}
                testID="login-button"
              >
                <Text style={[s.buttonText, { color: theme.background }]}>Login</Text>
              </TouchableOpacity>
            )}
          </>
        )}
        {statusMessage ? (
          <Text
            style={[s.statusMessage, { color: loginStatus === 'error' ? theme.sourceVerterbukh : theme.sourceGoogle }]}
            testID="status-message"
          >
            {statusMessage}
          </Text>
        ) : null}
      </View>

      {/* Placeholder sections */}
      <SectionHeader label="Search Preferences" theme={theme} />
      <PlaceholderRow label="Search Preferences" theme={theme} />

      <SectionHeader label="Appearance" theme={theme} />
      <PlaceholderRow label="Appearance" theme={theme} />

      <SectionHeader label="Language" theme={theme} />
      <PlaceholderRow label="Language" theme={theme} />

      <SectionHeader label="Security" theme={theme} />
      <PlaceholderRow label="Security" theme={theme} />
    </ScrollView>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function SectionHeader({ label, theme }: { label: string; theme: ReturnType<typeof useTheme>['theme'] }) {
  return (
    <Text style={[sectionHeaderStyle, { color: theme.textSecondary }]}>
      {label.toUpperCase()}
    </Text>
  );
}

const sectionHeaderStyle: object = {
  fontSize: 11,
  fontWeight: '600',
  letterSpacing: 0.8,
  marginTop: 24,
  marginBottom: 6,
  marginHorizontal: 16,
};

function PlaceholderRow({ label, theme }: { label: string; theme: ReturnType<typeof useTheme>['theme'] }) {
  return (
    <View style={[settingsRowStyle, { backgroundColor: theme.surface, borderColor: theme.border }]}>
      <Text style={{ color: theme.textSecondary, fontSize: 15 }}>{label}</Text>
      <Text style={{ color: theme.textSecondary, fontSize: 13 }}>Coming soon  ›</Text>
    </View>
  );
}

const settingsRowStyle: object = {
  flexDirection: 'row',
  justifyContent: 'space-between',
  alignItems: 'center',
  paddingHorizontal: 16,
  paddingVertical: 14,
  marginHorizontal: 16,
  borderRadius: 8,
  borderWidth: 1,
};

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

function makeStyles(theme: ReturnType<typeof useTheme>['theme']) {
  return StyleSheet.create({
    scrollContent: {
      paddingBottom: 40,
    },
    card: {
      marginHorizontal: 16,
      borderRadius: 8,
      borderWidth: 1,
      padding: 16,
      gap: 12,
    },
    input: {
      height: 44,
      borderWidth: 1,
      borderRadius: 8,
      paddingHorizontal: 12,
      fontSize: 15,
    },
    button: {
      height: 44,
      borderRadius: 8,
      alignItems: 'center',
      justifyContent: 'center',
    },
    buttonText: {
      fontSize: 15,
      fontWeight: '600',
    },
    logoutButton: {
      backgroundColor: theme.sourceVerterbukh,
    },
    logoutButtonText: {
      color: theme.background,
      fontSize: 15,
      fontWeight: '600',
    },
    spinner: {
      height: 44,
    },
    statusLine: {
      fontSize: 15,
    },
    statusMessage: {
      fontSize: 13,
    },
  });
}
