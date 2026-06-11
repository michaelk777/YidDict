import React from 'react';
import { View, Text, StyleProp, TextStyle, StyleSheet } from 'react-native';
import { parseGrammarSegments } from '../utils/grammarText';

interface Props {
  text: string;
  style?: StyleProp<TextStyle>;
  separatorColor?: string;
}

/**
 * Renders `grammaticalInfo` text (one or more `\n`-separated lines, each a
 * distinct grammar entry — POS summary, secondary sense, or phrase), rendering
 * any `*...*`-marked inline case annotation (e.g. "DAT"/"דאַט") bold and
 * non-italic so it stands out from the surrounding (italic) phrase text.
 *
 * When `separatorColor` is given and there's more than one entry, a hairline
 * rule is drawn above each entry after the first, distinguishing entry
 * boundaries from the line wraps within a single (often multi-line) entry.
 */
export function GrammarText({ text, style, separatorColor }: Props) {
  const lines = text.split('\n');
  return (
    <View>
      {lines.map((line, lineIndex) => (
        <Text
          key={lineIndex}
          style={[
            style,
            lineIndex > 0 && separatorColor
              ? [styles.separated, { borderTopColor: separatorColor }]
              : null,
          ]}
        >
          {parseGrammarSegments(line).map((segment, segmentIndex) =>
            segment.emphasized ? (
              <Text key={segmentIndex} style={styles.emphasis}>
                {segment.text}
              </Text>
            ) : (
              segment.text
            )
          )}
        </Text>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  emphasis: {
    fontWeight: 'bold',
    fontStyle: 'normal',
  },
  separated: {
    marginTop: 4,
    paddingTop: 4,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
});
