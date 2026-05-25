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
import { DictEntry } from '../types';
import { lookupFinkel } from '../services/finkelService';
import { lookupVerterbukh, VerterbukChoice, VerterbukQuota } from '../services/verterbukh-service';
import { lookupGoogleTranslate } from '../services/google-translate-service';
import { getCredentials } from '../services/verterbukh-auth';
import { getCachedEntries, saveToCache } from '../db/cacheDb';
import { saveEntry, saveEntries, deleteEntriesByKey } from '../db/savedDb';
import { useSaved } from '../context/SavedContext';
import { detectInputScript } from '../utils/inputDetector';
import { Ionicons } from '@expo/vector-icons';
import { getSourceOrder, DictSource, SOURCE_LABELS, getLowTokenThreshold, getCacheTtlDays, getUseAllSources, getYivoToHebrew } from '../db/settingsDb';
import { yivoToHebrew } from '../utils/yivoToHebrew';

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function SearchScreen() {
  const { theme } = useTheme();
  const [query, setQuery] = useState('');
  const [entries, setEntries] = useState<DictEntry[]>([]);
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
  const { savedKeySet, refreshSaved } = useSaved();

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
  const processQuota = useCallback((quota: VerterbukQuota | null, threshold: number) => {
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
      if (quota.used / quota.total > threshold) {
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

      const thresholdPct = await getLowTokenThreshold();
      const threshold = thresholdPct / 100;
      const cacheTtl = await getCacheTtlDays();
      const useAllSources = await getUseAllSources();
      const yivoToHebrewEnabled = await getYivoToHebrew();

      const applyConverter = (es: DictEntry[]): DictEntry[] => {
        if (!yivoToHebrewEnabled) return es;
        return es.map(e => {
          if (e.yiddishHebrew || !e.yiddishRomanized) return e;
          const generated = yivoToHebrew(e.yiddishRomanized);
          if (!generated) return e;
          return { ...e, yiddishHebrew: generated, hebrewIsGenerated: true };
        });
      };

      const order = await getSourceOrder();
      const creds = await getCredentials();
      const verterbukhhLoggedIn = creds !== null;
      const notes: string[] = [];

      // Helper: look up a single source and return its entries (cache-first).
      // Each returned entry has fromCache set on the entry itself.
      const lookupSource = async (source: DictSource): Promise<DictEntry[]> => {
        const cached = await getCachedEntries(trimmed, source, cacheTtl);
        if (cached && cached.length > 0) {
          console.log(`[YidDict] SearchScreen: serving ${source} results from cache`);
          return cached; // rowToEntry already sets fromCache: true
        }
        if (source === 'finkel') {
          const results = await lookupFinkel(trimmed, isHebrew);
          console.log(`[YidDict] SearchScreen: Finkel returned ${results.length} result(s)`);
          if (results.length > 0) await saveToCache(trimmed, results, 'finkel');
          return results;
        }
        if (source === 'verterbukh') {
          const vResult = await lookupVerterbukh(trimmed);
          console.log(`[YidDict] SearchScreen: Verterbukh returned ${vResult.entries.length} entry(ies)`);
          processQuota(vResult.quota, threshold);
          if (vResult.entries.length > 0) {
            if (vResult.choices && vResult.choices.length > 0) setOtherOptions(vResult.choices);
            await saveToCache(trimmed, vResult.entries, 'verterbukh');
          }
          return vResult.entries;
        }
        if (source === 'google_translate') {
          const results = await lookupGoogleTranslate(trimmed, isHebrew);
          console.log(`[YidDict] SearchScreen: Google Translate returned ${results.length} result(s)`);
          if (results.length > 0) await saveToCache(trimmed, results, 'google_translate');
          return results;
        }
        return [];
      };

      const eligibleSources = order
        .filter(slot => slot !== 'none')
        .filter(slot => slot !== 'verterbukh' || verterbukhhLoggedIn)
        .map(slot => {
          if (slot === 'verterbukh' && verterbukExhausted.current) {
            searchesSinceExhaustion.current = 0;
          }
          return slot as DictSource;
        });

      if (useAllSources) {
        // Query all eligible sources and combine results
        const allEntries: DictEntry[] = [];
        for (const source of eligibleSources) {
          const results = await lookupSource(source);
          allEntries.push(...results);
          if (results.length === 0) notes.push(`No results from ${SOURCE_LABELS[source]}`);
        }
        if (allEntries.length > 0) {
          setEntries(applyConverter(allEntries));
          setResultSource(null);
        }
        if (notes.length > 0) setFallbackNote(notes.join(' · '));
        console.log(`[YidDict] SearchScreen: use-all-sources returned ${allEntries.length} total entries`);
      } else {
        // Stop at the first source with results
        for (const source of eligibleSources) {
          const results = await lookupSource(source);
          if (results.length > 0) {
            setEntries(applyConverter(results));
            setResultSource(source);
            setFromCache(results[0].fromCache);
            if (notes.length > 0) setFallbackNote(notes.join(' · '));
            return;
          }
          notes.push(`No results from ${SOURCE_LABELS[source]}`);
        }
        console.log('[YidDict] SearchScreen: all sources exhausted — no results');
      }
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
      const thresholdPct = await getLowTokenThreshold();
      const vResult = await lookupVerterbukh(trimmed, choice.hebrewLemma);
      setEntries(vResult.entries);
      setResultSource('verterbukh');
      processQuota(vResult.quota, thresholdPct / 100);
      if (vResult.entries.length > 0) {
        await saveToCache(trimmed, vResult.entries, 'verterbukh');
      }
    } catch {
      setError('Could not retrieve that entry. Try again.');
    } finally {
      setIsLoading(false);
    }
  }, [query]);

  const handleSaveEntry = useCallback(async (entry: DictEntry, source: DictSource) => {
    const key = `${entry.yiddishHebrew ?? ''}|${entry.english ?? ''}|${source}`;
    if (savedKeySet.has(key)) {
      await deleteEntriesByKey([entry], source);
    } else {
      await saveEntry(query.trim(), entry, source);
    }
    await refreshSaved();
  }, [query, savedKeySet, refreshSaved]);

  const handleSaveAll = useCallback(async () => {
    if (entries.length === 0) return;
    const isAllSaved = entries.every(e =>
      savedKeySet.has(`${e.yiddishHebrew ?? ''}|${e.english ?? ''}|${e.source}`)
    );
    // Group entries by their own source field
    const bySource = new Map<DictSource, DictEntry[]>();
    for (const e of entries) {
      const src = e.source as DictSource;
      if (!bySource.has(src)) bySource.set(src, []);
      bySource.get(src)!.push(e);
    }
    for (const [src, srcEntries] of bySource) {
      if (isAllSaved) {
        await deleteEntriesByKey(srcEntries, src);
      } else {
        await saveEntries(query.trim(), srcEntries, src);
      }
    }
    await refreshSaved();
  }, [query, entries, savedKeySet, refreshSaved]);

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

  const allSaved =
    entries.length > 0 &&
    entries.every(e =>
      savedKeySet.has(`${e.yiddishHebrew ?? ''}|${e.english ?? ''}|${e.source}`)
    );

  const s = makeStyles(theme);


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

        {/* Verterbukh quota badge */}
        {hasSearched && !isLoading && resultSource === 'verterbukh' && verterbukQuota ? (
          <View style={s.badgeRow}>
            <View style={[s.badge, s.badgeVerterbukh]} testID="quota-badge">
              <Text style={s.badgeText}>{verterbukQuota.used}/{verterbukQuota.total} tokens</Text>
            </View>
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
            renderItem={({ item }) => {
              const key = `${item.yiddishHebrew ?? ''}|${item.english ?? ''}|${item.source}`;
              return (
                <EntryRow
                  entry={item}
                  theme={theme}
                  sourceColor={
                    item.source === 'verterbukh' ? theme.sourceVerterbukh
                    : item.source === 'google_translate' ? theme.sourceGoogle
                    : theme.sourceFinkel
                  }
                  isSaved={savedKeySet.has(key)}
                  onSave={() => handleSaveEntry(item, item.source)}
                />
              );
            }}
            contentContainerStyle={s.listContent}
            ListHeaderComponent={
              entries.length > 0 ? (
                <TouchableOpacity
                  style={[s.saveAllBtn, { borderColor: allSaved ? theme.primary : theme.border }]}
                  onPress={handleSaveAll}
                  testID="save-all-button"
                >
                  <Ionicons
                    name={allSaved ? 'bookmark' : 'bookmark-outline'}
                    size={14}
                    color={allSaved ? theme.primary : theme.textSecondary}
                  />
                  <Text style={[s.saveAllText, { color: allSaved ? theme.primary : theme.textSecondary }]}>
                    {allSaved ? 'Unsave all' : 'Save all'}
                  </Text>
                </TouchableOpacity>
              ) : null
            }
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
  entry: DictEntry;
  theme: ReturnType<typeof useTheme>['theme'];
  sourceColor: string;
  isSaved: boolean;
  onSave: () => void;
}

function EntryRow({ entry, theme, sourceColor, isSaved, onSave }: EntryRowProps) {
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
      {/* Row 1: Hebrew (right-aligned) + bookmark */}
      <View style={s.headwordRow}>
        <View style={s.hebrewWrapper}>
          {entry.hebrewIsGenerated ? (
            <Text style={[s.generatedMarker, { color: theme.textSecondary }]}>~</Text>
          ) : null}
          <Text style={[s.hebrew, { color: theme.text }]}>
            {entry.yiddishHebrew ?? ''}
          </Text>
          {entry.hebrewIsGenerated ? (
            <Text style={[s.generatedMarker, { color: theme.textSecondary }]}>~</Text>
          ) : null}
        </View>
        <TouchableOpacity
          onPress={onSave}
          accessibilityLabel={isSaved ? 'Remove from saved' : 'Save entry'}
          testID="save-entry-button"
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Ionicons
            name={isSaved ? 'bookmark' : 'bookmark-outline'}
            size={18}
            color={isSaved ? theme.primary : theme.textSecondary}
          />
        </TouchableOpacity>
      </View>

      {/* Row 2: English definition */}
      {entry.english ? (
        <Text style={[s.definition, { color: theme.text }]}>
          {entry.english}
        </Text>
      ) : null}

      {/* Row 3: YIVO transliteration */}
      {entry.yiddishRomanized ? (
        <Text style={[s.romanized, { color: theme.textSecondary }]}>
          {entry.yiddishRomanized}
        </Text>
      ) : null}

      {/* Row 4: grammar */}
      {(entry.partOfSpeech || entry.grammaticalInfo) ? (
        <Text style={[s.grammar, { color: theme.textSecondary }]}>
          {[entry.partOfSpeech, entry.grammaticalInfo].filter(Boolean).join('  ')}
        </Text>
      ) : null}

      {/* Row 5: source + cache tags */}
      <View style={s.entryMeta}>
        <Text style={[s.entrySourceLabel, { color: sourceColor }]}>
          {SOURCE_LABELS[entry.source]}
        </Text>
        {entry.fromCache ? (
          <Text style={[s.entryCachedLabel, { color: theme.textSecondary }]}>Cached</Text>
        ) : null}
      </View>
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
    badgeGoogle: {
      backgroundColor: theme.sourceGoogle,
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
      alignItems: 'center',
      marginBottom: 4,
    },
    hebrewWrapper: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'baseline',
      gap: 4,
    },
    saveAllBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      alignSelf: 'flex-end',
      borderWidth: 1,
      borderRadius: 6,
      paddingHorizontal: 10,
      paddingVertical: 4,
      marginBottom: 8,
    },
    saveAllText: {
      fontSize: 12,
    },
    romanized: {
      fontSize: 13,
    },
    hebrew: {
      fontSize: 16,
      writingDirection: 'rtl',
      textAlign: 'left',
    },
    generatedMarker: {
      fontSize: 13,
      alignSelf: 'center',
    },
    grammar: {
      fontSize: 13,
      fontStyle: 'italic',
      marginBottom: 4,
    },
    definition: {
      fontSize: 16,
      marginBottom: 2,
    },
    entryMeta: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      marginTop: 6,
    },
    entrySourceLabel: {
      fontSize: 11,
      fontWeight: '600',
    },
    entryCachedLabel: {
      fontSize: 11,
      fontStyle: 'italic',
    },
  });
}
