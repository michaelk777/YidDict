# YidDict

A cross-platform mobile dictionary app for bidirectional Yiddish ↔ English lookup, supporting both Hebrew script and YIVO standard romanization.

## Features

- Search Yiddish→English and English→Yiddish
- Input in Hebrew script or YIVO romanization
- Aggregates results from two authoritative sources:
  - **Finkel's dictionary** — `cs.engr.uky.edu/~raphael/yiddish`
  - **Verterbukh** — `verterbukh.org`
- Offline access via local SQLite cache (default 90-day TTL, default max 1000 entries; both configurable in Settings)
- Search history with Anki CSV export option for language learners
- Light and dark mode

## Status

In development — Phase 3 partially complete. Verterbukh auth module, HTML parser, and Settings screen (login/logout) are in place. Verterbukh search integration with SearchScreen is next.
