# Screenshots — steps for the parent's live browser task

The 3 required screenshots could not be taken on this VM (see `GAPS.md` §4).
Take them with the live browser from the dashboard, which renders with no
network and supports hash states so each view can be targeted directly.

## Setup

Serve the repo root over HTTP (the dashboard works from `file://` too, but
a local server is the reliable path for the browser task):

```sh
cd ~/workspace/makefun/tokenradar-entry
python3 -m http.server 8931
```

Then open `http://localhost:8931/dashboard/index.html` in the browser.
The board table renders on load (696 rows).

## The three shots

Save all three under `screenshots/` in the repo, at 1440 × 900 if the
browser task allows it.

### 1. Board — `screenshots/board.png`

- URL: `http://localhost:8931/dashboard/index.html`
- Expect: header "Token Launch Radar", the "How the board is ranked" card,
  the Top 5 card, the filter controls, and the board table starting with
  #1 Sentora Curator ($719.6M), #2 Gauntlet ($424.8M), #3 Veda ($387.4M).
- Capture the full page or the top viewport — the table's first rows must
  be visible.

### 2. Protocol detail view — `screenshots/detail.png`

- URL: `http://localhost:8931/dashboard/index.html#detail=polymarket-international`
- Expect: the detail panel scrolled into view for **Polymarket
  International** (#4, Prediction Market, implied value $257.4M,
  revenue-capped), showing its thesis, the implied-value breakdown
  (TVL $319.9M × multiple, revenue $173.2M/yr × 7.91, leg
  revenue-capped), its description, and the farm plan (summary, 6 steps,
  watch, risks).
- If the hash state does not scroll the panel into view, click the
  Polymarket International row in the board table instead, then capture.

### 3. Filtered view — `screenshots/filtered.png`

- URL: `http://localhost:8931/dashboard/index.html#cat=Derivatives`
- Expect: the board filtered to the **Derivatives** category only, with the
  count line reading "N of 696 protocols" (N is the number of Derivatives
  rows — verify it is not 696) and the first row being Extended Perps
  (#9 overall, $106.1M). The category dropdown should show "Derivatives".
- Alternative filtered view if the hash state does not apply: set the
  Category dropdown to Derivatives manually, or use
  `#q=polymarket` (search) instead and note the change here.

## Verify before committing

- All three files exist under `screenshots/` and are non-empty PNGs.
- `board.png` shows the board with the top rows.
- `detail.png` shows a protocol detail panel (not just the board).
- `filtered.png` shows a filtered board (count line ≠ 696).
- Then commit them and push (see the parent's submit checklist).
