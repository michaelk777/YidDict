import React, { useState, useCallback, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
  Alert,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useTheme } from '../context/ThemeContext';
import { lookupFinkel, FinkelEntry } from '../services/finkelService';
import { lookupVerterbukh, VerterbukEntry, VerterbukChoice, VerterbukQuota } from '../services/verterbukh-service';
import { getCredentials } from '../services/verterbukh-auth';
import { getCachedEntries, saveToCache, logSearchHistory } from '../db/cacheDb';
import { detectInputScript } from '../utils/inputDetector';
import { getSourceOrder, DictSource, SOURCE_LABELS } from '../db/settingsDb';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function verterbukToFinkelEntry(v: VerterbukEntry): FinkelEntry {
  return {
    yiddishHebrew: v.yiddishHebrew,
    yiddishRomanized: v.yiddishRomanized,
    english: v.english,
    partOfSpeech: v.partOfSpeech,
    conjugationInfo: v.grammaticalInfo,
    isPhrase: false,
  };
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function SearchScreen() {
  const { theme } = useTheme();
  const [query, setQuery] = useState('');
  const [entries, setEntries] = useState<FinkelEntry[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fromCache, setFromCache] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [resultSource, setResultSource] = useState<DictSource | null>(null);
  // Verterbukh "other options" — alternatives to the auto-selected result.
  // These can coexist with entries (server returns both in the same response).
  const [otherOptions, setOtherOptions] = useState<VerterbukChoice[] | null>(null);
  const [verterbukQuota, setVerterbukQuota] = useState<VerterbukQuota | null>(null);
  const [fallbackNote, setFallbackNote] = useState<string | null>(null);

  // Session-scoped exhaustion tracking. A useRef so updates don't trigger re-renders.
  const verterbukExhausted = useRef(false);
  const searchesSinceExhaustion = useRef(0);
  const VERTERBUKH_RECHECK_AFTER = 1; // recheck Verterbukh on every search after exhaustion

  /**
   * Update quota state and manage exhaustion alerts.
   * - used === total: set exhausted flag; alert once (first detection only).
   * - used < total after exhaustion: clear flag (tokens available again).
   * - used / total > 90%: low-token warning.
   */
  const processQuota = useCallback((quota: VerterbukQuota | null) => {
    if (!quota) return;
    setVerterbukQuota(quota);
    if (quota.used === quota.total) {
      if (!verterbukExhausted.current) {
        Alert.alert(
          'No Verterbukh Tokens',
          'You have used all your Verterbukh lookups. Searches will use the next available source based on your settings until your tokens are replenished.',
        );
      }
      verterbukExhausted.current = true;
      searchesSinceExhaustion.current = 0;
    } else {
      if (verterbukExhausted.current) {
        verterbukExhausted.current = false;
        console.log('[YidDict] SearchScreen: Verterbukh tokens available again — resuming normally');
      }
      if (quota.used / quota.total > 0.90) {
        Alert.alert(
          'Low Verterbukh Tokens',
          `You have used ${quota.used} of ${quota.total} Verterbukh lookup${quota.total === 1 ? '' : 's'}. Consider purchasing more tokens soon.`,
        );
      }
    }
  }, []);

  const handleSearch = useCallback(async () => {
    const trimmed = query.trim();
    if (!trimmed) return;

    setIsLoading(true);
    setError(null);
    setFromCache(false);
    setHasSearched(true);
    setEntries([]);
    setResultSource(null);
    setOtherOptions(null);
    setFallbackNote(null);

    try {
      const script = detectInputScript(trimmed);
      const isHebrew = script === 'hebrew';
      console.log(`[YidDict] SearchScreen: search initiated query="${trimmed}" script=${script}`);

      const order = await getSourceOrder();
      const creds = await getCredentials();
      const verterbukhhLoggedIn = creds !== null;
      const notes: string[] = [];

      for (const slot of order) {
        if (slot === 'none') continue;
        if (slot === 'google_translate') continue; // not yet implemented
        if (slot === 'verterbukh' && !verterbukhhLoggedIn) {
          console.log('[YidDict] SearchScreen: skipping Verterbukh — not logged in');
          continue;
        }

        if (slot === 'verterbukh' && verterbukExhausted.current) {
          searchesSinceExhaustion.current = 0;
          console.log('[YidDict] SearchScreen: rechecking Verterbukh after exhaustion');
        }

        const source = slot as DictSource;

        // Cache check — return immediately if a fresh cached result exists
        const cached = await getCachedEntries(trimmed, source);
        if (cached && cached.length > 0) {
          console.log(`[YidDict] SearchScreen: serving ${source} results from cache`);
          setEntries(cached);
          setResultSource(source);
          setFromCache(true);
          if (notes.length > 0) setFallbackNote(notes.join(' · '));
          await logSearchHistory(trimmed, script, source);
          return;
        }

        // Live lookup
        if (source === 'finkel') {
          const results = await lookupFinkel(trimmed, isHebrew);
          console.log(`[YidDict] SearchScreen: Finkel returned ${results.length} result(s)`);
          if (results.length > 0) {
            setEntries(results);
            setResultSource('finkel');
            if (notes.length > 0) setFallbackNote(notes.join(' · '));
            await saveToCache(trimmed, results, 'finkel');
            await logSearchHistory(trimmed, script, 'finkel');
            return;
          }
          notes.push(`No results from ${SOURCE_LABELS.finkel}`);
        } else if (source === 'verterbukh') {
          const vResult = await lookupVerterbukh(trimmed);
          console.log(`[YidDict] SearchScreen: Verterbukh returned ${vResult.entries.length} entry(ies), choices=${vResult.choices?.length ?? 0}`);
          processQuota(vResult.quota);
          if (vResult.entries.length > 0) {
            const mapped = vResult.entries.map(verterbukToFinkelEntry);
            setEntries(mapped);
            setResultSource('verterbukh');
            if (vResult.choices && vResult.choices.length > 0) {
              setOtherOptions(vResult.choices);
            }
            if (notes.length > 0) setFallbackNote(notes.join(' · '));
            await saveToCache(trimmed, mapped, 'verterbukh');
            await logSearchHistory(trimmed, script, 'verterbukh');
            return;
          }
          notes.push(`No results from ${SOURCE_LABELS.verterbukh}`);
        }
        // No results from this source — fall through to the next slot
      }

      console.log('[YidDict] SearchScreen: all sources exhausted — no results');
    } catch (err) {
      setError('Could not reach the dictionary. Check your connection and try again.');
      console.error('[YidDict] SearchScreen lookup error:', err);
    } finally {
      setIsLoading(false);
    }
  }, [query, processQuota]);

  const handleOtherOption = useCallback(async (choice: VerterbukChoice) => {
    const trimmed = query.trim();

    if (verterbukExhausted.current) {
      Alert.alert(
        'No Verterbukh Tokens',
        'You have used all your Verterbukh lookups. Additional options are not available until your tokens are replenished.',
      );
      return;
    }

    setIsLoading(true);
    setOtherOptions(null);
    try {
      console.log(`[YidDict] SearchScreen: other option selected "${choice.label}" (ln=${choice.hebrewLemma})`);
      const vResult = await lookupVerterbukh(trimmed, choice.hebrewLemma);
      const mapped = vResult.entries.map(verterbukToFinkelEntry);
      setEntries(mapped);
      setResultSource('verterbukh');
      processQuota(vResult.quota);
      if (mapped.length > 0) {
        await saveToCache(trimmed, mapped, 'verterbukh');
      }
      await logSearchHistory(trimmed, detectInputScript(trimmed), 'verterbukh');
    } catch {
      setError('Could not retrieve that entry. Try again.');
    } finally {
      setIsLoading(false);
    }
  }, [query]);

  const handleClear = useCallback(() => {
    setQuery('');
    setEntries([]);
    setError(null);
    setFromCache(false);
    setHasSearched(false);
    setResultSource(null);
    setOtherOptions(null);
    setVerterbukQuota(null);
    setFallbackNote(null);
  }, []);

  const s = makeStyles(theme);

  const sourceBadgeStyle = resultSource === 'verterbukh'
    ? s.badgeVerterbukh
    : s.badgeFinkel;

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <View style={[s.root, { backgroundColor: theme.background }]} testID="search-root">

        {/* Search bar */}
        <View style={s.searchRow}>
          <TextInput
            style={s.input}
            value={query}
            onChangeText={setQuery}
            onSubmitEditing={handleSearch}
            placeholder="Search Yiddish or English…"
            placeholderTextColor={theme.textSecondary}
            returnKeyType="search"
            autoCorrect={false}
            autoCapitalize="none"
            spellCheck={false}
            testID="search-input"
          />
          {query.length > 0 ? (
            <TouchableOpacity
              style={s.clearBtn}
              onPress={handleClear}
              accessibilityLabel="Clear search"
              testID="clear-button"
            >
              <Text style={[s.clearBtnText, { color: theme.textSecondary }]}>✕</Text>
            </TouchableOpacity>
          ) : null}
          <TouchableOpacity
            style={[s.searchBtn, { backgroundColor: theme.primary }]}
            onPress={handleSearch}
            accessibilityLabel="Search"
            testID="search-button"
          >
            <Text style={s.searchBtnText}>Search</Text>
          </TouchableOpacity>
        </View>

        {/* Source + cache badges */}
        {hasSearched && !isLoading && resultSource ? (
          <View style={s.badgeRow}>
            <View style={[s.badge, sourceBadgeStyle]}>
              <Text style={s.badgeText}>{SOURCE_LABELS[resultSource]}</Text>
            </View>
            {resultSource === 'verterbukh' && verterbukQuota ? (
              <View style={[s.badge, s.badgeQuota]} testID="quota-badge">
                <Text style={s.badgeText}>{verterbukQuota.used}/{verterbukQuota.total}</Text>
              </View>
            ) : null}
            {fromCache ? (
              <View style={[s.badge, s.badgeCached]}>
                <Text style={s.badgeText}>cached</Text>
              </View>
            ) : null}
          </View>
        ) : null}

        {/* Fallback note — shown when results come from a non-primary source */}
        {fallbackNote && !isLoading ? (
          <Text style={[s.fallbackNote, { color: theme.textSecondary }]} testID="fallback-note">
            {fallbackNote}
          </Text>
        ) : null}

        {/* Loading */}
        {isLoading ? (
          <ActivityIndicator
            style={s.spinner}
            color={theme.primary}
            testID="loading-indicator"
          />
        ) : null}

        {/* Error */}
        {error ? (
          <Text style={[s.errorText, { color: theme.text }]} testID="error-message">
            {error}
          </Text>
        ) : null}

        {/* Results */}
        {!isLoading && !error ? (
          <FlatList
            data={entries}
            keyExtractor={(_, i) => String(i)}
            renderItem={({ item }) => (
              <EntryRow
                entry={item}
                theme={theme}
                sourceColor={resultSource === 'verterbukh' ? theme.sourceVerterbukh : theme.sourceFinkel}
              />
            )}
            contentContainerStyle={s.listContent}
            ListEmptyComponent={
              hasSearched ? (
                <View testID="no-results">
                  <Text style={[s.emptyText, { color: theme.textSecondary }]}>
                    No results found. Try another word or stem.
                  </Text>
                </View>
              ) : null
            }
            ListFooterComponent={
              otherOptions && !isLoading ? (
                <OtherOptionsView
                  choices={otherOptions}
                  onSelect={handleOtherOption}
                  theme={theme}
                  s={s}
                />
              ) : null
            }
          />
        ) : null}

      </View>
    </KeyboardAvoidingView>
  );
}

// ---------------------------------------------------------------------------
// Other options panel (Verterbukh disambiguation alternatives)
// ---------------------------------------------------------------------------

interface OtherOptionsViewProps {
  choices: VerterbukChoice[];
  onSelect: (choice: VerterbukChoice) => void;
  theme: ReturnType<typeof useTheme>['theme'];
  s: ReturnType<typeof makeStyles>;
}

function OtherOptionsView({ choices, onSelect, theme, s }: OtherOptionsViewProps) {
  return (
    <View testID="other-options-view" style={s.otherOptionsWrap}>
      <Text style={[s.otherOptionsTitle, { color: theme.textSecondary }]}>
        Other options
      </Text>
      {choices.map(choice => (
        <TouchableOpacity
          key={choice.hebrewLemma}
          style={[s.otherOption, { borderColor: theme.border, backgroundColor: theme.surface }]}
          onPress={() => onSelect(choice)}
          testID={`other-option-${choice.hebrewLemma}`}
        >
          <Text style={[s.otherOptionLabel, { color: theme.text }]}>{choice.label}</Text>
          <Text style={[s.otherOptionHebrew, { color: theme.textSecondary }]}>{choice.hebrewLemma}</Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Entry row component
// ---------------------------------------------------------------------------

interface EntryRowProps {
  entry: FinkelEntry;
  theme: ReturnType<typeof useTheme>['theme'];
  sourceColor: string;
}

function EntryRow({ entry, theme, sourceColor }: EntryRowProps) {
  const s = makeStyles(theme);
  return (
    <View
      style={[
        s.entryCard,
        entry.isPhrase
          ? [s.phraseCard, { borderLeftColor: sourceColor, backgroundColor: theme.background }]
          : { borderColor: sourceColor, backgroundColor: sourceColor + '18' },
      ]}
      testID="entry-card"
    >
      {/* Yiddish headword row: YIVO (LTR) + Hebrew script (RTL) */}
      <View style={s.headwordRow}>
        {entry.yiddishRomanized ? (
          <Text style={[s.romanized, { color: theme.text }]}>
            {entry.yiddishRomanized}
          </Text>
        ) : null}
        {entry.yiddishHebrew ? (
          <Text style={[s.hebrew, { color: theme.text }]}>
            {entry.yiddishHebrew}
          </Text>
        ) : null}
      </View>

      {/* Part of speech */}
      {entry.partOfSpeech ? (
        <Text style={[s.grammar, { color: theme.textSecondary }]}>
          {entry.partOfSpeech}
          {entry.conjugationInfo ? `  ${entry.conjugationInfo}` : ''}
        </Text>
      ) : null}

      {/* English definition */}
      {entry.english ? (
        <Text style={[s.definition, { color: theme.text }]}>
          {entry.english}
        </Text>
      ) : null}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

function makeStyles(theme: ReturnType<typeof useTheme>['theme']) {
  return StyleSheet.create({
    root: {
      flex: 1,
    },
    searchRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 12,
      paddingTop: 12,
      paddingBottom: 8,
      gap: 8,
    },
    input: {
      flex: 1,
      height: 44,
      borderWidth: 1,
      borderColor: theme.border,
      borderRadius: 8,
      paddingHorizontal: 12,
      fontSize: 16,
      color: theme.text,
      backgroundColor: theme.surface,
    },
    clearBtn: {
      padding: 6,
    },
    clearBtnText: {
      fontSize: 16,
    },
    searchBtn: {
      height: 44,
      paddingHorizontal: 16,
      borderRadius: 8,
      justifyContent: 'center',
      alignItems: 'center',
    },
    searchBtnText: {
      color: theme.background,
      fontSize: 15,
      fontWeight: '600',
    },
    badgeRow: {
      flexDirection: 'row',
      gap: 6,
      paddingHorizontal: 12,
      paddingBottom: 6,
    },
    badge: {
      paddingHorizontal: 8,
      paddingVertical: 2,
      borderRadius: 4,
    },
    badgeFinkel: {
      backgroundColor: theme.sourceFinkel,
    },
    badgeVerterbukh: {
      backgroundColor: theme.sourceVerterbukh,
    },
    badgeQuota: {
      backgroundColor: '#6B7280',
    },
    badgeCached: {
      backgroundColor: '#6B7280',
    },
    badgeText: {
      color: '#FFFFFF',
      fontSize: 11,
      fontWeight: '600',
    },
    fallbackNote: {
      fontSize: 12,
      fontStyle: 'italic',
      paddingHorizontal: 12,
      paddingBottom: 6,
    },
    spinner: {
      marginTop: 32,
    },
    errorText: {
      marginHorizontal: 16,
      marginTop: 24,
      fontSize: 15,
      textAlign: 'center',
    },
    listContent: {
      paddingHorizontal: 12,
      paddingBottom: 24,
    },
    emptyText: {
      marginTop: 40,
      textAlign: 'center',
      fontSize: 15,
    },
    // Other options (Verterbukh alternatives)
    otherOptionsWrap: {
      marginTop: 24,
      paddingHorizontal: 0,
    },
    otherOptionsTitle: {
      fontSize: 11,
      fontWeight: '600',
      letterSpacing: 0.8,
      marginBottom: 8,
    },
    otherOption: {
      borderWidth: 1,
      borderRadius: 8,
      padding: 12,
      marginBottom: 8,
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
    },
    otherOptionLabel: {
      fontSize: 15,
      fontWeight: '600',
    },
    otherOptionHebrew: {
      fontSize: 15,
    },
    // Entry cards
    entryCard: {
      borderWidth: 1,
      borderRadius: 8,
      padding: 12,
      marginBottom: 8,
    },
    phraseCard: {
      marginLeft: 20,
      marginBottom: 4,
      borderTopWidth: 0,
      borderRightWidth: 0,
      borderBottomWidth: 0,
      borderLeftWidth: 3,
      borderRadius: 0,
      borderTopRightRadius: 4,
      borderBottomRightRadius: 4,
      paddingVertical: 8,
    },
    headwordRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'baseline',
      marginBottom: 4,
    },
    romanized: {
      fontSize: 17,
      fontWeight: '600',
    },
    hebrew: {
      fontSize: 18,
      writingDirection: 'rtl',
      textAlign: 'right',
    },
    grammar: {
      fontSize: 13,
      fontStyle: 'italic',
      marginBottom: 4,
    },
    definition: {
      fontSize: 15,
    },
  });
}
