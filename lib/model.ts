// The token radar's model: one sealed snapshot in, one ranked board out, plus the data the page reads.
//
// WHAT IS RANKED
// Every protocol whose DefiLlama record carries no token at all (gecko_id and symbol both null) is a
// candidate. The watchlist is the floor, never the ceiling: all 40 watchlist slugs are on the board,
// and so is every other pre-token record in the snapshot, from $11.1B of TVL down to the $5M the
// snapshot truncates at. Protocols whose record carries a symbol already trade (the record names a
// token), so they are set aside in the page's "trading" view with their market cap, never scored by a
// pre-token model. The snapshot has 758 protocols, 342 of them with no token on record.
//
// THE VALUE MODEL
//   implied_value_usd = round( tvl_usd x multiple ), multiple = base x growth x age x category
// and every factor is a function of the snapshot's own figures. No protocol name is ever read.
//
//   base     0.55       a pre-token protocol's expected fully diluted value against its TVL.
//   growth   change_7d, the seven-day TVL move the record carries in per cent, clamped to +-40% and
//            mapped linearly onto 0.75..1.35 (so -40% or worse -> 0.75, flat -> 1.05, +40% or better
//            -> 1.35). A record with no seven-day move (null) gets 0.95: unknown, treated as slightly
//            negative rather than as flat.
//   age      months from listed_at to the snapshot's as_of, factor 0.85 + 0.05 per month, capped at
//            1.50 (thirteen months). A protocol the index has tracked longer has had more time to
//            earn a token, and one listed yesterday is not yet a launch candidate. Null listed_at ->
//            0.85, the floor: nothing is credited that the record does not show.
//   category what the protocol does, from the record's own category: Dexs 1.20, Perps 1.25, Lending
//            1.15, RWA 1.20, Yield 0.95, Liquidity Manager 0.90, Risk Curators 0.85, Onchain Capital
//            Allocator 0.85, Liquid Staking 0.55, Restaking 0.55, Bridge 0.50, Canonical Bridge 0.50,
//            CEX 0.40, any other named category 1.00, a null category 0.90. Fees that accrue to a
//            token are what a launch is priced on, so a DEX or a perp venue carries more than a
//            bridge or a receipt product.
//
// Round to whole dollars, floor at 1, cap at 100,000,000,000. The board's values descend strictly by
// at least one dollar between neighbours: a tie is broken by TVL then slug, and the lower row's value
// is nudged one dollar under the row above so no two rows show the same number. Every factor and the
// multiple are kept per row, so the page can show the arithmetic rather than assert it.

/** The snapshot's protocol entry: exactly the ten fields the sealed input carries. */
export interface SnapshotProtocol {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
}

/** The whole snapshot document. */
export interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: SnapshotProtocol[];
  watchlist: string[];
}

/** The model's constants, stated on the page and used by every row. */
export const MODEL = {
  base: 0.55,
  growth_floor: -0.40,
  growth_cap: 0.40,
  growth_min: 0.75,
  growth_max: 1.35,
  growth_unknown: 0.95,
  age_base: 0.85,
  age_step: 0.05,
  age_cap: 1.50,
  age_unknown: 0.85,
  category_default: 1.00,
  category_unknown: 0.90,
  value_cap: 100_000_000_000,
};

/** The model's version label, named in the masthead. */
export const MODEL_VERSION = 'radar-2';

/** The category factor, by the record's own category string. */
export const CATEGORY_FACTOR: Record<string, number> = {
  Dexs: 1.20,
  Perps: 1.25,
  Lending: 1.15,
  RWA: 1.20,
  Yield: 0.95,
  'Liquidity Manager': 0.90,
  'Risk Curators': 0.85,
  'Onchain Capital Allocator': 0.85,
  'Liquid Staking': 0.55,
  Restaking: 0.55,
  Bridge: 0.50,
  'Canonical Bridge': 0.50,
  CEX: 0.40,
};

/** A farm step: what to do, what it costs, how long it takes. */
export interface FarmStep {
  text: string;
  cost: string;
  time: string;
}

/** The four factors and their product, kept per row for the detail drawer. */
export interface Factors {
  base: number;
  growth: number;
  age: number;
  category: number;
  multiple: number;
}

/** One ranked row of the board. The gate reads slug, name, rank, implied_value_usd and farm_steps. */
export interface BoardRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
  token_status: 'pre-token';
  on_watchlist: boolean;
  age_days: number | null;
  age_months: number | null;
  implied_value_usd: number;
  factors: Factors;
  farm_plan: FarmStep[];
  farm_steps: string[];
}

/** The page's row: the board row plus the record's token fields, with the plan structured. */
export interface RadarRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
  token_status: 'pre-token';
  on_watchlist: boolean;
  age_days: number | null;
  age_months: number | null;
  implied_value_usd: number;
  factors: Factors;
  farm_plan: FarmStep[];
}

/** A protocol whose record carries a token: set aside, with the market's own figures. */
export interface LiveRow {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
  token_status: 'trading';
  age_days: number | null;
  age_months: number | null;
}

/** Everything the dashboard renders. */
export interface RadarData {
  as_of: string;
  source: string;
  floor_usd: number;
  model_version: string;
  model: typeof MODEL;
  category_factor: Record<string, number>;
  counts: {
    protocols: number;
    watchlist: number;
    board: number;
    early: number;
    trading: number;
    no_token: number;
    floor_below: number;
  };
  rows: RadarRow[];
  live: LiveRow[];
}

/** Why the snapshot is not one this model can score. */
export class SnapshotError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SnapshotError';
  }
}

const DAY_MS = 86_400_000;
const DAYS_PER_MONTH = 30.4375;

/** A finite number, else `fallback`. */
function finite(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

/** Whole days from `listedAt` to `asOf`, never negative; null when either date is missing or bad. */
export function ageDays(asOf: string, listedAt: string | null): number | null {
  if (listedAt === null) return null;
  const a = Date.parse(`${asOf}T00:00:00Z`);
  const b = Date.parse(`${listedAt}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.max(0, Math.floor((a - b) / DAY_MS));
}

/** Months tracked, to one decimal; null when the record carries no listing date. */
export function ageMonths(days: number | null): number | null {
  if (days === null) return null;
  return Math.round((days / DAYS_PER_MONTH) * 10) / 10;
}

/** The category factor: the record's own category, else the named default, else the null default. */
export function categoryFactor(category: string | null): number {
  if (category === null) return MODEL.category_unknown;
  const exact = CATEGORY_FACTOR[category];
  if (exact !== undefined) return exact;
  return MODEL.category_default;
}

/** The growth factor: the seven-day TVL move in per cent, clamped to +-40%, mapped onto 0.75..1.35. */
export function growthFactor(change7d: number | null): number {
  if (change7d === null) return MODEL.growth_unknown;
  const pct = Math.min(MODEL.growth_cap * 100, Math.max(MODEL.growth_floor * 100, change7d));
  const fraction = pct / 100;
  const span = MODEL.growth_cap - MODEL.growth_floor;
  return MODEL.growth_min + ((fraction - MODEL.growth_floor) / span) * (MODEL.growth_max - MODEL.growth_min);
}

/** The age factor: 0.85 + 0.05 per month tracked, capped at 1.50; 0.85 when the listing date is null. */
export function ageFactor(months: number | null): number {
  if (months === null) return MODEL.age_unknown;
  return Math.min(MODEL.age_cap, MODEL.age_base + MODEL.age_step * months);
}

/** The four factors and the implied value one protocol gets. */
export function score(protocol: SnapshotProtocol, asOf: string): { factors: Factors; implied: number; age: number | null; months: number | null } {
  const age = ageDays(asOf, protocol.listed_at);
  const months = ageMonths(age);
  const base = MODEL.base;
  const growth = growthFactor(protocol.change_7d);
  const ageF = ageFactor(months);
  const category = categoryFactor(protocol.category);
  const multiple = base * growth * ageF * category;
  const raw = protocol.tvl_usd * multiple;
  const implied = Math.max(1, Math.min(MODEL.value_cap, Math.round(raw)));
  return {
    factors: { base, growth: round4(growth), age: round4(ageF), category, multiple: round4(multiple) },
    implied,
    age,
    months,
  };
}

const round4 = (n: number): number => Math.round(n * 1e4) / 1e4;

/** Whether the record carries no token at all: both gecko_id and symbol are null. */
export function isPreToken(p: SnapshotProtocol): boolean {
  return p.gecko_id === null && p.symbol === null;
}

/** A plan step as the one string board.json carries: its action, its cost, its time. */
export function stepText(step: FarmStep): string {
  let s = `${step.text.trim()} Cost: ${step.cost}. Time: ${step.time}.`;
  if (s.length > 600) s = `${s.slice(0, 596)}...`;
  if (s.length < 20) s = `${s} Check the protocol's own page before you act.`;
  return s;
}

// ---------------------------------------------------------------- farm plans

/** The first chain the record names, or a neutral phrase. */
function chainOf(p: SnapshotProtocol): string {
  return p.chains.length > 0 ? p.chains[0]! : 'its main chain';
}

/** A second chain worth naming, or empty. */
function otherChain(p: SnapshotProtocol): string {
  return p.chains.length > 1 ? p.chains[1]! : '';
}

/** Roughly what one transaction costs on a chain, in dollars. */
function gasUsd(chain: string): number {
  const gas: Record<string, number> = {
    Ethereum: 4,
    Arbitrum: 0.15,
    Optimism: 0.15,
    Base: 0.1,
    Polygon: 0.05,
    Binance: 0.2,
    Solana: 0.02,
    Avalanche: 0.2,
    Bitcoin: 2,
    Tron: 1,
    'Hyperliquid L1': 0.05,
    Monad: 0.02,
    Sui: 0.02,
    Linea: 0.15,
    Scroll: 0.15,
    Mantle: 0.05,
    Sonic: 0.05,
    Berachain: 0.1,
    Plasma: 0.05,
    'Plasma Mainnet': 0.05,
    Ink: 0.05,
    Unichain: 0.05,
    Katana: 0.05,
    Celo: 0.02,
    Fantom: 0.05,
    xDai: 0.02,
  };
  return gas[chain] ?? 0.5;
}

/** Dollars as a short string: $5, $0.10, $1,200. */
function usd(n: number): string {
  if (n >= 1000) return `$${n.toLocaleString('en-US')}`;
  if (Number.isInteger(n)) return `$${n}`;
  return `$${n.toFixed(2)}`;
}

/** How much capital one farm position needs, from the protocol's own TVL. */
function capitalFor(p: SnapshotProtocol): number {
  if (p.tvl_usd >= 5_000_000_000) return 500;
  if (p.tvl_usd >= 1_000_000_000) return 250;
  if (p.tvl_usd >= 250_000_000) return 100;
  if (p.tvl_usd >= 50_000_000) return 50;
  return 25;
}

/** How long to hold, from the months the record has been tracked. */
function holdDaysFor(months: number | null): number {
  if (months === null) return 60;
  if (months < 6) return 90;
  if (months < 12) return 60;
  return 45;
}

/** A compact phrase for the record's seven-day move, as a clause a sentence can carry. */
function growthPhrase(change: number | null): string {
  if (change === null) return 'no recorded seven-day move';
  const sign = change > 0 ? '+' : '';
  return `its ${sign}${change.toFixed(1)}% seven-day move`;
}

/** A compact phrase for the record's size. */
function tvlPhrase(tvl: number): string {
  if (tvl >= 1e9) return `$${(tvl / 1e9).toFixed(2)}B of TVL`;
  if (tvl >= 1e6) return `$${(tvl / 1e6).toFixed(0)}M of TVL`;
  return `$${Math.round(tvl / 1e3)}K of TVL`;
}

/** The plan kind a record's category puts it in. */
export function planKind(p: SnapshotProtocol): string {
  const c = p.category;
  if (c === 'CEX') return 'cex';
  if (c === 'Liquid Staking' || c === 'Restaking' || c === 'Liquid Restaking' || c === 'Restaked BTC' || c === 'Staking Pool' || c === 'Stablecoin Wrapper' || c === 'Anchor BTC') return 'receipt';
  if (c === 'Bridge' || c === 'Canonical Bridge' || c === 'Cross Chain Bridge') return 'bridge';
  if (c === 'Dexs' || c === 'Liquidity Manager') return 'dex';
  if (c === 'CDP' || c === 'CDP Manager' || c === 'Algo-Stables' || c === 'Stablecoin Issuer' || c === 'Reserve Currency' || c === 'Dual-Token Stablecoin') return 'cdp';
  if (c === 'Lending' || c === 'Collateral Markets' || c === 'Uncollateralized Lending') return 'lending';
  if (c === 'Perps' || c === 'Derivatives' || c === 'Options' || c === 'Synthetics' || c === 'Interest Rate Derivatives' || c === 'Basis Trading') return 'perps';
  if (c === 'RWA' || c === 'Indexes' || c === 'Decentralized BTC' || c === 'Token Locker') return 'rwa';
  if (c === 'Risk Curators' || c === 'Onchain Capital Allocator' || c === 'Yield Aggregator' || c === 'Yield' || c === 'Leveraged Farming' || c === 'Farm' || c === 'Governance Incentives') return 'vault';
  if (c === 'Chain' || c === 'Payments' || c === 'Launchpad' || c === 'Prediction Market' || c === 'Insurance' || c === 'OTC Marketplace') return 'chain';
  return 'deposit';
}

/**
 * A protocol's farm plan: four to eight steps, each an action with a cost and a time. Everything in it
 * is derived from the record — category decides the kind of plan, TVL the size of the position, the
 * chains the venue and the gas, the months tracked the holding period, the seven-day move the warning.
 * A centralised exchange and a receipt product get a plan that says plainly the usual farm does not
 * apply and what to do instead; that is still a plan, in steps, with costs and times.
 */
export function farmPlan(p: SnapshotProtocol, months: number | null): FarmStep[] {
  const kind = planKind(p);
  const chain = chainOf(p);
  const second = otherChain(p);
  const gas = gasUsd(chain);
  const capital = capitalFor(p);
  const hold = holdDaysFor(months);
  const name = p.name;
  const size = tvlPhrase(p.tvl_usd);
  const move = growthPhrase(p.change_7d);
  const monthsText = months === null ? 'an unrecorded age' : `${months.toFixed(1)} months on the index`;

  if (kind === 'cex') {
    return [
      {
        text: `Farming is not applicable here: ${name} is a centralised exchange, so there is no on-chain position to open, no pool to provide to and no points program a wallet can earn.`,
        cost: 'nothing; reading this plan is free',
        time: '2 minutes',
      },
      {
        text: `What to do instead: keep the balances you already hold with ${name} in a wallet you control, withdraw when you do not need the venue, and treat a listing announcement as the only launch signal worth acting on.`,
        cost: `the exchange's own withdrawal fee, typically $1 to $5`,
        time: '10 minutes',
      },
      {
        text: `The record carries ${size} for ${name} and ${move}; that TVL is customer balances, not a farmable pool, so it says how liquid the venue is, not what a token would be worth.`,
        cost: 'no fee to read, no position to open',
        time: '5 minutes',
      },
      {
        text: `Watch ${name}'s own proof-of-reserves and withdrawal page weekly instead of farming it, and write down the date you checked, so a change in the record is something you notice rather than read about.`,
        cost: 'no fee; 1 minute of checking per venue',
        time: '5 minutes a week',
      },
    ];
  }

  if (kind === 'receipt') {
    return [
      {
        text: `Farming is not applicable in the usual sense: ${name} issues a receipt for an asset that is already staked or wrapped, so the position earns that asset's yield and there is no separate pre-token allocation to farm.`,
        cost: 'nothing to check; the deposit is the whole position',
        time: '5 minutes',
      },
      {
        text: `What to do instead: deposit ${usd(capital)} of the underlying asset into ${name} on ${chain}, note the receipt token you get back, and hold it rather than trading it, since the receipt is what any future snapshot would count.`,
        cost: `${usd(capital)} of capital and ${usd(gas)} of gas`,
        time: '15 minutes to set up',
      },
      {
        text: `Keep the receipt for at least ${hold} days: ${name} has ${monthsText} and ${size}, so its position changes slowly and a short hold tells you nothing about the protocol's own trajectory.`,
        cost: `the ${usd(capital)} stays locked; ${usd(gas)} of gas to exit`,
        time: `${hold} days`,
      },
      {
        text: `Check the receipt's redemption rate once a week against the underlying: a discount wider than 1% on ${second || chain} is the real risk in this position, not the missing token.`,
        cost: 'no fee; one swap quote to compare',
        time: '5 minutes a week',
      },
      {
        text: `Log the deposit date, the receipt amount and the redemption rate in a farm journal, so you can unwind in one transaction if the issuer announces a token or a migration.`,
        cost: 'nothing but the record',
        time: '5 minutes',
      },
    ];
  }

  if (kind === 'bridge') {
    const from = second === '' ? 'a chain you already hold funds on' : chain;
    const to = second === '' ? chain : second;
    return [
      {
        text: `Bridge ${usd(capital)} of USDC onto ${to} through ${name} from ${from}, and use the bridged funds inside its own app rather than leaving them parked; ${name} holds ${size} and ${move}.`,
        cost: `${usd(capital)} of capital and about ${usd(gas * 2)} of gas on both ends`,
        time: '20 minutes, including the wait for finality',
      },
      {
        text: `Make a second, smaller transfer of ${usd(Math.max(5, Math.round(capital / 10)))} back the other way, because a bridge's volume is counted by routes and directions, not by the size of one deposit.`,
        cost: `about ${usd(gas * 2)} of gas and the bridge's own fee, usually under 0.1%`,
        time: '15 minutes',
      },
      {
        text: `Keep at least ${usd(capital)} of liquidity on ${to} for ${hold} days, so the transfer is still there when a snapshot counts balances rather than transactions.`,
        cost: `${usd(capital)} of capital held, ${usd(gas)} to move it back`,
        time: `${hold} days`,
      },
      {
        text: `Repeat one transfer a week rather than ten in a day: ${monthsText} says how long ${name} has been tracked, and a steady route is what a volume snapshot can see.`,
        cost: `about ${usd(gas * 2)} of gas a week`,
        time: '10 minutes a week',
      },
      {
        text: `Before you withdraw, confirm the canonical route back from ${to} and keep the transaction hashes; an unconfirmed bridge exit is the one way this plan loses money.`,
        cost: `${usd(gas)} of gas per withdrawal, never a fee to a third party`,
        time: '15 minutes',
      },
    ];
  }

  if (kind === 'dex') {
    return [
      {
        text: `Provide ${usd(capital)} of liquidity to ${name}'s deepest pool on ${chain}, split 50/50 across the pair rather than all in one side; ${name} holds ${size} and ${move}.`,
        cost: `${usd(capital)} of capital and about ${usd(gas * 2)} of gas to enter`,
        time: '20 minutes',
      },
      {
        text: `Set the range around the current price, no wider than 15% either side: on ${chain} each rebalance is two swaps at roughly ${usd(gas)} of gas, so a weekly rebalance costs about ${usd(gas * 4)} a month.`,
        cost: `about ${usd(gas * 2)} per rebalance`,
        time: '10 minutes a week',
      },
      {
        text: `Hold the position for at least ${hold} days and do not unwind for a drawdown smaller than 10%: the record's ${move} is a one-week number, not a reason to churn fees.`,
        cost: `${usd(capital)} stays in the pool; ${usd(gas * 2)} to exit`,
        time: `${hold} days`,
      },
      {
        text: `Claim trading fees every week and restake them into the same range, so the position compounds while the protocol's ${monthsText} keeps it a candidate.`,
        cost: `about ${usd(gas)} of gas per claim`,
        time: '5 minutes a week',
      },
      {
        text: `Log the entry price, the range and each claim, so you can prove the wallet's activity if ${name} announces a snapshot window.`,
        cost: 'nothing but the log',
        time: '5 minutes',
      },
    ];
  }

  if (kind === 'cdp') {
    const minted = Math.round(capital * 0.4);
    const interest = Math.max(1, Math.round(minted * 0.05 * (hold / 365)));
    return [
      {
        text: `Open a vault on ${name} with ${usd(capital)} of ${chain}'s major collateral and mint at most ${usd(minted)} of its stablecoin against it: a 40% loan-to-value survives a 40% fall in the collateral, and ${name} holds ${size} with ${move}.`,
        cost: `${usd(capital)} of collateral and about ${usd(gas * 2)} of gas`,
        time: '20 minutes',
      },
      {
        text: `Use a slice of the minted stablecoin for one swap on ${chain} instead of leaving it idle, so the wallet shows a position and a transaction rather than a debt alone.`,
        cost: `about ${usd(gas)} of gas and under 0.3% of the swapped amount`,
        time: '10 minutes',
      },
      {
        text: `Hold the vault for at least ${hold} days and check the protocol's own stability fee weekly: at 5% a year on ${usd(minted)} the position costs about ${usd(interest)} over the whole hold.`,
        cost: `${usd(interest)} of interest at a 5% rate`,
        time: `${hold} days, 5 minutes a week`,
      },
      {
        text: `Mint a further ${usd(Math.round(minted / 4))} halfway through the hold, keeping the ratio under 45%, then repay that slice a week later: two cycles are counted where one is not.`,
        cost: `${usd(Math.round(minted / 4))} of extra debt and ${usd(gas * 2)} of gas`,
        time: '2 weeks, 20 minutes of work',
      },
      {
        text: `Repay the debt in full before you withdraw the collateral, and keep both transaction hashes: an unclosed vault keeps accruing interest after you stop watching it.`,
        cost: `${usd(gas * 2)} of gas, no exit fee`,
        time: '20 minutes',
      },
    ];
  }

  if (kind === 'lending') {
    return [
      {
        text: `Supply ${usd(capital)} of USDC to ${name} on ${chain} and keep the position open; ${name} holds ${size} and ${move}, which is what a lending token would be priced against.`,
        cost: `${usd(capital)} of capital and about ${usd(gas * 2)} of gas to enter`,
        time: '15 minutes',
      },
      {
        text: `Borrow ${usd(Math.round(capital * 0.4))} of the chain's major asset against it at a 40% loan-to-value, then repay it after a week: a borrow-and-repay cycle is what a lending snapshot counts.`,
        cost: `about 5% a year of borrow interest for a week, ${usd(gas * 2)} of gas`,
        time: '1 week, 20 minutes of work',
      },
      {
        text: `Keep the supplied position for at least ${hold} days and keep the loan-to-value under 50%, so a 20% move in the collateral does not liquidate it.`,
        cost: `${usd(capital)} of capital held; liquidation risk is the real cost`,
        time: `${hold} days`,
      },
      {
        text: `Do one more borrow-and-repay cycle in the second half of the holding period, at the same 40% LTV, because two separate weeks of activity outlast one.`,
        cost: `about ${usd(gas * 2)} of gas and a week of interest`,
        time: '1 week',
      },
      {
        text: `Before withdrawing, repay the loan in full, withdraw the supply, and log both transactions with their dates; never leave a dust debt that keeps accruing interest.`,
        cost: `${usd(gas * 2)} of gas, no exit fee`,
        time: '20 minutes',
      },
    ];
  }

  if (kind === 'perps') {
    return [
      {
        text: `Deposit ${usd(Math.round(capital / 2))} of USDC as margin on ${name} and open one small position on ${chain}; the record carries ${size} and ${move}, so the venue's volume is what a token would be priced on.`,
        cost: `${usd(Math.round(capital / 2))} of margin and about ${usd(gas * 2)} of gas`,
        time: '20 minutes',
      },
      {
        text: `Size the position at no more than 2x, and hedge it with an opposite position of the same size so the pair costs only funding and fees while it counts as volume.`,
        cost: `about 0.05% of notional per side in fees, plus funding`,
        time: '10 minutes to place both legs',
      },
      {
        text: `Keep the pair open for ${hold} days and roll it before expiry if the venue uses dated contracts; ${monthsText} is how long the protocol has been tracked, so one week barely registers.`,
        cost: `funding of roughly 0.01% a day on the notional`,
        time: `${hold} days`,
      },
      {
        text: `Close the hedge first and the position second, then withdraw the margin, so the account never carries an unhedged leg while you are away from the screen.`,
        cost: `${usd(gas * 2)} of gas and the closing fees`,
        time: '15 minutes',
      },
      {
        text: `Record each fill, the funding paid and the fees, because a volume-based allocation is checked against the venue's own history, not against your memory.`,
        cost: 'nothing but the record',
        time: '5 minutes',
      },
    ];
  }

  if (kind === 'rwa') {
    return [
      {
        text: `Mint or buy ${usd(capital)} of ${name}'s yield asset on ${chain} and hold the instrument itself; the record carries ${size} and ${move}, and a token here would be priced against that book.`,
        cost: `${usd(capital)} of capital and about ${usd(gas * 2)} of gas`,
        time: '20 minutes, plus any issuer onboarding',
      },
      {
        text: `Complete the issuer's own identity check before you deposit, since most RWA venues gate minting: budget 1 to 2 business days for approval and keep the same wallet for every step.`,
        cost: 'no fee; identity documents are the cost',
        time: '1 to 2 business days',
      },
      {
        text: `Hold the position for at least ${hold} days and redeem a small slice once mid-way, because a redemption proves the instrument is liquid and not only mintable.`,
        cost: `about ${usd(gas * 2)} of gas per redemption, plus the issuer's fee`,
        time: `${hold} days`,
      },
      {
        text: `Check the yield the instrument actually pays each month against the rate ${name} advertises, and log both, since a yield that drifts is the record changing under you.`,
        cost: 'no fee; one statement a month',
        time: '10 minutes a month',
      },
      {
        text: `Keep the mint, the redemption and the statements in one folder with the wallet address, so a future claim or snapshot can be matched to this position.`,
        cost: 'nothing but the records',
        time: '5 minutes',
      },
    ];
  }

  if (kind === 'vault') {
    return [
      {
        text: `Deposit ${usd(capital)} of USDC into one of ${name}'s vaults on ${chain}, choosing the vault with the longest track record rather than the highest headline yield; the record carries ${size} and ${move}.`,
        cost: `${usd(capital)} of capital and about ${usd(gas * 2)} of gas`,
        time: '15 minutes',
      },
      {
        text: `Read the vault's fee and its curator before depositing: a 2% management fee on ${usd(capital)} costs ${usd(Math.round(capital * 0.02))} a year, which is the real price of the position.`,
        cost: `${usd(Math.round(capital * 0.02))} a year in fees at a 2% rate`,
        time: '10 minutes',
      },
      {
        text: `Keep the deposit for at least ${hold} days without moving it between vaults; ${monthsText} suggests how much patience the protocol's own record rewards.`,
        cost: `${usd(capital)} stays deposited; ${usd(gas * 2)} to exit`,
        time: `${hold} days`,
      },
      {
        text: `Add ${usd(Math.round(capital / 4))} more after a month if the vault's share price has not fallen, which keeps the position active without chasing a single week's number.`,
        cost: `${usd(Math.round(capital / 4))} of extra capital and ${usd(gas * 2)} of gas`,
        time: '5 minutes, one month in',
      },
      {
        text: `Withdraw in one transaction when you are done and compare the shares you received with the shares you redeemed, so the position's real return is a number you know.`,
        cost: `${usd(gas * 2)} of gas; any exit fee is the vault's own`,
        time: '15 minutes',
      },
    ];
  }

  if (kind === 'chain') {
    return [
      {
        text: `Bridge ${usd(capital)} of USDC onto ${chain} and use ${name}'s own application for one real transaction: ${name} carries ${size} and ${move}, so activity on it is what a token would be measured by.`,
        cost: `${usd(capital)} of capital and about ${usd(gas * 2)} of gas on both chains`,
        time: '25 minutes',
      },
      {
        text: `Keep ${usd(Math.round(capital / 2))} on ${chain} for at least ${hold} days and do one swap or deposit a week, since a balance that never moves is not activity a snapshot can count.`,
        cost: `about ${usd(gas)} of gas a week`,
        time: `${hold} days`,
      },
      {
        text: `Use the official bridge ${name} publishes rather than a third-party route, and check the contract address on ${chain}'s own explorer before you sign anything.`,
        cost: `${usd(gas)} of gas per bridge, no third-party fee`,
        time: '10 minutes of checking',
      },
      {
        text: `Keep a record of every transaction with its hash and date; ${monthsText} is the window the protocol's record covers, and a claim window is usually shorter than that.`,
        cost: 'nothing but the log',
        time: '5 minutes',
      },
      {
        text: `Withdraw the remainder before you stop watching ${name}, so no balance is stranded on a chain you no longer follow.`,
        cost: `about ${usd(gas * 2)} of gas to bridge back`,
        time: '20 minutes',
      },
    ];
  }

  return [
    {
      text: `Deposit ${usd(capital)} of USDC into ${name} on ${chain} and keep the position open; the record carries ${size} and ${move}, which is what its implied value is computed against.`,
      cost: `${usd(capital)} of capital and about ${usd(gas * 2)} of gas`,
      time: '15 minutes',
    },
    {
      text: `Do one more qualifying action a week — a deposit, a withdrawal or a vote — because an account that moves once is not a wallet a snapshot counts twice.`,
      cost: `about ${usd(gas)} of gas a week`,
      time: '10 minutes a week',
    },
    {
      text: `Hold the position for at least ${hold} days: ${name} has been tracked for ${monthsText}, and a position shorter than one snapshot window leaves nothing to count.`,
      cost: `the ${usd(capital)} stays in the position; ${usd(gas)} to exit`,
      time: `${hold} days`,
    },
    {
      text: `Check the protocol's own announcements page every week for a snapshot date or a points program, and act only on a date the protocol itself publishes.`,
      cost: 'no fee to check; never pay anyone to claim',
      time: '10 minutes a week',
    },
    {
      text: `Log the wallet, the dates and every transaction hash in one place, so you can repeat the position or unwind it without guessing.`,
      cost: 'nothing but the log',
      time: '5 minutes',
    },
  ];
}

// ---------------------------------------------------------------- the board

/** The snapshot's protocol by slug. */
function bySlug(protocols: SnapshotProtocol[]): Map<string, SnapshotProtocol> {
  return new Map(protocols.map((p) => [p.slug, p]));
}

/** Whether the gate would refuse the board, or null when it would pass. */
export function boardIssue(board: BoardRow[], snapshot: Snapshot): string | null {
  if (board.length < 100 || board.length > 4000) return `the board holds ${board.length} rows, not 100 to 4,000`;
  const slugs = new Set(board.map((r) => r.slug));
  if (snapshot.protocols.length !== new Set(snapshot.protocols.map((p) => p.slug)).size) return 'the snapshot repeats a slug';
  const missing = snapshot.watchlist.filter((s) => !slugs.has(s));
  if (missing.length > 0) return `the board misses ${missing.length} watchlist slug${missing.length === 1 ? '' : 's'}: ${missing.slice(0, 5).join(', ')}`;
  for (const r of board) {
    if (r.rank < 1 || !Number.isInteger(r.rank)) return `${r.slug} has rank ${r.rank}`;
    if (!Number.isSafeInteger(r.implied_value_usd) || r.implied_value_usd < 1) return `${r.slug} has implied value ${r.implied_value_usd}`;
    if (r.implied_value_usd > 100_000_000_000) return `${r.slug} is over the value cap`;
    if (r.farm_steps.length < 4 || r.farm_steps.length > 8) return `${r.slug} has ${r.farm_steps.length} farm steps`;
    for (const s of r.farm_steps) {
      const t = s.trim();
      if (t.length < 20 || t.length > 600) return `${r.slug} has a farm step of ${t.length} characters`;
    }
  }
  return null;
}

/** The protocols the board ranks, strongest implied value first, with ranks 1..N. */
export function buildBoard(snapshot: Snapshot): BoardRow[] {
  const index = bySlug(snapshot.protocols);
  const chosen = new Map<string, SnapshotProtocol>();
  // Every record without a token. The watchlist is a subset of these by construction; adding the
  // watchlist first means a slug the record somehow dropped still gets a row (it cannot, but coverage
  // is the gate's row and is never gambled).
  for (const slug of snapshot.watchlist) {
    const p = index.get(slug);
    if (p !== undefined) chosen.set(slug, p);
  }
  for (const p of snapshot.protocols) if (isPreToken(p)) chosen.set(p.slug, p);

  const scored = [...chosen.values()].map((p) => ({ p, ...score(p, snapshot.as_of) }));
  scored.sort((a, b) => b.implied - a.implied || b.p.tvl_usd - a.p.tvl_usd || (a.p.slug < b.p.slug ? -1 : a.p.slug > b.p.slug ? 1 : 0));

  let previous = Number.POSITIVE_INFINITY;
  return scored.map((s, i) => {
    // No two neighbouring rows may show the same implied value: the lower one drops a dollar under the
    // row above, so the board's ranking is visible in the numbers themselves.
    const implied = Math.min(s.implied, previous - 1);
    previous = implied;
    const plan = farmPlan(s.p, s.months);
    return {
      rank: i + 1,
      slug: s.p.slug,
      name: s.p.name,
      category: s.p.category,
      chains: s.p.chains,
      tvl_usd: s.p.tvl_usd,
      change_7d: s.p.change_7d,
      mcap_usd: s.p.mcap_usd,
      listed_at: s.p.listed_at,
      gecko_id: s.p.gecko_id,
      symbol: s.p.symbol,
      token_status: 'pre-token' as const,
      on_watchlist: snapshot.watchlist.includes(s.p.slug),
      age_days: s.age,
      age_months: s.months,
      implied_value_usd: implied,
      factors: s.factors,
      farm_plan: plan,
      farm_steps: plan.map(stepText),
    };
  });
}

/** The protocols whose record carries a token, by market cap: the market's own figures, set aside. */
export function liveRows(snapshot: Snapshot, cap: number): LiveRow[] {
  return snapshot.protocols
    .filter((p) => !isPreToken(p))
    .sort((a, b) => (b.mcap_usd ?? 0) - (a.mcap_usd ?? 0) || b.tvl_usd - a.tvl_usd || (a.slug < b.slug ? -1 : 1))
    .slice(0, cap)
    .map((p) => {
      const age = ageDays(snapshot.as_of, p.listed_at);
      return {
        slug: p.slug,
        name: p.name,
        category: p.category,
        chains: p.chains,
        tvl_usd: p.tvl_usd,
        change_7d: p.change_7d,
        mcap_usd: p.mcap_usd,
        listed_at: p.listed_at,
        gecko_id: p.gecko_id,
        symbol: p.symbol,
        token_status: 'trading' as const,
        age_days: age,
        age_months: ageMonths(age),
      };
    });
}

/** Everything the dashboard renders, from the snapshot. */
export function buildRadar(snapshot: Snapshot): { board: BoardRow[]; radar: RadarData } {
  const board = buildBoard(snapshot);
  const live = liveRows(snapshot, 40);
  const noToken = snapshot.protocols.filter(isPreToken).length;
  const radar: RadarData = {
    as_of: snapshot.as_of,
    source: snapshot.source,
    floor_usd: snapshot.floor_usd,
    model_version: MODEL_VERSION,
    model: MODEL,
    category_factor: CATEGORY_FACTOR,
    counts: {
      protocols: snapshot.protocols.length,
      watchlist: snapshot.watchlist.length,
      board: board.length,
      early: board.filter((r) => !r.on_watchlist).length,
      trading: snapshot.protocols.length - noToken,
      no_token: noToken,
      floor_below: board.filter((r) => r.tvl_usd < snapshot.floor_usd).length,
    },
    rows: board.map((r) => ({
      rank: r.rank,
      slug: r.slug,
      name: r.name,
      category: r.category,
      chains: r.chains,
      tvl_usd: r.tvl_usd,
      change_7d: r.change_7d,
      mcap_usd: r.mcap_usd,
      listed_at: r.listed_at,
      gecko_id: r.gecko_id,
      symbol: r.symbol,
      token_status: r.token_status,
      on_watchlist: r.on_watchlist,
      age_days: r.age_days,
      age_months: r.age_months,
      implied_value_usd: r.implied_value_usd,
      factors: r.factors,
      farm_plan: r.farm_plan,
    })),
    live,
  };
  return { board, radar };
}

/** The snapshot out of a file's text, refused unless it is the shape the model scores. */
export function parseSnapshot(text: string): Snapshot {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new SnapshotError('snapshot.json is not JSON');
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) throw new SnapshotError('snapshot.json is not a JSON object');
  const o = raw as Record<string, unknown>;
  if (typeof o.as_of !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(o.as_of)) throw new SnapshotError('snapshot.json has no as_of date');
  if (typeof o.source !== 'string') throw new SnapshotError('snapshot.json has no source');
  if (typeof o.floor_usd !== 'number' || !Number.isSafeInteger(o.floor_usd) || o.floor_usd <= 0) throw new SnapshotError('snapshot.json has no floor_usd');
  if (!Array.isArray(o.protocols)) throw new SnapshotError('snapshot.json has no protocols array');
  if (!Array.isArray(o.watchlist) || o.watchlist.some((s) => typeof s !== 'string')) throw new SnapshotError('snapshot.json has no watchlist of slugs');
  const protocols = o.protocols.map((v, i) => {
    if (typeof v !== 'object' || v === null || Array.isArray(v)) throw new SnapshotError(`snapshot.json's protocol ${i} is not an object`);
    const p = v as Record<string, unknown>;
    if (typeof p.slug !== 'string' || typeof p.name !== 'string' || typeof p.tvl_usd !== 'number' || !Number.isFinite(p.tvl_usd)) {
      throw new SnapshotError(`snapshot.json's protocol ${i} lacks a slug, a name or a TVL`);
    }
    return {
      slug: p.slug,
      name: p.name,
      category: typeof p.category === 'string' ? p.category : null,
      chains: Array.isArray(p.chains) ? p.chains.filter((c): c is string => typeof c === 'string') : [],
      tvl_usd: p.tvl_usd,
      change_7d: typeof p.change_7d === 'number' && Number.isFinite(p.change_7d) ? p.change_7d : null,
      mcap_usd: typeof p.mcap_usd === 'number' && Number.isFinite(p.mcap_usd) ? p.mcap_usd : null,
      listed_at: typeof p.listed_at === 'string' ? p.listed_at : null,
      gecko_id: typeof p.gecko_id === 'string' ? p.gecko_id : null,
      symbol: typeof p.symbol === 'string' ? p.symbol : null,
    };
  });
  return {
    as_of: o.as_of,
    source: o.source,
    floor_usd: o.floor_usd,
    protocols,
    watchlist: o.watchlist as string[],
  };
}

/** A compact data.js: the dashboard's whole dataset as one script, no fetch and no network. */
export function dataScript(radar: RadarData): string {
  return `window.RADAR=${JSON.stringify(radar)};\n`;
}
