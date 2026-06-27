import React, { useState, useEffect, useCallback } from 'react';
import { useFocusEffect } from '@react-navigation/native';
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
  Switch,
  StyleSheet,
} from 'react-native';
import { useTheme } from '../context/ThemeContext';
import { Ionicons } from '@expo/vector-icons';
import {
  getCredentials,
  saveCredentials,
  login,
  logout,
  startSession,
  hasActiveSession,
} from '../services/verterbukh-auth';
import {
  getSourceOrder,
  setSourceOrderSlot,
  availableOptionsForSlot,
  SOURCE_LABELS,
  SourceSlot,
  SlotIndex,
  getMaxSavedEntries,
  setMaxSavedEntries,
  getLowTokenThreshold,
  setLowTokenThreshold,
  getCacheTtlDays,
  setCacheTtlDays,
  setThemePreference,
  getUseAllSources,
  setUseAllSources,
  getYivoToHebrew,
  setYivoToHebrew,
  getYivoToHebrewWarned,
  setYivoToHebrewWarned,
  getHebrewToYivo,
  setHebrewToYivo,
  getHebrewToYivoWarned,
  setHebrewToYivoWarned,
  getVerterbukhQuota,
  getVbKeepLoggedIn,
  setVbKeepLoggedIn,
} from '../db/settingsDb';
import { clearCache } from '../db/cacheDb';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type LoginStatus = 'idle' | 'loading' | 'success' | 'error';

// ---------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------

export default function SettingsScreen() {
  const { theme, schemeOverride, setColorScheme } = useTheme();
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
  const [useAllSources, setUseAllSourcesState] = useState(false);

  // Numeric settings state
  const [maxSavedEntries, setMaxSavedEntriesState] = useState(500);
  const [lowTokenThreshold, setLowTokenThresholdState] = useState(90);
  const [cacheTtlDays, setCacheTtlDaysState] = useState(90);

  // Experimental settings state
  const [yivoToHebrew, setYivoToHebrewState] = useState(false);
  const [hebrewToYivo, setHebrewToYivoState] = useState(false);

  // Keep-logged-in preference
  const [keepLoggedIn, setKeepLoggedInState] = useState(false);

  // Last-known Verterbukh quota (persisted after each search)
  const [verterbukhQuota, setVerterbukhQuotaState] = useState<{ used: number; total: number } | null>(null);

  // Load all settings on mount
  useEffect(() => {
    getCredentials().then(creds => {
      if (creds) setSavedUsername(creds.username);
    });
    getSourceOrder()
      .then(order => setSourceOrder(order))
      .catch(() => { /* DB not ready — keep defaults */ });
    getMaxSavedEntries().then(setMaxSavedEntriesState).catch(() => {});
    getLowTokenThreshold().then(setLowTokenThresholdState).catch(() => {});
    getCacheTtlDays().then(setCacheTtlDaysState).catch(() => {});
    getUseAllSources().then(setUseAllSourcesState).catch(() => {});
    getYivoToHebrew().then(setYivoToHebrewState).catch(() => {});
    getHebrewToYivo().then(setHebrewToYivoState).catch(() => {});
    getVbKeepLoggedIn().then(setKeepLoggedInState).catch(() => {});
    getVerterbukhQuota().then(setVerterbukhQuotaState).catch(() => {});
  }, []);

  // Re-read quota whenever the Settings tab comes into focus so the sub-label
  // reflects the most recent Verterbukh result without needing an app restart.
  useFocusEffect(
    useCallback(() => {
      getVerterbukhQuota().then(setVerterbukhQuotaState).catch(() => {});
    }, [])
  );

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
    await logout();
    setSavedUsername(null);
    setLoginStatus('idle');
    setStatusMessage(null);
  }, []);

  const handleToggleKeepLoggedIn = useCallback(async (value: boolean) => {
    setKeepLoggedInState(value);
    await setVbKeepLoggedIn(value).catch(() => {});
    if (!value && savedUsername !== null) {
      // Switching to short-term mode while logged in: start the 24h timer now.
      startSession();
    }
  }, [savedUsername]);

  const handleSaveMaxEntries = useCallback(async (value: number) => {
    setMaxSavedEntriesState(value);
    await setMaxSavedEntries(value).catch(() => {});
  }, []);

  const handleSaveLowTokenThreshold = useCallback(async (value: number) => {
    setLowTokenThresholdState(value);
    await setLowTokenThreshold(value).catch(() => {});
  }, []);

  const handleSaveCacheTtlDays = useCallback(async (value: number) => {
    setCacheTtlDaysState(value);
    await setCacheTtlDays(value).catch(() => {});
  }, []);

  const handleClearCache = useCallback(() => {
    Alert.alert(
      'Clear Cache',
      'This will remove all cached search results. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Continue',
          style: 'destructive',
          onPress: async () => {
            await clearCache().catch(() => {});
          },
        },
      ]
    );
  }, []);

  const handleToggleUseAllSources = useCallback(async (value: boolean) => {
    setUseAllSourcesState(value);
    await setUseAllSources(value).catch(() => {});
  }, []);

  const handleToggleYivoToHebrew = useCallback(async (value: boolean) => {
    setYivoToHebrewState(value);
    await setYivoToHebrew(value).catch(() => {});
    if (value) {
      const warned = await getYivoToHebrewWarned().catch(() => false);
      if (!warned) {
        Alert.alert(
          'Experimental Feature',
          'YIVO romanization → Hebrew script conversion is rule-based and may produce inaccurate results, especially for loshn-koydesh (Hebrew/Aramaic-origin) words. Auto-generated entries are marked with ~ (as in \'~word~\').',
        );
        await setYivoToHebrewWarned().catch(() => {});
      }
    }
  }, []);

  const handleToggleHebrewToYivo = useCallback(async (value: boolean) => {
    setHebrewToYivoState(value);
    await setHebrewToYivo(value).catch(() => {});
    if (value) {
      const warned = await getHebrewToYivoWarned().catch(() => false);
      if (!warned) {
        Alert.alert(
          'Experimental Feature',
          'Hebrew script → YIVO romanization conversion is rule-based and may produce inaccurate results, especially for loshn-koydesh (Hebrew/Aramaic-origin) words. Auto-generated entries are marked with ~ (as in \'~word~\').',
        );
        await setHebrewToYivoWarned().catch(() => {});
      }
    }
  }, []);

  const handleSelectTheme = useCallback(async (value: 'system' | 'light' | 'dark') => {
    setColorScheme(value);
    await setThemePreference(value).catch(() => {});
  }, [setColorScheme]);

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

  const isLoggedIn = savedUsername !== null && hasActiveSession(keepLoggedIn);
  const pickerOptions = pickerSlot !== null ? availableOptionsForSlot(sourceOrder, pickerSlot) : [];

  return (
    <ScrollView
      style={{ backgroundColor: theme.background }}
      contentContainerStyle={s.scrollContent}
      testID="settings-root"
    >
      {/* Search Source Order */}
      <SectionHeader label="Search Source Order" theme={theme} />
      <View style={[s.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
        {([1, 2, 3] as SlotIndex[]).map(slot => (
          <SourceOrderRow
            key={slot}
            slot={slot}
            value={sourceOrder[slot - 1] ?? 'none'}
            isLoggedIn={isLoggedIn}
            quota={verterbukhQuota}
            theme={theme}
            onPress={() => setPickerSlot(slot)}
          />
        ))}
        <View style={[s.toggleRow, { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.border }]}>
          <Text style={[s.toggleLabel, { color: theme.text }]}>Use all sources</Text>
          <Switch
            value={useAllSources}
            onValueChange={handleToggleUseAllSources}
            trackColor={{ false: theme.textSecondary, true: theme.primary }}
            thumbColor="#FFFFFF"
            testID="use-all-sources-toggle"
          />
        </View>
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
                  {option === 'verterbukh' && (locked || verterbukhQuota) ? (
                    <Text style={[s.modalOptionSub, { color: theme.textSecondary }]}>
                      {locked ? 'Log in to access' : `pay per result · ${verterbukhQuota!.used}/${verterbukhQuota!.total} tokens`}
                    </Text>
                  ) : null}
                </TouchableOpacity>
              );
            })}
          </Pressable>
        </Pressable>
      </Modal>

      {/* Verterbukh Settings */}
      <SectionHeader label="Verterbukh Settings" theme={theme} />
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
        <View style={[s.toggleRow, { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.border }]}>
          <View style={{ flex: 1, paddingRight: 12 }}>
            <Text style={[s.toggleLabel, { color: theme.text }]}>Keep me logged in</Text>
            <Text style={[s.numericHint, { color: theme.textSecondary, marginTop: 2 }]}>
              When off, session ends after 24 hours or when the app is fully closed.
            </Text>
          </View>
          <Switch
            value={keepLoggedIn}
            onValueChange={handleToggleKeepLoggedIn}
            trackColor={{ false: theme.textSecondary, true: theme.primary }}
            thumbColor="#FFFFFF"
            testID="keep-logged-in-toggle"
          />
        </View>
        <NumericSettingRow
          label="Token usage alert"
          value={lowTokenThreshold}
          suffix="%"
          min={1}
          max={99}
          inputWidth={40}
          onSave={handleSaveLowTokenThreshold}
          theme={theme}
          s={s}
          testID="low-token-threshold-input"
        />
      </View>

      {/* Saved Entries */}
      <SectionHeader label="Saved Entries" theme={theme} />
      <View style={[s.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
        <NumericSettingRow
          label="Max saved entries"
          value={maxSavedEntries}
          min={10}
          max={10000}
          inputWidth={64}
          onSave={handleSaveMaxEntries}
          theme={theme}
          s={s}
          testID="max-saved-entries-input"
          showDivider={false}
        />
      </View>

      {/* Cache */}
      <SectionHeader label="Cache" theme={theme} />
      <View style={[s.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
        <NumericSettingRow
          label="Cache duration"
          value={cacheTtlDays}
          suffix="days"
          min={1}
          max={365}
          inputWidth={48}
          onSave={handleSaveCacheTtlDays}
          theme={theme}
          s={s}
          testID="cache-ttl-days-input"
          showDivider={false}
        />
        <View style={[s.actionRow, { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.border }]}>
          <View style={s.numericLabelWrap}>
            <Text style={[s.numericLabel, { color: theme.text }]}>Clear cache</Text>
            <Text style={[s.numericHint, { color: theme.textSecondary }]}>Remove all cached search results</Text>
          </View>
          <TouchableOpacity
            style={[s.destructiveButton, { backgroundColor: theme.sourceVerterbukh }]}
            onPress={handleClearCache}
            testID="clear-cache-button"
          >
            <Text style={[s.destructiveButtonText, { color: theme.background }]}>Clear</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Appearance */}
      <SectionHeader label="Appearance" theme={theme} />
      <View style={[s.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
        {([
          { value: 'system', label: 'System default' },
          { value: 'dark',   label: 'Dark' },
          { value: 'light',  label: 'Light' },
        ] as { value: 'system' | 'light' | 'dark'; label: string }[]).map(({ value, label }, i) => (
          <TouchableOpacity
            key={value}
            style={[s.themeRow, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.border }]}
            onPress={() => handleSelectTheme(value)}
            testID={`theme-option-${value}`}
          >
            <Text style={[s.themeRowLabel, { color: theme.text }]}>{label}</Text>
            <Ionicons
              name={schemeOverride === value ? 'checkmark-circle' : 'ellipse-outline'}
              size={22}
              color={schemeOverride === value ? theme.primary : theme.textSecondary}
            />
          </TouchableOpacity>
        ))}
      </View>

      <SectionHeader label="Language" theme={theme} />
      <PlaceholderRow label="Language" theme={theme} />

      <SectionHeader label="Security" theme={theme} />
      <PlaceholderRow label="Security" theme={theme} />

      {/* Experimental */}
      <SectionHeader label="Experimental" theme={theme} />
      <View style={[s.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
        <View style={s.toggleRow}>
          <View style={{ flex: 1, paddingRight: 12 }}>
            <Text style={[s.toggleLabel, { color: theme.text }]}>
              YIVO romanization → Hebrew script
            </Text>
            <Text style={[s.numericHint, { color: theme.textSecondary, marginTop: 2 }]}>
              Auto-generates Hebrew for entries that lack it. Results marked with ~ (as in '~word~').
            </Text>
          </View>
          <Switch
            value={yivoToHebrew}
            onValueChange={handleToggleYivoToHebrew}
            trackColor={{ false: theme.textSecondary, true: theme.primary }}
            thumbColor="#FFFFFF"
            testID="yivo-to-hebrew-toggle"
          />
        </View>
        <View style={[s.toggleRow, { borderTopWidth: 1, borderTopColor: theme.border }]}>
          <View style={{ flex: 1, paddingRight: 12 }}>
            <Text style={[s.toggleLabel, { color: theme.text }]}>
              Hebrew script → YIVO romanization
            </Text>
            <Text style={[s.numericHint, { color: theme.textSecondary, marginTop: 2 }]}>
              Auto-generates YIVO for entries that lack it. Results marked with ~ (as in '~word~').
            </Text>
          </View>
          <Switch
            value={hebrewToYivo}
            onValueChange={handleToggleHebrewToYivo}
            trackColor={{ false: theme.textSecondary, true: theme.primary }}
            thumbColor="#FFFFFF"
            testID="hebrew-to-yivo-toggle"
          />
        </View>
      </View>
    </ScrollView>
  );
}

// ---------------------------------------------------------------------------
// Numeric setting row
// ---------------------------------------------------------------------------

interface NumericSettingRowProps {
  label: string;
  value: number;
  suffix?: string;
  min: number;
  max: number;
  inputWidth?: number;
  onSave: (n: number) => void;
  theme: ReturnType<typeof useTheme>['theme'];
  s: ReturnType<typeof makeStyles>;
  testID?: string;
  showDivider?: boolean;
}

function NumericSettingRow({ label, value, suffix, min, max, inputWidth, onSave, theme, s, testID, showDivider = true }: NumericSettingRowProps) {
  const [text, setText] = useState(String(value));

  useEffect(() => {
    setText(String(value));
  }, [value]);

  const commit = () => {
    const n = parseInt(text, 10);
    if (!isNaN(n) && n >= min && n <= max) {
      onSave(n);
    } else {
      setText(String(value));
    }
  };

  return (
    <View style={[s.numericRow, showDivider && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.border }]}>
      <View style={s.numericLabelWrap}>
        <Text style={[s.numericLabel, { color: theme.text }]}>{label}</Text>
        <Text style={[s.numericHint, { color: theme.textSecondary }]}>{min.toLocaleString()} – {max.toLocaleString()}</Text>
      </View>
      <View style={s.numericRight}>
        <TextInput
          style={[s.numericInput, { color: theme.text, borderColor: theme.border }, inputWidth ? { width: inputWidth } : null]}
          value={text}
          onChangeText={setText}
          onBlur={commit}
          onSubmitEditing={commit}
          keyboardType="number-pad"
          returnKeyType="done"
          selectTextOnFocus
          testID={testID}
        />
        {suffix ? (
          <View style={s.numericSuffixWrap}>
            <Text style={[s.numericSuffix, { color: theme.text }]}>{suffix}</Text>
          </View>
        ) : null}
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Source order row
// ---------------------------------------------------------------------------

interface SourceOrderRowProps {
  slot: SlotIndex;
  value: SourceSlot;
  isLoggedIn: boolean;
  quota: { used: number; total: number } | null;
  theme: ReturnType<typeof useTheme>['theme'];
  onPress: () => void;
}

function SourceOrderRow({ slot, value, isLoggedIn, quota, theme, onPress }: SourceOrderRowProps) {
  const verterbukhSub = value === 'verterbukh'
    ? (isLoggedIn
        ? (quota ? `pay per result · ${quota.used}/${quota.total} tokens` : null)
        : 'Log in to access')
    : null;

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
          {verterbukhSub ? (
            <Text style={[sourceRowSub, { color: theme.textSecondary }]}>
              {verterbukhSub}
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
  fontSize: 14,
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
    // Numeric setting row
    numericRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: 10,
    },
    numericLabelWrap: {
      flex: 1,
    },
    numericLabel: {
      fontSize: 15,
    },
    numericHint: {
      fontSize: 12,
      marginTop: 2,
    },
    numericRight: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
    },
    numericInput: {
      width: 72,
      height: 40,
      borderWidth: 1,
      borderRadius: 6,
      paddingHorizontal: 8,
      fontSize: 15,
      textAlign: 'right',
    },
    numericSuffixWrap: {
      height: 40,
      justifyContent: 'center',
    },
    numericSuffix: {
      fontSize: 15,
    },
    // Action row (e.g., clear cache)
    actionRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: 10,
    },
    destructiveButton: {
      borderRadius: 6,
      paddingHorizontal: 14,
      paddingVertical: 7,
    },
    destructiveButtonText: {
      fontSize: 14,
      fontWeight: '600',
    },
    // Toggle row (use all sources)
    toggleRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: 10,
    },
    toggleLabel: {
      fontSize: 15,
    },
    // Theme selector
    themeRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: 13,
    },
    themeRowLabel: {
      fontSize: 15,
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
