# YidDict

A cross-platform mobile dictionary app for bidirectional Yiddish ↔ English lookup, supporting both Hebrew script and YIVO standard romanization.

## Features

- Search Yiddish→English and English→Yiddish
- Input in Hebrew script or YIVO romanization
- Aggregates results from three sources:
  - **Finkel's dictionary** — `cs.engr.uky.edu/~raphael/yiddish`
  - **Verterbukh** — `verterbukh.org`
  - **Google Translate**
- Offline access via local SQLite cache (max 1000 entries)
- Save entries with one tap (default max 500 entries configurable in Settings); export to CSV or TSV (UTF-8 BOM)
- Configurable search source order, Verterbukh access, and low-token alert threshold configurable in Settings
- Light and dark mode

## Status

In development — Phases 1–5 complete. Settings polish and device testing in progress. Pre-release items: Finkel bare-text-node parser fix; Google Translate live integration tests.
