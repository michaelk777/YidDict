# YidDict

A cross-platform mobile dictionary app for bidirectional Yiddish ↔ English lookup, supporting both Hebrew script and YIVO standard transliteration.

## Features

- Search Yiddish→English and English→Yiddish
- Input in Hebrew script or YIVO transliteration
- Aggregates results from three sources:
  - **Finkel's dictionary** — `cs.engr.uky.edu/~raphael/yiddish`
  - **Verterbukh** — `verterbukh.org`
  - **Google Translate**
- Offline access via local SQLite cache (fixed at 5000 entries)
- Save entries with one tap (default max 500, configurable in Settings, with an optional alert before a save trims older entries); export to CSV or TSV (UTF-8 BOM)
- Experimental rule-based YIVO ↔ Hebrew script auto-generation for entries missing one form
- Fully configurable Settings: search source order, Verterbukh login/session behavior, cache duration, alert toggles/thresholds, theme (light/dark/system)
- In-app About page
- Light and dark mode

## Status

In development — Phases 1–6 complete (foundation, all three dictionary sources, Saved screen, Settings). Phase 7 (bug sweep, UI polish) in progress ahead of beta release. Current version 0.1.0.
