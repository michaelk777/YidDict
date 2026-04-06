# Finkel Dictionary — API Notes

Endpoint: `https://www.cs.engr.uky.edu/~raphael/yiddish/dictionary.cgi`

## Form Parameters

`Content-Type: application/x-www-form-urlencoded`, method `POST`.

| Field | Type | Description |
|-------|------|-------------|
| `word` | text | Search query — English, YIVO romanization, or Hebrew script. **Server auto-detects script.** Partial/fragment match by default. |
| `wholeWord` | checkbox (`on`) | Restrict to exact whole-word matches. Omit for partial matching (default in YidDict). |
| `base` | text | Supply a full *inflected* form; server derives the stem and returns the base entry. Used by YidDict as a Stage 2 fallback when `word=` returns nothing. |

**YidDict lookup strategy**: POST `word=<query>` first. If no results, POST `base=<query>`. This transparently handles both stem and inflected input in a single search bar.

## Response HTML Structure

Results appear in the **first `<ul>`** element that contains at least one `.definition` span. This `<ul>` sits between the two `<form>` blocks in the page. When no match is found the page returns no `<ul>` at all.

### CSS classes

| Class | Content |
|-------|---------|
| `lexeme` | YIVO romanization of the headword. May end with `(` when a Hebrew form follows. May contain `goodmatch` / `weakmatch` spans (matched portion highlight). |
| `hebrew` | Hebrew script form. **Sibling of `.lexeme`**, not nested inside it. First occurrence = base form; later occurrences = plural/other inflected forms. |
| `grammar` | Grammatical annotation (part of speech, gender, plural pattern, etc.). Multiple per entry — first is usually the POS, rest are conjugation info. |
| `definition` | English gloss. |
| `source` | Usage tag (e.g., `indeclinable`). |
| `goodmatch` | Exact-match highlight inside `lexeme`. |
| `weakmatch` | Partial-match highlight inside `lexeme`. |

### Entry structure

Top-level `<li>` children alternate between two types:

1. **Main entry**: has a direct `.lexeme` child.
2. **Phrase container**: no direct `.lexeme`; wraps a nested `<ul>` of phrase/idiom sub-entries.

Phrase containers may nest recursively (phrases that have sub-phrases).

## Observed behaviour (verified 2026-04-05)

- `POST word=sheyn` → returns ~10 entries including main adjective entry, related idioms, and loshn-koydesh entries containing the fragment.
- `POST word=xyznotaword123` → response contains no `<ul>`, `parseFinkelHtml` returns `[]`.
- No authentication required, no CSRF token, no rate-limit observed during testing.

## Integration test note

Unit tests (`finkelService.test.ts`) run against static HTML fixtures captured from real responses. These fixtures should be refreshed periodically and **real-world integration tests** (hitting the live endpoint) should be run before each release to confirm the parser still matches the live HTML structure. Finkel is a personal academic project and the HTML may change without notice.
