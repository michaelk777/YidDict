import React, { useState, useCallback, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Pressable,
  FlatList,
  ActivityIndicator,
  Alert,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  Animated,
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
import { toSuperscript, splitHebrewLemma, formatHebrewLemma } from '../utils/hebrewDisplay';
import { Ionicons } from '@expo/vector-icons';
import { getSourceOrder, DictSource, SOURCE_LABELS, getLowTokenThreshold, getCacheTtlDays, getUseAllSources, getYivoToHebrew, saveVerterbukhQuota } from '../db/settingsDb';
import { yivoToHebrew } from '../utils/yivoToHebrew';

/**
 * Convert an enriched YIVO romanized headword to Hebrew script, preserving
 * the enrichment format the parser appended.
 *
 * The Finkel parser may enrich yiddishRomanized with:
 *   "word (stem)"   — adjective stem, e.g. "sheyn (shen)"
 *   "word, suffix"  — plural suffix or participle, e.g. "sheynkayt, -n"
 *
 * Running yivoToHebrew on the whole string would strip parentheses and commas
 * (unknown chars). This helper converts each part independently and reassembles
 * with the correct punctuation, then falls back to plain conversion if neither
 * pattern matches.
 */
function yivoHeadwordToHebrew(yivo: string): string | null {
  // "word (stem)" — adjective stem enrichment
  const parenMatch = yivo.match(/^(.+?)\s+\((.+)\)$/);
  if (parenMatch) {
    const baseHeb = yivoToHebrew(parenMatch[1].trim());
    if (!baseHeb) return null;
    const stemHeb = yivoToHebrew(parenMatch[2].trim());
    return stemHeb ? `${baseHeb} (${stemHeb})` : baseHeb;
  }

  // "word, suffix" — plural suffix or participle enrichment
  const commaMatch = yivo.match(/^(.+),\s+(.+)$/);
  if (commaMatch) {
    const baseHeb = yivoToHebrew(commaMatch[1].trim());
    if (!baseHeb) return null;
    const suffixHeb = yivoToHebrew(commaMatch[2].trim());
    return suffixHeb ? `${baseHeb}, ${suffixHeb}` : baseHeb;
  }

  return yivoToHebrew(yivo);
}

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
  const [cachedChoiceLemmas, setCachedChoiceLemmas] = useState<Set<string>>(new Set());
  const [showTryEnglish, setShowTryEnglish] = useState(false);
  const [verterbukhQuota, setVerterbukhQuota] = useState<VerterbukQuota | null>(null);
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
    setVerterbukhQuota(quota);
    saveVerterbukhQuota(quota.used, quota.total).catch(() => {});
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
    setCachedChoiceLemmas(new Set());
    setShowTryEnglish(false);
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
          const generated = yivoHeadwordToHebrew(e.yiddishRomanized);
          if (!generated) return e;
          return { ...e, yiddishHebrew: generated, hebrewIsGenerated: true };
        });
      };

      const order = await getSourceOrder();
      const creds = await getCredentials();
      const verterbukhhLoggedIn = creds !== null;
      const notes: string[] = [];
      let verterbukHasChoices = false;

      // Helper: look up a single source and return its entries (cache-first).
      // Each returned entry has fromCache set on the entry itself.
      const lookupSource = async (source: DictSource): Promise<DictEntry[]> => {
        const cached = await getCachedEntries(trimmed, source, cacheTtl);
        if (cached && cached.length > 0) {
          console.log(`[YidDict] SearchScreen: serving ${source} results from cache`);
          if (source === 'verterbukh') {
            // Build lemma set from cached entries so choices that are already cached can be greyed out
            const existingLemmas = new Set(cached.map(e => e.yiddishHebrew).filter(Boolean) as string[]);
            // Always fetch choices live so the "Other search options" panel is available on re-search
            const freshResult = await lookupVerterbukh(trimmed);
            processQuota(freshResult.quota, threshold);
            let liveChoices = freshResult.choices;
            // dir=from returned no choices — try dir=to for Latin input (English→Yiddish)
            if ((!liveChoices || liveChoices.length === 0) && !isHebrew) {
              const toResult = await lookupVerterbukh(trimmed, undefined, 'to');
              processQuota(toResult.quota, threshold);
              liveChoices = toResult.choices;
            }
            if (liveChoices && liveChoices.length > 0) {
              setOtherOptions(liveChoices);
              setCachedChoiceLemmas(existingLemmas);
              verterbukHasChoices = true;
              if (!isHebrew) setShowTryEnglish(true);
            }
          }
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
          if (vResult.choices && vResult.choices.length > 0) {
            // Disambiguation choices present — surface them; show "Try in English" for manual override
            setOtherOptions(vResult.choices);
            setCachedChoiceLemmas(new Set()); // nothing cached yet on a fresh lookup
            verterbukHasChoices = true;
            if (!isHebrew) setShowTryEnglish(true);
            if (vResult.entries.length > 0) await saveToCache(trimmed, vResult.entries, 'verterbukh');
            return vResult.entries;
          }
          if (vResult.entries.length > 0) {
            await saveToCache(trimmed, vResult.entries, 'verterbukh');
            return vResult.entries;
          }
          // No entries and no choices from dir=from — auto-retry as English (Latin input only)
          if (!isHebrew) {
            const toResult = await lookupVerterbukh(trimmed, undefined, 'to');
            console.log(`[YidDict] SearchScreen: Verterbukh dir=to returned ${toResult.entries.length} entry(ies)`);
            processQuota(toResult.quota, threshold);
            if (toResult.choices && toResult.choices.length > 0) {
              setOtherOptions(toResult.choices);
              setCachedChoiceLemmas(new Set());
              verterbukHasChoices = true;
            }
            if (toResult.entries.length > 0) await saveToCache(trimmed, toResult.entries, 'verterbukh');
            return toResult.entries;
          }
          return [];
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
          if (results.length === 0 && !(source === 'verterbukh' && verterbukHasChoices)) {
            notes.push(`No results from ${SOURCE_LABELS[source]}`);
          }
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
          if (!(source === 'verterbukh' && verterbukHasChoices)) {
            notes.push(`No results from ${SOURCE_LABELS[source]}`);
          }
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
    setShowTryEnglish(false);
    setFallbackNote(null);
    try {
      console.log(`[YidDict] SearchScreen: other option selected "${choice.label}" (ln=${choice.hebrewLemma})`);
      const thresholdPct = await getLowTokenThreshold();
      const cacheTtl = await getCacheTtlDays();
      const useAllSourcesEnabled = await getUseAllSources();
      const yivoToHebrewEnabled = await getYivoToHebrew();

      const applyConverter = (es: DictEntry[]): DictEntry[] => {
        if (!yivoToHebrewEnabled) return es;
        return es.map(e => {
          if (e.yiddishHebrew || !e.yiddishRomanized) return e;
          const generated = yivoHeadwordToHebrew(e.yiddishRomanized);
          if (!generated) return e;
          return { ...e, yiddishHebrew: generated, hebrewIsGenerated: true };
        });
      };

      // Always look up Verterbukh with the specific disambiguation lemma, using the
      // direction that produced the choice (from=Yiddish→English, to=English→Yiddish).
      const vResult = await lookupVerterbukh(trimmed, choice.hebrewLemma, choice.dir);
      processQuota(vResult.quota, thresholdPct / 100);
      if (vResult.entries.length > 0) {
        // Always store choice.hebrewLemma (including any /N homograph suffix) so each
        // homograph has a distinct cache key and existingLemmas greys correctly on re-search.
        const entriesToSave = vResult.entries.map(e => ({
          ...e,
          yiddishHebrew: choice.hebrewLemma,
        }));
        await saveToCache(trimmed, entriesToSave, 'verterbukh');
      }

      if (useAllSourcesEnabled) {
        // Query other active sources using the Yiddish word the user actually chose.
        // dir=from (Yiddish→English): search the YIVO label (e.g. "loyfn")
        // dir=to   (English→Yiddish): search the Hebrew lemma (e.g. "לױפֿן"), stripping any /N suffix
        const order = await getSourceOrder();
        const altQuery = choice.dir === 'to'
          ? splitHebrewLemma(choice.hebrewLemma).text
          : choice.label.toLowerCase();
        const isHebrew = choice.dir === 'to';
        const allEntries: DictEntry[] = [...vResult.entries];

        for (const slot of order) {
          if (slot === 'none' || slot === 'verterbukh') continue;

          const cached = await getCachedEntries(altQuery, slot, cacheTtl);
          if (cached && cached.length > 0) {
            allEntries.push(...cached);
            continue;
          }
          if (slot === 'finkel') {
            const results = await lookupFinkel(altQuery, isHebrew);
            if (results.length > 0) await saveToCache(altQuery, results, 'finkel');
            allEntries.push(...results);
          } else if (slot === 'google_translate') {
            const results = await lookupGoogleTranslate(altQuery, isHebrew);
            if (results.length > 0) await saveToCache(altQuery, results, 'google_translate');
            allEntries.push(...results);
          }
        }
        setEntries(applyConverter(allEntries));
        setResultSource(null);
      } else {
        setEntries(applyConverter(vResult.entries));
        setResultSource('verterbukh');
      }
    } catch {
      setError('Could not retrieve that entry. Try again.');
    } finally {
      setIsLoading(false);
    }
  }, [query, processQuota]);

  const handleTryEnglish = useCallback(async () => {
    const trimmed = query.trim();
    if (!trimmed) return;
    setShowTryEnglish(false);
    setOtherOptions(null);
    setIsLoading(true);
    setFallbackNote(null);
    try {
      const thresholdPct = await getLowTokenThreshold();
      const cacheTtl = await getCacheTtlDays();
      const useAllSourcesEnabled = await getUseAllSources();
      const yivoToHebrewEnabled = await getYivoToHebrew();

      const applyConverter = (es: DictEntry[]): DictEntry[] => {
        if (!yivoToHebrewEnabled) return es;
        return es.map(e => {
          if (e.yiddishHebrew || !e.yiddishRomanized) return e;
          const generated = yivoHeadwordToHebrew(e.yiddishRomanized);
          if (!generated) return e;
          return { ...e, yiddishHebrew: generated, hebrewIsGenerated: true };
        });
      };

      const vResult = await lookupVerterbukh(trimmed, undefined, 'to');
      processQuota(vResult.quota, thresholdPct / 100);
      if (vResult.entries.length > 0) {
        await saveToCache(trimmed, vResult.entries, 'verterbukh');
      }
      if (vResult.choices && vResult.choices.length > 0) setOtherOptions(vResult.choices);

      // Re-fetch all cached Verterbukh entries so previously-selected "Other options"
      // entries (from dir=from) remain visible alongside any new dir=to results.
      const allVerterbukh = await getCachedEntries(trimmed, 'verterbukh', cacheTtl) ?? vResult.entries;

      if (useAllSourcesEnabled) {
        const order = await getSourceOrder();
        const allEntries: DictEntry[] = [...allVerterbukh];
        for (const slot of order) {
          if (slot === 'none' || slot === 'verterbukh') continue;
          const cached = await getCachedEntries(trimmed, slot, cacheTtl);
          if (cached && cached.length > 0) { allEntries.push(...cached); continue; }
          if (slot === 'finkel') {
            const results = await lookupFinkel(trimmed, false);
            if (results.length > 0) await saveToCache(trimmed, results, 'finkel');
            allEntries.push(...results);
          } else if (slot === 'google_translate') {
            const results = await lookupGoogleTranslate(trimmed, false);
            if (results.length > 0) await saveToCache(trimmed, results, 'google_translate');
            allEntries.push(...results);
          }
        }
        setEntries(applyConverter(allEntries));
        setResultSource(null);
      } else {
        setEntries(applyConverter(allVerterbukh));
        setResultSource('verterbukh');
      }
    } catch {
      setError('Could not retrieve that entry. Try again.');
    } finally {
      setIsLoading(false);
    }
  }, [query, processQuota]);

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
    setShowTryEnglish(false);
    setVerterbukhQuota(null);
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

        {/* Verterbukh quota badge — only when Verterbukh results are visible */}
        {hasSearched && !isLoading && verterbukhQuota && entries.some(e => e.source === 'verterbukh') ? (
          <View style={s.badgeRow}>
            <View style={[s.badge, s.badgeVerterbukh]} testID="quota-badge">
              <Text style={s.badgeText}>{verterbukhQuota.used}/{verterbukhQuota.total} tokens</Text>
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
              (otherOptions || showTryEnglish || entries.length > 0) ? (
                <View>
                  {otherOptions ? (
                    <OtherOptionsView
                      choices={otherOptions}
                      cachedLemmas={cachedChoiceLemmas}
                      onSelect={handleOtherOption}
                      theme={theme}
                      s={s}
                    />
                  ) : null}
                  {showTryEnglish ? (
                    <TouchableOpacity
                      style={[s.tryEnglishBtn, { borderColor: theme.sourceVerterbukh, backgroundColor: theme.sourceVerterbukh + '18' }]}
                      onPress={handleTryEnglish}
                      testID="try-english-button"
                    >
                      <Text style={[s.tryEnglishText, { color: theme.text }]}>
                        Try searching "{query.trim()}" in English
                      </Text>
                    </TouchableOpacity>
                  ) : null}
                  {entries.length > 0 ? (
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
                  ) : null}
                </View>
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
            ListFooterComponent={null}
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
  cachedLemmas: Set<string>;
  onSelect: (choice: VerterbukChoice) => void;
  theme: ReturnType<typeof useTheme>['theme'];
  s: ReturnType<typeof makeStyles>;
}


function OtherOptionsView({ choices, cachedLemmas, onSelect, theme, s }: OtherOptionsViewProps) {
  const amberBorder = theme.sourceVerterbukh + '50';
  const amberPress  = theme.sourceVerterbukh + '25';
  const [expanded, setExpanded] = useState(false);
  const rotation = useRef(new Animated.Value(0)).current;

  const toggle = () => {
    const toValue = expanded ? 0 : 1;
    Animated.timing(rotation, {
      toValue,
      duration: 200,
      useNativeDriver: true,
    }).start();
    setExpanded(e => !e);
  };

  const chevronRotation = rotation.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '90deg'],
  });

  return (
    <View testID="other-options-view" style={s.otherOptionsWrap}>
      <Pressable
        onPress={toggle}
        style={({ pressed }) => [s.otherOptionsHeader, pressed && { opacity: 0.7 }]}
        testID="other-options-toggle"
      >
        <Animated.View style={{ transform: [{ rotate: chevronRotation }] }}>
          <Ionicons name="chevron-forward" size={14} color={theme.sourceVerterbukh} />
        </Animated.View>
        <Text style={[s.otherOptionsTitle, { color: theme.sourceVerterbukh }]}>
          Other search options
        </Text>
      </Pressable>
      {expanded && (
        <View style={[s.otherOptionsCard, { borderColor: amberBorder, backgroundColor: theme.surface }]}>
          {choices.map((choice, index) => {
            const isCached = cachedLemmas.has(choice.hebrewLemma);
            const hebrew = splitHebrewLemma(choice.hebrewLemma);
            const hebrewText = hebrew.text + (hebrew.sup ? toSuperscript(hebrew.sup) : '');
            const yivoText = `"${choice.label}"` + (choice.superscript ? toSuperscript(choice.superscript) : '');
            return (
            <Pressable
              key={choice.hebrewLemma}
              style={({ pressed }) => [
                s.otherOption,
                index > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: amberBorder },
                pressed && { backgroundColor: amberPress },
                isCached && { opacity: 0.35 },
              ]}
              onPress={() => { if (!isCached) onSelect(choice); }}
              testID={`other-option-${choice.hebrewLemma}`}
            >
              {choice.label !== choice.hebrewLemma ? (
                // Yiddish→English: YIVO label on left, Hebrew on right
                <>
                  <Text style={[s.otherOptionLabel, { color: theme.text }]}>{yivoText}</Text>
                  <Text style={[s.otherOptionHebrew, { color: theme.text }]}>{hebrewText}</Text>
                </>
              ) : (
                // English→Yiddish: Hebrew only (no YIVO available) — right-aligned for consistency
                <Text style={[s.otherOptionHebrew, { color: theme.text, flex: 1, textAlign: 'right' }]}>{hebrewText}</Text>
              )}
            </Pressable>
            );
          })}
        </View>
      )}
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
            {formatHebrewLemma(entry.yiddishHebrew)}
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
        <Text style={[s.romanized, { color: theme.text }]}>
          {(() => {
            const sup = splitHebrewLemma(entry.yiddishHebrew ?? '').sup;
            return `"${entry.yiddishRomanized}"${sup ? toSuperscript(sup) : ''}`;
          })()}
        </Text>
      ) : null}

      {/* Row 4: grammar — grammaticalInfo already contains all lines including the first;
          fall back to partOfSpeech for older cached / non-Finkel entries */}
      {(entry.partOfSpeech || entry.grammaticalInfo) ? (
        <Text style={[s.grammar, { color: theme.textSecondary }]}>
          {entry.grammaticalInfo ?? entry.partOfSpeech}
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
      marginBottom: 8,
    },
    otherOptionsHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingVertical: 4,
      marginBottom: 4,
    },
    otherOptionsTitle: {
      fontSize: 14,
      fontWeight: '600',
      letterSpacing: 0.8,
    },
    otherOptionsCard: {
      borderRadius: 8,
      borderWidth: 1,
      overflow: 'hidden',
    },
    otherOption: {
      paddingVertical: 12,
      paddingHorizontal: 16,
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
    },
    tryEnglishBtn: {
      borderWidth: 1,
      borderRadius: 8,
      padding: 12,
      marginBottom: 8,
    },
    tryEnglishText: {
      fontSize: 14,
      fontWeight: '500',
      textAlign: 'center',
    },
    otherOptionLabel: {
      fontSize: 15,
      fontWeight: '600',
      fontStyle: 'italic',
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
      fontSize: 16,
      fontStyle: 'italic',
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
