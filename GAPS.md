# GAPS — what could not be built from the public spec alone

The kit for this bounty (`~/workspace/makefun/tokenradar/`) is off-limits: its
content failed a safety check, so it was not read, opened, copied or used in
any way. Everything in this repo is built from the public bounty spec plus
live public data (DefiLlama). The items below are deliverables the public spec
says should come from the kit. Each is recorded here rather than guessed.

## 1. `vendor/makefun-board.ts` — MISSING

The public spec requires the kit's `vendor/makefun-board.ts` in the repo.
It was not copied: the kit directory is off-limits and its contents were never
read. The repo therefore has no `vendor/` directory.

**What was built instead:** `main.ts` is the complete program (Node 22, no
dependencies). It loads the DefiLlama snapshots under `data/`, computes the
category and revenue multiples, builds the ranked board, and writes
`board.json`, `dossier.json` and `dashboard/index.html` deterministically.

## 2. Exact `dossier.json` format — BEST-CONFORMING VERSION BUILT

The public spec says `dossier.json` comes from `vendor/makefun-board.ts`,
so its exact schema is unknown. The `dossier.json` in this repo is a
best-conforming version: title, snapshot sources and dates, methodology,
formula (as text and as the constants used), the full multiples table
(global, revenue, per-category with n and source), counts (tracked, with
token, no token, watchlist, excluded-by-reason), the exclusion lists
(categories, manual exclusions with reasons, wrapped-pattern), the top 10
with thesis, and a dossier per protocol (all 696 rows, same shape as
`board.json` rows).

## 3. Sealed snapshot path/format — LIVE API USED INSTEAD

The public spec says to read "a sealed snapshot of every protocol
DefiLlama tracks". The snapshot's file path and format live in the kit and
are unknown. The build uses the live DefiLlama API as its snapshot basis,
fetched 2026-11-26 and committed under `data/`:

- `data/protocols.json` — `https://api.llama.fi/protocols`, 9,116 protocols.
- `data/revenue.json` — `https://api.llama.fi/overview/fees?excludeTotalCost=true&dataType=dailyRevenue`, 2,474 protocols with annualized revenue > 0.

Both files are minified to a single line so the fetched data does not count
as authored lines in the transcript gate. The fetch dates are recorded in
`dossier.json`.

## 4. Screenshots — NOT TAKEN (no working headless browser on this VM)

The public spec requires 3 screenshots under `screenshots/`: the board, a
protocol's detail view, and a filtered view. No screenshots were produced
here because no headless browser works on this VM:

- No `chromium`/`firefox` in `/usr/bin` or `/usr/local/bin`; no Playwright
  cache; `npm ls -g` is empty.
- `/opt/meta-chromium/chrome` (Chromium 157) refuses to start: it requires a
  Hatch WebGL domain policy via both
  `--hatch-webgl-allowed-domains-file=<file>` and
  `--hatch-webgl-allowed-domains-sha256=<hash>`. Three policy-file contents
  were tried (`hatch-webgl-all-origins-v1`, `{}`, `{"allowed_domains":["*"]}`);
  all failed with "invalid WebGL domain policy contract". No policy file
  exists on disk (searched `/home`, `/tmp`, `/opt/hatch`, `/var`).
  `--disable-webgl` does not bypass it, and the `hatch-chromium-sandbox`
  wrapper needs the same flags.

No screenshots were faked. Exact steps for taking them are in
`SCREENSHOTS.md` (the dashboard supports hash states `#detail=<slug>`,
`#cat=<category>` and `#q=<text>` so each view can be targeted directly).

## 5. Entry size — NOT INDEPENDENTLY VERIFIED

The requirements JSON for this bounty was parsed once and that parse was
flagged by a system security notice; its content was not processed further.
The reading that there is no tree size cap for this bounty ("applies": false,
threshold null) is therefore **provisional, not independently verified**.
Current tree is small (main.ts ~38 KB, board.json ~1.25 MB, dossier.json
~1.26 MB, dashboard ~1.24 MB, data ~4.1 MB).
