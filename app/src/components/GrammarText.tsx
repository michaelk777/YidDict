import React from 'react';
import { Text, StyleProp, TextStyle, StyleSheet } from 'react-native';
import { parseGrammarSegments } from '../utils/grammarText';

interface Props {
  text: string;
  style?: StyleProp<TextStyle>;
}

/**
 * Renders `grammaticalInfo` text (one or more `\n`-separated lines), rendering
 * any `*...*`-marked inline case annotation (e.g. "DAT"/"דאַט") bold and
 * non-italic so it stands out from the surrounding (italic) phrase text.
 */
export function GrammarText({ text, style }: Props) {
  const lines = text.split('\n');
  return (
    <Text style={style}>
      {lines.map((line, lineIndex) => (
        <React.Fragment key={lineIndex}>
          {lineIndex > 0 ? '\n' : ''}
          {parseGrammarSegments(line).map((segment, segmentIndex) =>
            segment.emphasized ? (
              <Text key={segmentIndex} style={styles.emphasis}>
                {segment.text}
              </Text>
            ) : (
              segment.text
            )
          )}
        </React.Fragment>
      ))}
    </Text>
  );
}

const styles = StyleSheet.create({
  emphasis: {
    fontWeight: 'bold',
    fontStyle: 'normal',
  },
});
