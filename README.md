# YidDict

A cross-platform mobile dictionary app for bidirectional Yiddish ↔ English lookup, supporting English, Hebrew script and YIVO standard transliteration.

## Features

- Search Yiddish→English and English→Yiddish
- Input in English, Hebrew script or YIVO transliteration
- Aggregates results from three sources:
  - **Finkel's dictionary** — `cs.engr.uky.edu/~raphael/yiddish`
  - **Verterbukh** — `verterbukh.org` [Verterbukh account required for access]
  - **Google Translate** - `https://translate.google.com`
- Offline access via local SQLite cache (fixed at 5000 entries)
- Save entries with one tap (default max 500, configurable in Settings); export to CSV or TSV (UTF-8 BOM)
- Experimental YIVO ↔ Hebrew script auto-generation for entries missing one
- Fully configurable Settings: search source order, Verterbukh login/session behavior, cache duration, alert toggles/thresholds, theme (light/dark/system)

## Status

In development — Phases 1–6 complete (foundation, all three dictionary sources, Saved screen, Settings). Phase 7 (bug sweep, UI polish) in progress ahead of beta release (0.1.0).
