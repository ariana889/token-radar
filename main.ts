// Token Launch Radar — main.ts
//
// Reads a sealed snapshot of every protocol DefiLlama tracks
// (data/protocols.json, fetched 2026-11-26 from https://api.llama.fi/protocols)
// plus a revenue snapshot (data/revenue.json, DefiLlama dailyRevenue),
// finds the protocols that still record no token and are not a wrapped or
// staked product of an asset that already trades, ranks them by what their
// launch would be worth, and writes board.json, dossier.json and the static
// dashboard/ page. No network access: everything is read from the snapshots
// committed in this repository, so two runs on the same data are byte
// identical. Run with Node 22.18+ (or 24): `node main.ts`.
//
// Implied value (see README.md for the full methodology):
//   tvlValue = TVL * categoryMultiple
//     categoryMultiple = median(mcap / TVL) of tokenized protocols in the
//     same category with TVL >= $1M and mcap > 0, when at least 5 such
//     comparables exist; otherwise the global median (0.2683 on this snapshot).
//   revValue = annualizedRevenue * revenueMultiple
//     revenueMultiple = median(mcap / annualizedRevenue) of tokenized
//     protocols with mcap > 0 and annualized revenue > 0 (8.05 here).
//   impliedValue = max(tvlValue, min(revValue, 3 * tvlValue))
//     Revenue is a noisier, more volatile signal than TVL, so its lift over
//     the TVL value is capped at 3x: it credits genuinely high-earning
//     protocols (Polymarket) without letting one hot quarter, or a meme
//     launchpad's fee flow, dominate the board.

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(ROOT, "data");
const DASHBOARD_DIR = join(ROOT, "dashboard");

// --- thresholds (documented in README.md) ---------------------------------
const TVL_MIN = 100_000; // a launch needs measurable value locked
const COMPARABLE_TVL_MIN = 1_000_000; // comparables need real scale
const MIN_COMPARABLES = 5; // category median needs at least this many
const REV_LIFT_CAP = 3; // revenue may lift the TVL value at most 3x

// Categories whose TVL is not their own launchable value: centralized
// exchanges (their token, where one exists, is equity or already trades),
// bridges and canonical bridges (they move assets that already trade),
// front-ends (no protocol of their own), and every form of staked /
// restaked / wrapped product (the underlying already trades).
const EXCLUDED_CATEGORIES = new Set([
  "CEX",
  "Canonical Bridge",
  "Interface",
  "Liquid Staking",
  "Liquid Restaking",
  "Staking Pool",
  "Bridge",
  "Cross Chain Bridge",
  "Restaked BTC",
  "Restaking",
  "Stablecoin Wrapper",
  "Chain",
]);

// Name/description pattern for wrapped, staked and pegged products.
const WRAPPED_PATTERN = /wrapped|wbtc|pegged|staked|restak|liquid stak/i;

// --- types ------------------------------------------------------------------
interface RawProtocol {
  id: string;
  name: string;
  slug: string;
  address: string | null;
  symbol: string | null;
  gecko_id: string | null;
  cmcId: string | null;
  category: string | null;
  chain: string | null;
  chains: string[];
  tvl: number;
  mcap: number;
  url: string | null;
  twitter: string | null;
  description: string | null;
}

interface FarmPlan {
  summary: string;
  steps: string[];
  watch: string;
  risks: string[];
}

interface BoardRow {
  rank: number;
  protocol: string;
  slug: string;
  category: string;
  chains: string[];
  primaryChain: string;
  tvl: number;
  annualizedRevenue: number;
  multiple: number;
  multipleSource: "category" | "global";
  tvlValue: number;
  revenueValue: number;
  impliedValue: number;
  valueLeg: "tvl" | "revenue" | "revenue-capped";
  url: string;
  twitter: string;
  description: string;
  thesis: string;
  farmPlan: FarmPlan;
}

// --- snapshot loading -------------------------------------------------------
function loadJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, "utf8")) as T;
}

interface ProtocolsSnapshot {
  snapshot: { source: string; fetchedAt: string; count: number };
  protocols: RawProtocol[];
}

interface RevenueSnapshot {
  snapshot: { source: string; fetchedAt: string };
  annualizedRevenue: Record<string, number>;
}

const protocolsSnap = loadJson<ProtocolsSnapshot>(join(DATA_DIR, "protocols.json"));
const revenueSnap = loadJson<RevenueSnapshot>(join(DATA_DIR, "revenue.json"));
const manualExclusions = loadJson<{ exclusions: { name: string; reason: string }[] }>(
  join(DATA_DIR, "exclusions.json"),
);
const MANUAL_EXCLUDED = new Map(
  manualExclusions.exclusions.map((e) => [e.name, e.reason]),
);

const PROTOCOLS = protocolsSnap.protocols;
const ANNUALIZED_REVENUE = revenueSnap.annualizedRevenue;

// --- helpers ----------------------------------------------------------------
function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const n = sorted.length;
  if (n === 0) return 0;
  const mid = Math.floor(n / 2);
  return n % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function hasToken(p: RawProtocol): boolean {
  return Boolean(p.address || p.gecko_id || p.cmcId);
}

function round0(n: number): number {
  return Math.round(n);
}

function money(n: number): string {
  if (n >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `$${(n / 1e3).toFixed(1)}K`;
  return `$${Math.round(n)}`;
}

// --- comparables: category and revenue multiples ----------------------------
// Tokenized = has a token, TVL >= $1M, mcap > 0. The multiples are computed
// from the snapshot itself, so they move with the data and are identical on
// every run.
const tokenized = PROTOCOLS.filter(
  (p) => hasToken(p) && p.tvl >= COMPARABLE_TVL_MIN && p.mcap > 0,
);
const byCategory = new Map<string, number[]>();
for (const p of tokenized) {
  const cat = p.category ?? "Unknown";
  const list = byCategory.get(cat) ?? [];
  list.push(p.mcap / p.tvl);
  byCategory.set(cat, list);
}
const GLOBAL_MULTIPLE = median(tokenized.map((p) => p.mcap / p.tvl));
const CATEGORY_MULTIPLES = new Map<string, { multiple: number; n: number; source: "category" | "global" }>();
for (const [cat, values] of byCategory) {
  if (values.length >= MIN_COMPARABLES) {
    CATEGORY_MULTIPLES.set(cat, { multiple: median(values), n: values.length, source: "category" });
  }
}

const revenueComparables = PROTOCOLS.filter((p) => hasToken(p) && p.mcap > 0)
  .map((p) => {
    const ann = ANNUALIZED_REVENUE[p.id] ?? 0;
    return ann > 0 ? p.mcap / ann : 0;
  })
  .filter((v) => v > 0);
const REVENUE_MULTIPLE = median(revenueComparables);

function multipleFor(category: string | null): { multiple: number; n: number; source: "category" | "global" } {
  const entry = category ? CATEGORY_MULTIPLES.get(category) : undefined;
  if (entry) return entry;
  return { multiple: GLOBAL_MULTIPLE, n: 0, source: "global" };
}

// --- watchlist: no token, not a wrapped/staked product ---------------------
// A protocol is IN when DefiLlama records no token for it (no contract
// address, no CoinGecko id, no CoinMarketCap id), its TVL is at least
// TVL_MIN, its category is not an excluded one, its name is not on the
// manual exclusion list, and neither its name nor the start of its
// description reads as a wrapped, staked, pegged or restaked product.
function exclusionReason(p: RawProtocol): string | null {
  if (hasToken(p)) return "has token";
  if (p.tvl < TVL_MIN) return "TVL below $100k";
  if (p.category && EXCLUDED_CATEGORIES.has(p.category)) return `category: ${p.category}`;
  const manual = MANUAL_EXCLUDED.get(p.name);
  if (manual) return `manual: ${manual}`;
  if (WRAPPED_PATTERN.test(`${p.name} ${(p.description ?? "").slice(0, 200)}`)) {
    return "wrapped/staked product";
  }
  return null;
}

const exclusionCounts = new Map<string, number>();
function countExclusion(reason: string): void {
  exclusionCounts.set(reason, (exclusionCounts.get(reason) ?? 0) + 1);
}

// --- farm plans: one playbook per category family ---------------------------
// Steps are parameterized with the protocol's own name, primary chain and
// site, so each plan is concrete for that protocol. A launch is never
// guaranteed; every plan says so in its risks.
type Playbook = { steps: string[]; watch: string; risks: string[] };

const PLAYBOOKS: Record<string, Playbook> = {
  dex: {
    steps: [
      "Trade on {name} on {chain}: swap a real amount, not a dust trade, and keep the receipts (tx hashes) for your own records.",
      "Provide liquidity to the largest pool on {chain} and hold the LP position through at least one snapshot/epoch instead of farming and dumping.",
      "Use the DEX weekly rather than once: sustained activity across weeks scores better than a single burst.",
      "If {name} runs a points or quest program, complete it; if it does not, regular trading and LP volume is the position.",
      "Bridge the assets you need to {chain} through the chain's official bridge so the funds are in place before you trade.",
      "Track {name}'s TVL and volume on DefiLlama and its announcements on {url} — a points program usually precedes a launch.",
    ],
    watch: "TVL and volume on {chain}; a points program or airdrop hint on the site or Twitter.",
    risks: ["Impermanent loss on LP positions.", "A token may never launch; do not pay for exposure you would not want anyway.", "Smart-contract risk on a young DEX."],
  },
  lending: {
    steps: [
      "Supply a blue-chip asset (ETH, a major stablecoin) to {name} on {chain} and leave the supply in place across snapshots.",
      "Borrow a small amount against it and repay in full: the full supply-borrow-repay loop is the usage a launch would reward.",
      "Keep your health factor well above liquidation; never borrow the maximum.",
      "Supply on the chain with the deepest markets for {name} (see the chains column) to avoid thin-market rates.",
      "Check supply/borrow APYs weekly; move supply only when the rate gap is worth the gas.",
      "Watch for new markets and collateral types on {name} — early users of a new market are the ones a launch remembers.",
    ],
    watch: "Utilization, new markets and collateral listings; any points program.",
    risks: ["Liquidation if collateral falls or borrow rates spike.", "Bad-debt and oracle risk on thin markets.", "A token may never launch."],
  },
  yield: {
    steps: [
      "Deposit into the highest-TVL vault or strategy {name} runs on {chain}.",
      "Hold the deposit through at least one harvest or epoch so the position is visible in snapshots.",
      "Compound or restake the rewards instead of selling them immediately.",
      "Try a second strategy only if the gas cost is small relative to the deposit.",
      "Read the strategy description: know what the vault actually does (lending, LP, basis) before sizing up.",
      "Check whether the vault has a points program and whether deposits are capped.",
    ],
    watch: "Strategy changes, fee updates and vault caps; net APY after fees.",
    risks: ["Strategy risk: the underlying strategy can lose money.", "Vault smart-contract risk.", "Advertised APY is not guaranteed."],
  },
  derivatives: {
    steps: [
      "Open a small perpetual or options position on {name} on {chain}; size it so a liquidation would not hurt.",
      "Trade in both directions over time (longs and shorts) rather than a single one-way bet.",
      "If {name} offers a market-making vault or LP pool, provide liquidity to it as well as trading.",
      "Use stop-losses and keep leverage low; funding bleed punishes big leveraged holds.",
      "Trade regularly across weeks, not as a single wash trade — volume history is the signal.",
      "Watch funding rates, open interest and new markets on {name}.",
    ],
    watch: "Open interest, funding rates and new markets; any trading-rewards season.",
    risks: ["Liquidation and funding bleed on leveraged positions.", "Thin markets can gap through stops.", "A token may never launch."],
  },
  prediction: {
    steps: [
      "Trade real markets on {name} (politics, sports, crypto) and hold positions to resolution instead of flipping instantly.",
      "Provide liquidity to markets if {name} offers it; market makers are usually the best-rewarded users.",
      "Trade across several market categories, not one market only.",
      "Keep a history of settled markets; a record of resolved positions is stronger than one open bet.",
      "Follow new market listings and resolution rules on {name}.",
      "Size bets as entertainment money: never bet what you cannot afford to lose.",
    ],
    watch: "New market categories, fee changes and any rewards season.",
    risks: ["Markets can resolve against you; losses are real money.", "Regulatory risk for prediction markets in some jurisdictions.", "A token may never launch."],
  },
  rwa: {
    steps: [
      "Buy or hold the tokenized asset {name} offers on {chain} (T-bills, credit, commodities) in a size you are comfortable holding.",
      "Hold through the lock or epoch so the position is visible in snapshots.",
      "Reinvest distributions instead of withdrawing them immediately.",
      "Read the issuer, the underlying asset and the audit/attestation before buying.",
      "Use {name}'s primary market rather than a secondary listing where possible.",
      "Track the asset's backing and any redemption queue or lockup.",
    ],
    watch: "New asset listings, issuer reports and attestation updates.",
    risks: ["Issuer and counterparty risk: the token is only as good as its backing.", "Redemption queues or jurisdictional restrictions.", "A governance token may never launch."],
  },
  cdp: {
    steps: [
      "Open a vault/CDP on {name} on {chain} with a blue-chip collateral (ETH or a major liquid-staked asset).",
      "Mint a modest amount of the stablecoin — well below the maximum — and keep the collateral ratio high.",
      "Repay and re-mint once to show the full loop, then hold a steady position.",
      "Use the protocol's automation (auto-repay / auto top-up) if offered, so a dip does not liquidate you.",
      "Watch the peg and the stability fee: a rising fee is the cost of staying in.",
      "Follow new collateral types; early users of a new collateral are often rewarded.",
    ],
    watch: "Stability fee, peg and new collateral types.",
    risks: ["Liquidation if collateral falls.", "Peg breaks and oracle risk.", "A governance token may never launch."],
  },
  launchpad: {
    steps: [
      "Join one launch on {name} on {chain} with a small size first to learn the flow (whitelist, sale, claim).",
      "Hold the launched token through vesting/claim instead of selling at the first unlock.",
      "If {name} has allocation tiers (stake or lock for a bigger allocation), stake the minimum tier only if you would hold anyway.",
      "Complete KYC/whitelist steps early; launches often close before the sale starts.",
      "Track the launch calendar and pick quality: most launches lose value, so be selective.",
      "Never send funds to a copycat launchpad: verify the URL is {url}.",
    ],
    watch: "Launch calendar, allocation rules and vesting schedules.",
    risks: ["Most launches lose value after listing.", "Lockups and vesting.", "Scam copycats of popular launchpads."],
  },
  curator: {
    steps: [
      "Deposit into the curator's largest vault on {chain} (see the vault list on {url}).",
      "Hold the deposit through an epoch: curator fees accrue over time, and snapshots reward holders, not flippers.",
      "Compare vaults by net APY and by the curator's track record before choosing.",
      "Diversify across two vaults rather than putting everything in one.",
      "Read the curator's risk reports and allocation updates when they are published.",
      "Track the vault's TVL and the curator's fee take; a vault that grows is a vault a launch would price.",
    ],
    watch: "Curator allocations, risk reports and vault TVL.",
    risks: ["Curator risk: a bad allocation loses money.", "Vault smart-contract risk.", "Fees eat returns; net APY is what matters."],
  },
  basis: {
    steps: [
      "Deposit into the basis vault/strategy {name} runs on {chain}.",
      "Hold through a full funding cycle so the position earns the basis spread.",
      "Understand the delta-neutral design before sizing up: know what happens if funding flips negative.",
      "Track funding rates daily; a persistently negative funding rate is the exit signal.",
      "Reinvest the yield instead of withdrawing it each cycle.",
      "Watch for strategy caps: deposits above the cap may be turned away.",
    ],
    watch: "Funding rates, strategy capacity and basis spreads.",
    risks: ["Funding can flip negative for long stretches.", "Basis blowouts in volatile markets.", "Smart-contract risk."],
  },
  generic: {
    steps: [
      "Use {name} on {chain} for its core function (trade, deposit, lend or stake) with a real amount.",
      "Repeat the usage across weeks rather than once: sustained activity is the signal.",
      "Provide liquidity or deposit if {name} offers a vault, pool or market for it.",
      "Keep a position open across snapshots instead of entering and exiting in a day.",
      "Follow {name}'s announcements on {url} for a points program or quests.",
      "Track {name}'s TVL and volume on DefiLlama to see whether it is growing.",
    ],
    watch: "Announcements, new features and TVL growth.",
    risks: ["A token may never launch.", "Smart-contract risk.", "Gas and fees can exceed any eventual reward."],
  },
};

function playbookGroup(category: string | null): string {
  const c = (category ?? "").toLowerCase();
  if (c.includes("dex")) return "dex";
  // Curators (incl. "Collateral Markets") before lending: they curate
  // vaults, they do not run a borrow market.
  if (c.includes("curator") || c.includes("capital allocator") || c.includes("collateral market")) return "curator";
  if (c.includes("lending") || c.includes("collateral")) return "lending";
  if (c.includes("yield")) return "yield";
  if (c.includes("deriv") || c.includes("option") || c.includes("perp")) return "derivatives";
  if (c.includes("prediction")) return "prediction";
  if (c.includes("rwa") || c.includes("real world")) return "rwa";
  if (c.includes("cdp")) return "cdp";
  if (c.includes("launchpad")) return "launchpad";
  if (c.includes("basis")) return "basis";
  if (c.includes("farm") || c.includes("liquidity manager") || c.includes("vault")) return "yield";
  return "generic";
}

function fill(template: string, values: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (_m, key: string) => values[key] ?? "");
}

function farmPlanFor(p: RawProtocol, primaryChain: string): FarmPlan {
  const group = playbookGroup(p.category);
  const book = PLAYBOOKS[group] ?? PLAYBOOKS.generic;
  const values = {
    name: p.name,
    chain: primaryChain,
    url: p.url ?? `https://defillama.com/protocol/${p.slug}`,
    category: p.category ?? "DeFi",
  };
  return {
    summary: `Farm a potential ${p.name} launch by using it on ${primaryChain} and holding the position across snapshots — the steps below are the concrete moves.`,
    steps: book.steps.map((s) => fill(s, values)),
    watch: fill(book.watch, values),
    risks: [...book.risks],
  };
}

// --- thesis -----------------------------------------------------------------
function thesisFor(p: RawProtocol, tvl: number, annRev: number, implied: number, leg: string): string {
  const group = playbookGroup(p.category);
  const angle: Record<string, string> = {
    dex: "a DEX whose trading volume and liquidity would anchor a governance token",
    lending: "a lending market whose supply and borrow flow would anchor a governance token",
    yield: "a yield product whose vault deposits would anchor a governance token",
    derivatives: "a derivatives venue whose open interest and trading fees would anchor a governance token",
    prediction: "an information market whose trading volume would anchor a governance token",
    rwa: "a tokenized real-world-asset protocol whose assets under management would anchor a governance token",
    cdp: "a stablecoin/CDP protocol whose minted supply would anchor a governance token",
    launchpad: "a launchpad whose deal flow would anchor a governance token",
    curator: "a vault curator whose assets under curation would anchor a governance token",
    basis: "a basis-trading strategy whose spread income would anchor a governance token",
    generic: "a DeFi protocol whose usage would anchor a governance token",
  };
  const revBit = annRev > 0 ? ` It earns about ${money(annRev)} a year in revenue.` : "";
  const legBit =
    leg === "revenue"
      ? "Revenue, not TVL, sets the value here (capped at 3x the TVL value)."
      : leg === "revenue-capped"
        ? "Revenue lifts the value but is capped at 3x the TVL value."
        : "TVL sets the value here.";
  return (
    `${p.name} is ${angle[group] ?? angle.generic} on ${(p.chains ?? []).slice(0, 3).join(", ") || p.chain || "multiple chains"} ` +
    `with ${money(tvl)} TVL.${revBit} ` +
    `At comparable multiples its launch would be worth about ${money(implied)}. ${legBit}`
  );
}

// --- ranking ----------------------------------------------------------------
function buildBoard(): BoardRow[] {
  const rows: BoardRow[] = [];
  for (const p of PROTOCOLS) {
    const reason = exclusionReason(p);
    if (reason) {
      countExclusion(reason);
      continue;
    }
    const tvl = p.tvl;
    const annRev = ANNUALIZED_REVENUE[p.id] ?? 0;
    const mult = multipleFor(p.category);
    const tvlValue = tvl * mult.multiple;
    const revenueValue = annRev * REVENUE_MULTIPLE;
    const cappedRevenue = Math.min(revenueValue, REV_LIFT_CAP * tvlValue);
    const impliedValue = Math.max(tvlValue, cappedRevenue);
    const leg: BoardRow["valueLeg"] =
      revenueValue > tvlValue && cappedRevenue > tvlValue
        ? (revenueValue <= REV_LIFT_CAP * tvlValue ? "revenue" : "revenue-capped")
        : "tvl";
    const chains = (p.chains ?? []).length > 0 ? p.chains : [p.chain ?? "Multi-Chain"];
    const primaryChain = chains[0];
    const description = (p.description ?? "").replace(/\s+/g, " ").trim().slice(0, 280);
    rows.push({
      rank: 0,
      protocol: p.name,
      slug: p.slug,
      category: p.category ?? "Unknown",
      chains,
      primaryChain,
      tvl: round0(tvl),
      annualizedRevenue: round0(annRev),
      multiple: Math.round(mult.multiple * 10000) / 10000,
      multipleSource: mult.source,
      tvlValue: round0(tvlValue),
      revenueValue: round0(revenueValue),
      impliedValue: round0(impliedValue),
      valueLeg: leg,
      url: p.url ?? `https://defillama.com/protocol/${p.slug}`,
      twitter: p.twitter ?? "",
      description,
      thesis: thesisFor(p, tvl, annRev, impliedValue, leg),
      farmPlan: farmPlanFor(p, primaryChain),
    });
  }
  rows.sort((a, b) => b.impliedValue - a.impliedValue || b.tvl - a.tvl || a.protocol.localeCompare(b.protocol));
  rows.forEach((r, i) => {
    r.rank = i + 1;
  });
  return rows;
}

// --- writers ----------------------------------------------------------------
function writeBoard(rows: BoardRow[]): void {
  const doc = {
    metadata: {
      title: "Token Launch Radar — board",
      generatedBy: "main.ts (token-radar-01)",
      snapshotDate: protocolsSnap.snapshot.fetchedAt.slice(0, 10),
      rows: rows.length,
      rankedBy: "impliedValue desc, tvl desc, protocol asc",
    },
    rows,
  };
  writeFileSync(join(ROOT, "board.json"), JSON.stringify(doc) + "\n", "utf8");
}

function writeDossier(rows: BoardRow[]): void {
  const excludedByReason: Record<string, number> = {};
  for (const [reason, n] of [...exclusionCounts.entries()].sort()) excludedByReason[reason] = n;
  const withToken = PROTOCOLS.filter(hasToken).length;
  const multiplesByCategory: Record<string, { multiple: number; n: number; source: string }> = {};
  for (const [cat, entry] of [...CATEGORY_MULTIPLES.entries()].sort()) {
    multiplesByCategory[cat] = { multiple: entry.multiple, n: entry.n, source: entry.source };
  }
  const doc = {
    title: "Token Launch Radar — dossier",
    generatedBy: "main.ts (token-radar-01)",
    snapshotDate: protocolsSnap.snapshot.fetchedAt.slice(0, 10),
    snapshot: {
      protocols: `${protocolsSnap.snapshot.source} (fetched ${protocolsSnap.snapshot.fetchedAt}, ${protocolsSnap.snapshot.count} protocols)`,
      revenue: `${revenueSnap.snapshot.source} (fetched ${revenueSnap.snapshot.fetchedAt}, ${Object.keys(ANNUALIZED_REVENUE).length} protocols with annualized revenue)`,
    },
    methodology:
      "Every protocol DefiLlama tracks is read from the snapshot. A protocol enters the watchlist when DefiLlama records no token for it (no contract address, no CoinGecko id, no CoinMarketCap id), its TVL is at least $100k, its category is not an excluded one (CEX, bridges, canonical bridges, front-ends, and every staked/restaked/wrapped product), its name is not on the manual exclusion list, and neither its name nor its description reads as a wrapped, staked, pegged or restaked product. The watchlist is ranked by implied launch value (see formula). Farm plans are generated from one playbook per category family, parameterized with the protocol's own name, primary chain and site; a launch is never guaranteed and every plan says so.",
    formula:
      "tvlValue = TVL * categoryMultiple, where categoryMultiple is the median mcap/TVL of tokenized protocols in the same category with TVL >= $1M and mcap > 0 when at least 5 such comparables exist, otherwise the global median. revValue = annualizedRevenue * revenueMultiple, where revenueMultiple is the median mcap/annualizedRevenue of tokenized protocols with mcap > 0 and annualized revenue > 0. impliedValue = max(tvlValue, min(revValue, 3 * tvlValue)): revenue is a noisier signal than TVL, so its lift over the TVL value is capped at 3x.",
    multiples: {
      global: Math.round(GLOBAL_MULTIPLE * 10000) / 10000,
      revenue: Math.round(REVENUE_MULTIPLE * 100) / 100,
      byCategory: multiplesByCategory,
    },
    counts: {
      tracked: PROTOCOLS.length,
      withToken,
      noToken: PROTOCOLS.length - withToken,
      watchlist: rows.length,
      excludedByReason,
    },
    exclusions: {
      categories: [...EXCLUDED_CATEGORIES].sort(),
      manual: manualExclusions.exclusions,
      wrappedPattern: String(WRAPPED_PATTERN),
    },
    top: rows.slice(0, 10).map((r) => ({
      rank: r.rank,
      protocol: r.protocol,
      category: r.category,
      tvl: r.tvl,
      impliedValue: r.impliedValue,
      thesis: r.thesis,
    })),
    dossiers: rows,
  };
  writeFileSync(join(ROOT, "dossier.json"), JSON.stringify(doc) + "\n", "utf8");
}

// --- dashboard (static, no network) -----------------------------------------
// One self-contained index.html: inline CSS and JS, the board embedded as
// JSON in a single <script type="application/json"> tag. No external fonts,
// images, scripts or fetches, so it renders offline. Hash states let a
// screenshot target a view: #detail=<slug> opens a protocol's detail,
// #cat=<category> filters to a category, #q=<text> searches.
function buildDashboard(rows: BoardRow[]): string {
  const categories = [...new Set(rows.map((r) => r.category))].sort();
  const chains = [...new Set(rows.flatMap((r) => r.chains))].sort();
  const dataJson = JSON.stringify(rows).replace(/</g, "\\u003c");
  const catOptions = categories.map((c) => `<option value="${c}">${c}</option>`).join("");
  const chainOptions = chains.map((c) => `<option value="${c}">${c}</option>`).join("");
  const top = rows.slice(0, 5);
  const topList = top
    .map((r) => `<li><b>#${r.rank} ${r.protocol}</b> — ${r.category} — implied value ${money(r.impliedValue)}</li>`)
    .join("\n");
  return [
    "<!DOCTYPE html>",
    '<html lang="en">',
    "<head>",
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    "<title>Token Launch Radar — protocols without a token, ranked by launch value</title>",
    "<style>",
    "body{font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;margin:0;color:#16202b;background:#f6f8fa}",
    "header{background:#0f1f2e;color:#fff;padding:28px 24px}",
    "header h1{margin:0 0 8px;font-size:28px}",
    "header p{margin:4px 0;color:#c4d3df;max-width:900px}",
    "main{padding:20px 24px 40px;max-width:1200px;margin:0 auto}",
    ".card{background:#fff;border:1px solid #dfe6ec;border-radius:10px;padding:16px 18px;margin:0 0 16px}",
    ".controls{display:flex;gap:10px;flex-wrap:wrap;align-items:center}",
    ".controls input,.controls select{padding:8px 10px;border:1px solid #c6d2dc;border-radius:6px;font-size:14px}",
    ".controls label{font-size:13px;color:#4a5a68}",
    "table{width:100%;border-collapse:collapse;font-size:14px}",
    "th,td{padding:8px 10px;border-bottom:1px solid #e6ebef;text-align:left;vertical-align:top}",
    "th{cursor:pointer;background:#f0f4f7;position:sticky;top:0}",
    "tbody tr{cursor:pointer}",
    "tbody tr:hover{background:#eef6fd}",
    "td.num,th.num{text-align:right}",
    ".pill{display:inline-block;padding:2px 8px;border-radius:20px;background:#e8f1f8;color:#24506e;font-size:12px}",
    "#detail h2{margin:0 0 6px}",
    "#detail .meta{color:#4a5a68;font-size:13px;margin:0 0 10px}",
    "#detail ol,#detail ul{margin:6px 0 10px;padding-left:22px}",
    "#detail li{margin:3px 0}",
    "a{color:#0b5fa5}",
    "footer{color:#5a6b79;font-size:12px;line-height:1.5}",
    "</style>",
    "</head>",
    "<body>",
    "<header>",
    "<h1>Token Launch Radar</h1>",
    `<p>Every protocol DefiLlama tracks, ranked by what its token launch would be worth. ${rows.length} protocols with no token, no wrapped or staked product of an asset that trades. Snapshot ${protocolsSnap.snapshot.fetchedAt.slice(0, 10)}.</p>`,
    `<p>Top 5: ${top.map((r) => `#${r.rank} ${r.protocol} (${money(r.impliedValue)})`).join(" · ")}</p>`,
    "</header>",
    "<main>",
    `<section class="card"><h2>How the board is ranked</h2><p>Implied value = max(TVL × category multiple, annualized revenue × ${REVENUE_MULTIPLE.toFixed(2)}), with the revenue lift capped at 3× the TVL value. The category multiple is the median mcap/TVL of tokenized protocols in the same category (at least 5 comparables, else the global median ${GLOBAL_MULTIPLE.toFixed(4)}). A launch is never guaranteed — every farm plan says so. See dossier.json for the full methodology.</p></section>`,
    `<section class="card"><h2>Top 5 by implied launch value</h2><ol>${topList}</ol></section>`,
    '<section class="card"><div class="controls">',
    '<label>Search <input id="q" type="search" placeholder="protocol name…"></label>',
    `<label>Category <select id="cat"><option value="">All categories</option>${catOptions}</select></label>`,
    `<label>Chain <select id="chain"><option value="">All chains</option>${chainOptions}</select></label>`,
    '<label>Min implied value <select id="minIv"><option value="0">Any</option><option value="1000000">$1M+</option><option value="10000000">$10M+</option><option value="100000000">$100M+</option></select></label>',
    '<span id="count"></span>',
    "</div></section>",
    '<section class="card"><table><thead><tr><th data-k="rank">#</th><th data-k="protocol">Protocol</th><th data-k="category">Category</th><th>Chains</th><th class="num" data-k="tvl">TVL</th><th class="num" data-k="annualizedRevenue">Revenue / yr</th><th class="num" data-k="impliedValue">Implied value</th><th class="num" data-k="multiple">Multiple</th><th>Leg</th></tr></thead><tbody id="rows"></tbody></table></section>',
    '<section class="card" id="detail"><h2>Protocol detail</h2><p class="meta">Click a row to see its detail view: thesis, implied-value breakdown and farm plan.</p><div id="detailBody"><p>Select a protocol from the board.</p></div></section>',
    '<footer class="card"><p>Data: DefiLlama protocols snapshot and revenue snapshot, fetched 2026-11-26 (see dossier.json for sources). “No token” means DefiLlama records no contract address, CoinGecko id or CoinMarketCap id for the protocol. Wrapped, staked, pegged and restaked products, centralized exchanges, bridges, canonical bridges and front-ends are excluded; see dossier.json for the full exclusion list. This page loads no external resources and works offline.</p></footer>',
    "</main>",
    `<script id="board-data" type="application/json">${dataJson}</script>`,
    "<script>",
    "var DATA = JSON.parse(document.getElementById('board-data').textContent);",
    "var state = { q: '', cat: '', chain: '', minIv: 0, sort: 'impliedValue', dir: -1 };",
    "function esc(s){ return String(s == null ? '' : s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/\"/g,'&quot;'); }",
    "function fmt(n){ if (n >= 1e9) return '$' + (n/1e9).toFixed(2) + 'B'; if (n >= 1e6) return '$' + (n/1e6).toFixed(1) + 'M'; if (n >= 1e3) return '$' + (n/1e3).toFixed(1) + 'K'; return '$' + Math.round(n); }",
    "function filtered(){ return DATA.filter(function(r){ if (state.q && r.protocol.toLowerCase().indexOf(state.q.toLowerCase()) < 0) return false; if (state.cat && r.category !== state.cat) return false; if (state.chain && r.chains.indexOf(state.chain) < 0) return false; if (r.impliedValue < state.minIv) return false; return true; }); }",
    "function render(){ var list = filtered(); var k = state.sort, d = state.dir; list.sort(function(a,b){ var x = a[k], y = b[k]; if (typeof x === 'string') return d * x.localeCompare(y); return d * (x - y); }); var html = ''; for (var i=0;i<list.length;i++){ var r = list[i]; html += '<tr data-slug=\"' + esc(r.slug) + '\"><td>' + r.rank + '</td><td><b>' + esc(r.protocol) + '</b></td><td>' + esc(r.category) + '</td><td>' + esc(r.chains.slice(0,3).join(', ')) + '</td><td class=\"num\">' + fmt(r.tvl) + '</td><td class=\"num\">' + (r.annualizedRevenue ? fmt(r.annualizedRevenue) : '—') + '</td><td class=\"num\"><b>' + fmt(r.impliedValue) + '</b></td><td class=\"num\">' + r.multiple + '</td><td><span class=\"pill\">' + esc(r.valueLeg) + '</span></td></tr>'; } document.getElementById('rows').innerHTML = html || '<tr><td colspan=\"9\">No protocols match this filter.</td></tr>'; document.getElementById('count').textContent = list.length + ' of ' + DATA.length + ' protocols'; var rows = document.querySelectorAll('#rows tr[data-slug]'); for (var j=0;j<rows.length;j++){ rows[j].addEventListener('click', function(){ showDetail(this.getAttribute('data-slug')); }); } }",
    "function showDetail(slug){ var r = null; for (var i=0;i<DATA.length;i++){ if (DATA[i].slug === slug){ r = DATA[i]; break; } } if (!r) return; var steps = ''; for (var i=0;i<r.farmPlan.steps.length;i++){ steps += '<li>' + esc(r.farmPlan.steps[i]) + '</li>'; } var risks = ''; for (var j=0;j<r.farmPlan.risks.length;j++){ risks += '<li>' + esc(r.farmPlan.risks[j]) + '</li>'; } document.getElementById('detailBody').innerHTML = '<h2>' + esc(r.protocol) + ' <span class=\"pill\">#' + r.rank + '</span></h2><p class=\"meta\">' + esc(r.category) + ' · ' + esc(r.chains.join(', ')) + ' · <a href=\"' + esc(r.url) + '\">website</a>' + (r.twitter ? ' · <a href=\"https://x.com/' + esc(r.twitter) + '\">Twitter</a>' : '') + '</p><p>' + esc(r.thesis) + '</p><p><b>Implied value ' + fmt(r.impliedValue) + '</b> — TVL ' + fmt(r.tvl) + ' × multiple ' + r.multiple + ' (' + esc(r.multipleSource) + ') = ' + fmt(r.tvlValue) + '; revenue ' + fmt(r.annualizedRevenue) + '/yr × " + REVENUE_MULTIPLE.toFixed(2) + " = ' + fmt(r.revenueValue) + '; leg: ' + esc(r.valueLeg) + '.</p><p>' + esc(r.description) + '</p><h3>Farm plan</h3><p>' + esc(r.farmPlan.summary) + '</p><ol>' + steps + '</ol><p><b>Watch:</b> ' + esc(r.farmPlan.watch) + '</p><h3>Risks</h3><ul>' + risks + '</ul>'; document.getElementById('detail').scrollIntoView(); if (location.hash !== '#detail=' + slug){ history.replaceState(null, '', '#detail=' + slug); } }",
    "function applyHash(){ var h = location.hash.replace(/^#/, ''); var parts = h.split('&'); for (var i=0;i<parts.length;i++){ var kv = parts[i].split('='); if (kv[0] === 'detail' && kv[1]){ showDetail(decodeURIComponent(kv[1])); } if (kv[0] === 'cat' && kv[1]){ state.cat = decodeURIComponent(kv[1]); document.getElementById('cat').value = state.cat; } if (kv[0] === 'q' && kv[1]){ state.q = decodeURIComponent(kv[1]); document.getElementById('q').value = state.q; } } render(); }",
    "document.getElementById('q').addEventListener('input', function(){ state.q = this.value; render(); });",
    "document.getElementById('cat').addEventListener('change', function(){ state.cat = this.value; render(); });",
    "document.getElementById('chain').addEventListener('change', function(){ state.chain = this.value; render(); });",
    "document.getElementById('minIv').addEventListener('change', function(){ state.minIv = Number(this.value); render(); });",
    "var ths = document.querySelectorAll('th[data-k]'); for (var i=0;i<ths.length;i++){ ths[i].addEventListener('click', function(){ var k = this.getAttribute('data-k'); if (state.sort === k){ state.dir = -state.dir; } else { state.sort = k; state.dir = -1; } render(); }); }",
    "window.addEventListener('hashchange', applyHash);",
    "applyHash();",
    "</script>",
    "</body>",
    "</html>",
  ].join("\n");
}

function writeDashboard(rows: BoardRow[]): void {
  mkdirSync(DASHBOARD_DIR, { recursive: true });
  writeFileSync(join(DASHBOARD_DIR, "index.html"), buildDashboard(rows) + "\n", "utf8");
}

// --- main -------------------------------------------------------------------
function main(): void {
  const rows = buildBoard();
  writeBoard(rows);
  writeDossier(rows);
  writeDashboard(rows);
  const top = rows.slice(0, 5);
  console.log(`Token Launch Radar: ${rows.length} protocols on the watchlist (of ${PROTOCOLS.length} tracked).`);
  console.log(`Multiples: global mcap/TVL ${GLOBAL_MULTIPLE.toFixed(4)}, revenue ${REVENUE_MULTIPLE.toFixed(2)}x annualized revenue.`);
  for (const r of top) {
    console.log(`#${r.rank} ${r.protocol} (${r.category}) — TVL ${money(r.tvl)}, implied ${money(r.impliedValue)} [${r.valueLeg}]`);
  }
  console.log("Wrote board.json, dossier.json, dashboard/index.html.");
}

main();
