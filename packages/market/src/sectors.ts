import type { Rng } from './prng';
import type { SectorMeta, TickerMeta } from './types';

/** Plain industry words per spec §0.3 — familiar, but every figure is labeled simulated. */
export const SECTOR_NAMES = [
  'Technology',
  'Energy',
  'Health Care',
  'Financials',
  'Industrials',
  'Materials',
  'Utilities',
  'Consumer',
  'Communication',
  'Real Estate',
  'Transport',
] as const;

export const SECTOR_COUNT = SECTOR_NAMES.length; // 11
export const TICKERS_PER_SECTOR = 5;

/**
 * Fictional constituents — invented names, no real companies (spec §4.1).
 * Names are static (they are identity, not randomness); betas and shock
 * weights are the seed-driven part.
 */
const TICKER_NAMES: readonly (readonly [string, string])[][] = [
  // Technology
  [
    ['NWR', 'Northwind Robotics'],
    ['QLM', 'Qualia Microsystems'],
    ['VXD', 'Vexel Dynamics'],
    ['ARQ', 'Arqive Cloud'],
    ['SYL', 'Sylphware'],
  ],
  // Energy
  [
    ['HLC', 'Heliocore'],
    ['TDM', 'Tidemark Petroleum'],
    ['BRN', 'Boreal Energy'],
    ['KST', 'Kestrel Solar'],
    ['MGF', 'Magnaflux Grid'],
  ],
  // Health Care
  [
    ['SLV', 'Salvia Therapeutics'],
    ['MRD', 'Meridian Biologics'],
    ['CDX', 'Cardex Instruments'],
    ['ELX', 'Elixia Labs'],
    ['VTL', 'Vitalis Care'],
  ],
  // Financials
  [
    ['LDG', 'Ledgerline Trust'],
    ['CSP', 'Caspian Holdings'],
    ['ORB', 'Orbis Assurance'],
    ['FNH', 'Finch & Harrow'],
    ['AXM', 'Axiom Clearing'],
  ],
  // Industrials
  [
    ['GRD', 'Girder & Sons'],
    ['FRG', 'Forgeline Systems'],
    ['PLM', 'Plumbline Tools'],
    ['CRN', 'Crane Atlantic'],
    ['MLL', 'Millwright Corp'],
  ],
  // Materials
  [
    ['OXD', 'Oxide Standard'],
    ['QRY', 'Quarrystone'],
    ['LMN', 'Lumen Alloys'],
    ['SLT', 'Saltworks Industrial'],
    ['VRD', 'Verdant Polymers'],
  ],
  // Utilities
  [
    ['DYN', 'Dynamo Utility'],
    ['AQF', 'Aquifer Water'],
    ['NGL', 'Nightingale Power'],
    ['CRC', 'Circuit Municipal'],
    ['EMB', 'Ember District'],
  ],
  // Consumer
  [
    ['MRC', 'Mercantile Row'],
    ['SNP', 'Sunpeak Foods'],
    ['HTH', 'Hearth & Hollow'],
    ['PLV', 'Palaver Media'],
    ['TLR', 'Tailorbird'],
  ],
  // Communication
  [
    ['SGN', 'Signalhouse'],
    ['RLY', 'Relay Meridian'],
    ['ECH', 'Echelon Wireless'],
    ['BCN', 'Beacon Array'],
    ['MRW', 'Marrowlink'],
  ],
  // Real Estate
  [
    ['KYS', 'Keystone Commons'],
    ['ATR', 'Atrium Yield'],
    ['LOD', 'Lodestar Properties'],
    ['GBL', 'Gable & Vane'],
    ['TRC', 'Terrace Capital'],
  ],
  // Transport
  [
    ['WYF', 'Wayfare Freight'],
    ['HRB', 'Harborline'],
    ['CVY', 'Convoy Northern'],
    ['SKL', 'Skylark Cargo'],
    ['RLS', 'Railspur'],
  ],
];

export function slugify(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
}

/**
 * Build the seed-dependent sector metadata. Draw order matters for determinism:
 * betas first (11 draws), then the shock-weight template (11 draws + shuffle draws).
 *
 * The correlation template gives exactly 4 sectors a high shock exposure
 * (1.25–1.55) and the rest a low one (0.2–0.55), so a macro shock turns 3–5
 * sectors stormy (spec §3.1 / §4.5) — which ones varies by seed. Conditional
 * vol scales ~linearly with the weight, so the high band's min/max ratio
 * (0.81) keeps every high-weight sector above the 0.7 "stormy" threshold
 * while the low band stays under ~0.4.
 */
export function buildSectors(rng: Rng): SectorMeta[] {
  const betas = SECTOR_NAMES.map(() => rng.range(0.6, 1.4));

  // Pick 4 high-exposure sectors via a seeded partial Fisher–Yates.
  const order = SECTOR_NAMES.map((_, i) => i);
  for (let i = order.length - 1; i > 0; i--) {
    const j = rng.int(i + 1);
    const oi = order[i] as number;
    order[i] = order[j] as number;
    order[j] = oi;
  }
  const high = new Set(order.slice(0, 4));
  const weights = SECTOR_NAMES.map((_, i) =>
    high.has(i) ? rng.range(1.25, 1.55) : rng.range(0.2, 0.55),
  );

  return SECTOR_NAMES.map((name, i) => {
    const tickers: TickerMeta[] = (TICKER_NAMES[i] ?? []).map(([symbol, full]) => ({
      symbol,
      name: full,
    }));
    return {
      id: i,
      name,
      slug: slugify(name),
      beta: betas[i] as number,
      shockWeight: weights[i] as number,
      tickers,
    };
  });
}
