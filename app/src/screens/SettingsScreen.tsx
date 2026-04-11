import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Modal,
  Pressable,
  Alert,
  StyleSheet,
} from 'react-native';
import { useTheme } from '../context/ThemeContext';
import {
  getCredentials,
  saveCredentials,
  deleteCredentials,
  login,
} from '../services/verterbukh-auth';
import {
  getSourceOrder,
  setSourceOrderSlot,
  availableOptionsForSlot,
  SOURCE_LABELS,
  SourceSlot,
  SlotIndex,
} from '../db/settingsDb';

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

  // Verterbukh login state
  const [savedUsername, setSavedUsername] = useState<string | null>(null);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loginStatus, setLoginStatus] = useState<LoginStatus>('idle');
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  // Source order state
  const [sourceOrder, setSourceOrder] = useState<SourceSlot[]>(['finkel', 'verterbukh', 'google_translate']);
  const [pickerSlot, setPickerSlot] = useState<SlotIndex | null>(null);

  // Load both credential state and source preferences on mount
  useEffect(() => {
    getCredentials().then(creds => {
      if (creds) setSavedUsername(creds.username);
    });
    getSourceOrder()
      .then(order => setSourceOrder(order))
      .catch(() => { /* DB not ready — keep defaults */ });
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

  const handlePickerSelect = useCallback(async (value: SourceSlot) => {
    if (pickerSlot === null) return;
    const updated = [...sourceOrder] as SourceSlot[];
    updated[pickerSlot - 1] = value;
    setSourceOrder(updated);
    setPickerSlot(null);
    try {
      await setSourceOrderSlot(pickerSlot, value);
    } catch {
      // Revert local state if DB write fails
      setSourceOrder(sourceOrder);
    }
  }, [pickerSlot, sourceOrder]);

  const isLoggedIn = savedUsername !== null;
  const pickerOptions = pickerSlot !== null ? availableOptionsForSlot(sourceOrder, pickerSlot) : [];

  return (
    <ScrollView
      style={{ backgroundColor: theme.background }}
      contentContainerStyle={s.scrollContent}
      testID="settings-root"
    >
      {/* Search Preferences — active */}
      <SectionHeader label="Search Preferences" theme={theme} />
      <View style={[s.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
        {([1, 2, 3] as SlotIndex[]).map(slot => (
          <SourceOrderRow
            key={slot}
            slot={slot}
            value={sourceOrder[slot - 1] ?? 'none'}
            theme={theme}
            onPress={() => setPickerSlot(slot)}
          />
        ))}
      </View>

      {/* Option picker modal */}
      <Modal
        visible={pickerSlot !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setPickerSlot(null)}
        testID="source-picker-modal"
      >
        <Pressable style={s.modalOverlay} onPress={() => setPickerSlot(null)}>
          <Pressable style={[s.modalCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
            <Text style={[s.modalTitle, { color: theme.text }]}>
              {pickerSlot !== null ? `Position ${pickerSlot}` : ''}
            </Text>
            {pickerOptions.map(option => {
              const locked = option === 'verterbukh' && !isLoggedIn;
              return (
                <TouchableOpacity
                  key={option}
                  style={[
                    s.modalOption,
                    option === sourceOrder[(pickerSlot ?? 1) - 1] && { backgroundColor: theme.primary + '22' },
                    locked && { opacity: 0.45 },
                  ]}
                  onPress={() => {
                    if (locked) {
                      Alert.alert(
                        'Login Required',
                        'You must be logged in to Verterbukh before adding it to your search order. Add your credentials in the Verterbukh Login section.',
                      );
                      return;
                    }
                    handlePickerSelect(option);
                  }}
                  testID={`picker-option-${option}`}
                >
                  <Text style={[s.modalOptionText, { color: theme.text }]}>
                    {SOURCE_LABELS[option]}
                  </Text>
                  {option === 'verterbukh' ? (
                    <Text style={[s.modalOptionSub, { color: theme.textSecondary }]}>
                      {locked ? 'login required' : 'pay per result'}
                    </Text>
                  ) : null}
                </TouchableOpacity>
              );
            })}
          </Pressable>
        </Pressable>
      </Modal>

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
// Source order row
// ---------------------------------------------------------------------------

interface SourceOrderRowProps {
  slot: SlotIndex;
  value: SourceSlot;
  theme: ReturnType<typeof useTheme>['theme'];
  onPress: () => void;
}

function SourceOrderRow({ slot, value, theme, onPress }: SourceOrderRowProps) {
  return (
    <TouchableOpacity
      style={[sourceRowStyle, { borderBottomColor: theme.border }]}
      onPress={onPress}
      testID={`source-order-row-${slot}`}
    >
      <View style={sourceRowLabelWrap}>
        <Text style={[sourceRowPosition, { color: theme.textSecondary }]}>{slot}</Text>
        <View>
          <Text style={[sourceRowName, { color: theme.text }]}>
            {SOURCE_LABELS[value]}
          </Text>
          {value === 'verterbukh' ? (
            <Text style={[sourceRowSub, { color: theme.textSecondary }]}>
              pay per result
            </Text>
          ) : null}
        </View>
      </View>
      <Text style={[sourceRowChevron, { color: theme.textSecondary }]}>›</Text>
    </TouchableOpacity>
  );
}

const sourceRowStyle: object = {
  flexDirection: 'row',
  alignItems: 'center',
  justifyContent: 'space-between',
  paddingVertical: 12,
  borderBottomWidth: StyleSheet.hairlineWidth,
};

const sourceRowLabelWrap: object = {
  flexDirection: 'row',
  alignItems: 'center',
  gap: 14,
};

const sourceRowPosition: object = {
  fontSize: 13,
  fontWeight: '600',
  width: 16,
  textAlign: 'center',
};

const sourceRowName: object = {
  fontSize: 15,
};

const sourceRowSub: object = {
  fontSize: 11,
  marginTop: 1,
};

const sourceRowChevron: object = {
  fontSize: 20,
  lineHeight: 24,
};

// ---------------------------------------------------------------------------
// Sub-components (shared)
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
      paddingHorizontal: 16,
      paddingVertical: 4,
      gap: 0,
    },
    input: {
      height: 44,
      borderWidth: 1,
      borderRadius: 8,
      paddingHorizontal: 12,
      fontSize: 15,
      marginVertical: 6,
    },
    button: {
      height: 44,
      borderRadius: 8,
      alignItems: 'center',
      justifyContent: 'center',
      marginVertical: 6,
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
      marginVertical: 6,
    },
    statusLine: {
      fontSize: 15,
      paddingVertical: 6,
    },
    statusMessage: {
      fontSize: 13,
      paddingBottom: 6,
    },
    // Modal
    modalOverlay: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.4)',
      justifyContent: 'center',
      alignItems: 'center',
    },
    modalCard: {
      width: 280,
      borderRadius: 12,
      borderWidth: 1,
      overflow: 'hidden',
    },
    modalTitle: {
      fontSize: 13,
      fontWeight: '600',
      letterSpacing: 0.5,
      paddingHorizontal: 16,
      paddingTop: 14,
      paddingBottom: 8,
    },
    modalOption: {
      paddingHorizontal: 16,
      paddingVertical: 12,
    },
    modalOptionText: {
      fontSize: 16,
    },
    modalOptionSub: {
      fontSize: 11,
      marginTop: 2,
    },
  });
}
