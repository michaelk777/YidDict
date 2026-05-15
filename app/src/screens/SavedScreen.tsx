import React, { useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  Alert,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../context/ThemeContext';
import { useSaved } from '../context/SavedContext';
import { DictSource, SOURCE_LABELS } from '../db/settingsDb';
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
    Alert.alert(
      'Export Format',
      'Choose a file format.',
      [
        { text: 'CSV', onPress: () => exportAs('csv') },
        { text: 'TSV', onPress: () => exportAs('tsv') },
        { text: 'Cancel', style: 'cancel' },
      ]
    );
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
          <Text style={[s.actionBtnText, { color: theme.textSecondary }]}>Export CSV</Text>
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
        <View style={s.rowTop}>
          <View style={s.headwords}>
            {entry.yiddishRomanized ? (
              <Text style={[s.romanized, { color: theme.text }]}>{entry.yiddishRomanized}</Text>
            ) : null}
            {entry.yiddishHebrew ? (
              <Text style={[s.hebrew, { color: theme.text }]}>{entry.yiddishHebrew}</Text>
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

        {entry.english ? (
          <Text style={[s.english, { color: theme.text }]}>{entry.english}</Text>
        ) : null}

        <View style={s.rowMeta}>
          {entry.partOfSpeech ? (
            <Text style={[s.grammar, { color: theme.textSecondary }]}>
              {entry.partOfSpeech}
              {entry.grammaticalInfo ? `  ${entry.grammaticalInfo}` : ''}
            </Text>
          ) : null}
          <Text style={[s.sourceName, { color: sourceColor }]}>
            {SOURCE_LABELS[entry.source as DictSource]}
          </Text>
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
    headwords: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'baseline',
      gap: 8,
    },
    romanized: {
      fontSize: 16,
      fontWeight: '600',
    },
    hebrew: {
      fontSize: 17,
      writingDirection: 'rtl',
    },
    english: {
      fontSize: 15,
      marginBottom: 4,
    },
    rowMeta: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
    },
    grammar: {
      fontSize: 12,
      fontStyle: 'italic',
    },
    sourceName: {
      fontSize: 11,
      fontWeight: '600',
    },
  });
}
