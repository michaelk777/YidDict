import React, { useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  Alert,
  ActionSheetIOS,
  Platform,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../context/ThemeContext';
import { useSaved } from '../context/SavedContext';
import { DictSource, SOURCE_LABELS } from '../db/settingsDb';
import { formatHebrewLemma, splitHebrewLemma, toSuperscript } from '../utils/hebrewDisplay';
import { GrammarText } from '../components/GrammarText';
import { GoogleTranslateAttribution } from '../components/GoogleTranslateAttribution';
import {
  SavedEntry,
  deleteEntry,
  clearSaved,
  generateCsv,
  generateTsv,
} from '../db/savedDb';

export default function SavedScreen() {
  const { theme } = useTheme();
  const { savedEntries: entries, isLoading, refreshSaved } = useSaved();

  const handleDelete = useCallback(async (id: number) => {
    await deleteEntry(id);
    await refreshSaved();
  }, [refreshSaved]);

  const handleClearAll = useCallback(() => {
    Alert.alert(
      'Clear All Saved',
      'Remove all saved entries? This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear All',
          style: 'destructive',
          onPress: async () => {
            await clearSaved();
            await refreshSaved();
          },
        },
      ]
    );
  }, [refreshSaved]);

  const exportAs = useCallback(async (format: 'csv' | 'tsv') => {
    const content = format === 'csv' ? generateCsv(entries) : generateTsv(entries);
    const filename = `yiddict_export.${format}`;
    const path = `${FileSystem.documentDirectory}${filename}`;

    try {
      await FileSystem.writeAsStringAsync(path, content, {
        encoding: FileSystem.EncodingType.UTF8,
      });

      const canShare = await Sharing.isAvailableAsync();
      if (!canShare) {
        Alert.alert('Sharing Not Available', 'File sharing is not supported on this device.');
        return;
      }

      await Sharing.shareAsync(path, {
        mimeType: 'text/plain',
        dialogTitle: 'Export saved entries',
      });
    } catch {
      Alert.alert('Export Failed', 'Could not export the file. Please try again.');
    }
  }, [entries]);

  const handleExport = useCallback(() => {
    if (entries.length === 0) {
      Alert.alert('Nothing to Export', 'Save some entries first.');
      return;
    }
    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        { options: ['Cancel', 'CSV', 'TSV'], cancelButtonIndex: 0 },
        (index) => {
          if (index === 1) exportAs('csv');
          else if (index === 2) exportAs('tsv');
        }
      );
    } else {
      Alert.alert(
        'Export Format',
        'Choose a file format.',
        [
          { text: 'CSV', onPress: () => exportAs('csv') },
          { text: 'TSV', onPress: () => exportAs('tsv') },
        ],
        { cancelable: true }
      );
    }
  }, [entries, exportAs]);

  const s = makeStyles(theme);

  const header = (
    <View style={s.headerRow}>
      <Text style={[s.headerTitle, { color: theme.text }]}>
        {entries.length} saved
      </Text>
      <View style={s.headerActions}>
        <TouchableOpacity
          style={[s.actionBtn, { borderColor: theme.border }]}
          onPress={handleExport}
          testID="export-button"
        >
          <Ionicons name="share-outline" size={15} color={theme.textSecondary} />
          <Text style={[s.actionBtnText, { color: theme.textSecondary }]}>Export</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[s.actionBtn, { borderColor: theme.border }]}
          onPress={handleClearAll}
          testID="clear-all-button"
        >
          <Ionicons name="trash-outline" size={15} color={theme.textSecondary} />
          <Text style={[s.actionBtnText, { color: theme.textSecondary }]}>Clear all</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  if (isLoading) {
    return (
      <View style={[s.root, { backgroundColor: theme.background }]}>
        <ActivityIndicator color={theme.primary} style={s.spinner} testID="loading-indicator" />
      </View>
    );
  }

  return (
    <View style={[s.root, { backgroundColor: theme.background }]} testID="saved-root">
      <FlatList
        data={entries}
        keyExtractor={e => String(e.id)}
        renderItem={({ item }) => (
          <SavedRow
            entry={item}
            theme={theme}
            onDelete={() => handleDelete(item.id)}
          />
        )}
        ListHeaderComponent={header}
        contentContainerStyle={s.listContent}
        ListEmptyComponent={
          <View testID="empty-state">
            <Text style={[s.emptyText, { color: theme.textSecondary }]}>
              No saved entries yet.{'\n'}Tap the bookmark on any result to save it.
            </Text>
          </View>
        }
      />
    </View>
  );
}

// ---------------------------------------------------------------------------
// Saved entry row
// ---------------------------------------------------------------------------

interface SavedRowProps {
  entry: SavedEntry;
  theme: ReturnType<typeof useTheme>['theme'];
  onDelete: () => void;
}

function SavedRow({ entry, theme, onDelete }: SavedRowProps) {
  const s = makeStyles(theme);

  const sourceColor =
    entry.source === 'verterbukh' ? theme.sourceVerterbukh
    : entry.source === 'google_translate' ? theme.sourceGoogle
    : theme.sourceFinkel;

  return (
    <View
      style={[s.row, { borderColor: theme.border, backgroundColor: theme.surface }]}
      testID="saved-entry-row"
    >
      <View style={[s.sourceBar, { backgroundColor: sourceColor }]} />
      <View style={s.rowContent}>
        {/* Row 1: Hebrew (left-aligned) + delete button */}
        <View style={s.rowTop}>
          <View style={s.hebrewWrapper}>
            {entry.hebrewIsGenerated ? (
              <Text style={[s.generatedMarker, { color: theme.textSecondary }]}>~</Text>
            ) : null}
            <Text style={[s.hebrew, { color: theme.text }]}>{formatHebrewLemma(entry.yiddishHebrew)}</Text>
            {entry.hebrewIsGenerated ? (
              <Text style={[s.generatedMarker, { color: theme.textSecondary }]}>~</Text>
            ) : null}
          </View>
          <TouchableOpacity
            onPress={onDelete}
            accessibilityLabel="Delete saved entry"
            testID="delete-entry-button"
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Ionicons name="close-circle-outline" size={20} color={theme.textSecondary} />
          </TouchableOpacity>
        </View>

        {/* Row 2: English */}
        {entry.english ? (
          <Text style={[s.english, { color: theme.text }]}>{entry.english}</Text>
        ) : null}

        {/* Row 3: YIVO transliteration */}
        {entry.yiddishTransliterated ? (
          <View style={s.transliteratedWrapper}>
            {entry.transliteratedIsGenerated ? (
              <Text style={[s.generatedMarker, { color: theme.textSecondary }]}>~</Text>
            ) : null}
            <Text style={[s.transliterated, { color: theme.text }]}>{(() => {
              const sup = splitHebrewLemma(entry.yiddishHebrew ?? '').sup;
              return `"${entry.yiddishTransliterated}"${sup ? toSuperscript(sup) : ''}`;
            })()}</Text>
            {entry.transliteratedIsGenerated ? (
              <Text style={[s.generatedMarker, { color: theme.textSecondary }]}>~</Text>
            ) : null}
          </View>
        ) : null}

        {/* Row 4: grammar */}
        {(entry.partOfSpeech || entry.grammaticalInfo) ? (
          <GrammarText
            text={entry.grammaticalInfo ?? entry.partOfSpeech ?? ''}
            style={[s.grammar, { color: theme.textSecondary }]}
            separatorColor={theme.borderGrammar}
          />
        ) : null}

        {/* Row 5: source tags, Google attribution badge on the right when applicable */}
        <View style={s.rowMeta}>
          <Text style={[s.sourceName, { color: sourceColor }]}>
            {SOURCE_LABELS[entry.source as DictSource]}
          </Text>
          {entry.source === 'google_translate' ? <GoogleTranslateAttribution /> : null}
        </View>
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
    spinner: {
      marginTop: 60,
    },
    listContent: {
      paddingHorizontal: 12,
      paddingBottom: 24,
    },
    headerRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingTop: 12,
      paddingBottom: 8,
    },
    headerTitle: {
      fontSize: 14,
      fontWeight: '600',
    },
    headerActions: {
      flexDirection: 'row',
      gap: 8,
    },
    actionBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      borderWidth: 1,
      borderRadius: 6,
      paddingHorizontal: 10,
      paddingVertical: 4,
    },
    actionBtnText: {
      fontSize: 12,
    },
    emptyText: {
      textAlign: 'center',
      marginTop: 60,
      fontSize: 15,
      lineHeight: 22,
    },
    row: {
      flexDirection: 'row',
      borderWidth: 1,
      borderRadius: 8,
      marginBottom: 8,
      overflow: 'hidden',
    },
    sourceBar: {
      width: 4,
    },
    rowContent: {
      flex: 1,
      padding: 12,
    },
    rowTop: {
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
    transliteratedWrapper: {
      flexDirection: 'row',
      alignItems: 'baseline',
      gap: 4,
    },
    transliterated: {
      fontSize: 16,
      fontStyle: 'italic',
    },
    hebrew: {
      fontSize: 16,
      writingDirection: 'rtl',
      textAlign: 'left',
    },
    generatedMarker: {
      fontSize: 12,
      alignSelf: 'center',
    },
    english: {
      fontSize: 16,
      marginBottom: 2,
    },
    rowMeta: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginTop: 4,
    },
    grammar: {
      fontSize: 13,
      fontStyle: 'italic',
    },
    sourceName: {
      fontSize: 11,
      fontWeight: '600',
    },
  });
}
