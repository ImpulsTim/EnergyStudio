# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Is

**Energy Studio** — a web application for Dutch energy cooperatives (Impuls Zeeland) to analyze energy consumption profiles. No build step, no server, no npm. To run: open `index.html` in a modern browser.

> Note: this file is partly historical. The app is no longer a single file — `index.html` holds the markup and loads a set of global-scope vanilla-JS modules (order matters; new modules load before `app.js`). See `README.md` for the current, accurate file list.

**Three top-level modules**, switched by the `.nav-tools` buttons + `PAGE_MAP` and the `.nav-btn` click loop in `ehp.js`; each is a full-page `<div class="app ehp-hide" id="pageXxx">` (sidebar `.sb` + content `.ct`), lazily rendered on nav-switch and from `renderAll()` (app.js):
- **Groepsprofiel (GTO)** — `#pageGto`, driven by `runAnalysis()` (app.js) + `charts/*.js` + report `rapport.js`.
- **Energiehandelsplatform (EHP)** — `#pageEhp`, `ehp.js` + `energiemodel.js` + report `rapport_ehp.js`.
- **Individuele analyse** — `#pageInd`, single-connection analysis: `individueel.js` (pure `calcInd()` + UI) + `charts/individueel.js` (5 charts on `cInd*` canvases) + report `rapport_ind.js`. Reuses `dbGet('ts',id)`, `_carrierSeries()`, `isDL()`, `sdesc()`, shared report helpers (`rapportCss`/`_rapCi`/`_fmt*`) and the shared preview modal `#mRap`. Stateless (no new persisted project data). Piek/dal and baseload method are isolated in `IND_CFG` at the top of `individueel.js`.

## Architecture

The app is structured as one HTML file with embedded CSS and JavaScript. All logic is global-scope vanilla JS.

**Data flow:**
```
CSV / JSON import → parseCSV() / parseJSON() → IndexedDB (EGP_v4) → runAnalysis() → Chart.js charts
```

**Persistence (IndexedDB, database name `EGP_v4`):**
- `ts` store — time series data per connection (15-minute interval readings)
- `meta` store — project state and connection metadata

**Global state:**
- `S` — top-level state object holding all projects and the active project ID
- Changes to `S` are persisted via `saveMeta()` / `loadMeta()`

**Key function groups:**

| Area | Functions |
|------|-----------|
| Project management | `createProj()`, `delProj()`, `renderProjSel()` |
| Connection management | `openAddComp()`, `saveComp()`, `deleteComp()` |
| Data import | `handleFile()`, `parseCSV()`, `parseJSON()` |
| Analysis engine | `runAnalysis()`, `genDemo()` |
| Charts (5 types) | `drawJaar()`, `drawWeek()`, `drawBDK()`, `drawOvsch()`, `drawPiek()` |
| IndexedDB helpers | `dbGet()`, `dbSet()`, `dbDel()` |
| Export | `doExportData()`, `doExportRapport()`, `doDownloadApp()` |

**Chart types (Chart.js 4.4.1 via CDN):**
1. Jaarprofiel — annual cumulative group power + per-connection trends
2. Weekprofiel — average/min/max patterns by day of week
3. BDK (Belastingduurkurve) — peak duration curve
4. Overschrijdingen — threshold exceedance detection
5. Piekanalyse — monthly peak analysis

**Key configuration objects in JS:**
- `SA` — tariff types (LS, MSdist, TrafoHS1, etc.)
- `ST` — system types with technical parameters (voltage ratio, copper/magnetic losses)
- `HOL` — Dutch public holidays keyed as `'MM-DD'`

## Input/Output Formats

- **Input:** CSV (timestamp; power, auto-detects `;` or `,` delimiter) or structured JSON (MEPS meter format)
- **Output:** JSON export (full data backup), print-to-PDF report, self-contained HTML snapshot of the entire app

## CDN Dependencies

- `Chart.js 4.4.1` — charting
- `html-to-image 1.11.13` — screenshot/export
- Google Fonts — Barlow family

The app overrides `fetch()` with a custom postMessage-based stream to support `html-to-image` in this context.

## Language

UI and all user-facing text is in Dutch.
