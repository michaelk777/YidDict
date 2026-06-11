export interface GrammarSegment {
  text: string;
  emphasized: boolean;
}

/**
 * Splits a single line of `grammaticalInfo` on `*...*` markers — used by the
 * Verterbukh parser to flag inline case annotations (e.g. "DAT"/"דאַט") baked
 * directly into a phrase — into plain and emphasized segments for rendering.
 */
export function parseGrammarSegments(line: string): GrammarSegment[] {
  const segments: GrammarSegment[] = [];
  const regex = /\*([^*]+)\*/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(line)) !== null) {
    if (match.index > lastIndex) {
      segments.push({ text: line.slice(lastIndex, match.index), emphasized: false });
    }
    segments.push({ text: match[1], emphasized: true });
    lastIndex = regex.lastIndex;
  }
  if (lastIndex < line.length) {
    segments.push({ text: line.slice(lastIndex), emphasized: false });
  }
  return segments;
}
