# YidDict

A cross-platform mobile dictionary app for bidirectional Yiddish ↔ English lookup, supporting both Hebrew script and YIVO standard romanization.

## Features

- Search Yiddish→English and English→Yiddish
- Input in Hebrew script or YIVO romanization
- Aggregates results from three sources:
  - **Finkel's dictionary** — `cs.engr.uky.edu/~raphael/yiddish` (free)
  - **Verterbukh** — `verterbukh.org` (freemium)
  - **Google Translate** (free fallback)
- Offline access via local SQLite cache (default 90-day TTL, default max 1000 entries; both configurable in Settings)
- Save entries with one tap; export to Anki-compatible CSV or TSV (UTF-8 BOM, with Tags column)
- Configurable source order, Verterbukh login, and low-token alert threshold in Settings
- Light and dark mode

## Status

In development — Phases 1–5 complete. Settings polish and device testing in progress. Pre-release items: Finkel bare-text-node parser fix; Google Translate live integration tests.
