[![make.fun bounty](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![make.fun rank](https://make.fun/badge/token-radar-01/ariana889/token-radar/rank.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![make.fun reward](https://make.fun/badge/token-radar-01/ariana889/token-radar/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

# Token Launch Radar

Every protocol DefiLlama tracks, ranked by what its token launch would be worth.

Out of **9,116** protocols in the snapshot, **4,639** already record a token and **3,466** more are too small (TVL under $100k) or are wrapped, staked, bridged or centralized products. That leaves a **watchlist of 696 protocols with no token** — each one ranked by an implied launch value and given a concrete farm plan.

## Top 5 by implied launch value

| # | Protocol | Category | TVL | Implied value |
|---|----------|----------|-----|---------------|
| 1 | Sentora Curator | Risk Curators | $2.68B | $719.6M |
| 2 | Gauntlet | Risk Curators | $1.58B | $424.8M |
| 3 | Veda | Onchain Capital Allocator | $1.44B | $387.4M |
| 4 | Polymarket International | Prediction Market | $319.9M | $257.4M |
| 5 | RocketSwap Anubis V2 | Dexs | $403.0M | $161.2M |

Open `dashboard/index.html` in a browser (no server, no network needed) to explore the full board, filter by category or chain, and open any protocol's detail view with its farm plan.

## How the ranking works

**Who is on the board.** A protocol enters the watchlist when all of these hold:

- DefiLlama records **no token** for it: no contract address, no CoinGecko id, no CoinMarketCap id. A symbol alone does not count — a centralized exchange can list a symbol with no token.
- TVL is at least **$100,000**.
- Its category is not excluded: CEX, Bridge, Canonical Bridge, Cross Chain Bridge, Interface, Liquid Staking, Liquid Restaking, Restaked BTC, Restaking, Staking Pool, Stablecoin Wrapper, Chain.
- Its name is not on the manual exclusion list, and neither its name nor its description reads as a wrapped, staked, pegged or restaked product (for example Bittensor's dTAO pools and the Lightning Network are excluded by hand, with reasons in `dossier.json`).

**What a launch would be worth.** Two legs, both calibrated on tokenized protocols:

- **TVL leg:** `TVL × category multiple`, where the category multiple is the median mcap/TVL of tokenized protocols in the same category (TVL ≥ $1M, mcap > 0, at least 5 comparables). When a category has too few comparables, the global median **0.2683** is used.
- **Revenue leg:** `annualized revenue × 7.91`, where 7.91 is the median mcap/annualized-revenue of tokenized protocols with mcap > 0 and annualized revenue > 0 (n = 344). Revenue is the protocol's own take, not gross fees — gross fees overstate meme and prediction volume.

```
impliedValue = max(tvlValue, min(revenueValue, 3 × tvlValue))
```

Revenue is a noisier signal than TVL, so its lift over the TVL value is capped at 3×. The `valueLeg` field on each row says which leg set the value (`tvl`, `revenue`, or `revenue-capped`).

**Farm plans.** One playbook per category family (DEX, lending, yield, derivatives, prediction, RWA, CDP, launchpad, curator, basis, generic), parameterized with the protocol's own name, primary chain and site — six concrete steps each, plus what to watch and the risks. A launch is **never guaranteed**, and every plan says so.

## Run it

Requires Node.js 22 or later. No dependencies, no network at run time — the snapshots are committed under `data/`.

```sh
node main.ts        # regenerates board.json, dossier.json and dashboard/index.html
```

Two runs produce byte-identical outputs (verified with sha256).

## Files

| File | What it is |
|------|-----------|
| `main.ts` | The whole program: loads the snapshots, computes multiples, builds the board, writes all outputs. |
| `data/protocols.json` | DefiLlama protocol list, 9,116 protocols (fetched 2026-11-26). |
| `data/revenue.json` | Annualized revenue per protocol, 2,474 with revenue > 0 (fetched 2026-11-26). |
| `data/exclusions.json` | Manual exclusions, with reasons. |
| `board.json` | The ranked board: 696 rows, each with TVL, revenue, implied value and farm plan. |
| `dossier.json` | Methodology, formula, multiples, exclusion counts, top 10, and a dossier per protocol. |
| `dashboard/index.html` | The static dashboard: board, filters, detail view per protocol. No external resources. |
| `screenshots/` | Board, detail view, filtered view (see `SCREENSHOTS.md`). |
| `GAPS.md` | What could not be built from the public spec alone. |

## Data sources

- Protocol list: `https://api.llama.fi/protocols` (fetched 2026-11-26).
- Annualized revenue: `https://api.llama.fi/overview/fees?excludeTotalCost=true&dataType=dailyRevenue` (fetched 2026-11-26).
- Snapshot dates are recorded in `dossier.json`.

## Caveats

- "No token" is what DefiLlama records. A protocol may have announced a token, or be about to, without DefiLlama recording one yet.
- Implied value is a comparables estimate, not a price target. Category multiples vary widely (Dexs 0.3999, Lending 0.1333, Derivatives 1.3406, Yield Aggregator 0.0635) and the revenue multiple is a single median across very different businesses.
- Farming a launch costs real time and fees and may pay nothing. The farm plans are research, not financial advice.
