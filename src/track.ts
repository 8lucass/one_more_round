// The fixed ~30 s course. Every player (and every rematch) gets exactly this.
//
// t     = second at which the object reaches the ship.
// lane  = 0 left, 1 centre, 2 right.
//
// Structure
//   0–9 s   Phase 1: normal cores only (learn to move and collect).
//   9–15 s  Phase 2: barriers only (learn to dodge).
//  15–30 s  Phase 3: a high-value core sits in front of a barrier in the same
//           lane. Grab it and change lane before the barrier, or let it pass
//           and take the safe lane (which has normal cores).

export type ObjKind = 'core' | 'bigCore' | 'barrier';

export interface TrackItem {
  readonly t: number;
  readonly lane: number;
  readonly kind: ObjKind;
}

export interface Banner {
  readonly t: number;
  readonly dur: number;
  readonly title: string;
  readonly sub: string;
  readonly tone: 'core' | 'barrier' | 'risk' | 'neutral';
}

/** A high-value core with the barrier right behind it (used by tests and docs). */
export interface RiskPair {
  readonly core: TrackItem;
  readonly barrier: TrackItem;
}

const c = (t: number, lane: number): TrackItem => ({ t, lane, kind: 'core' });
const big = (t: number, lane: number): TrackItem => ({ t, lane, kind: 'bigCore' });
const bar = (t: number, lane: number): TrackItem => ({ t, lane, kind: 'barrier' });

export const TRACK: readonly TrackItem[] = [
  // ── Phase 1: cores only ───────────────────────────────────────────
  c(3.0, 1), c(3.5, 1),
  c(4.6, 0), c(5.1, 0),
  c(6.2, 2), c(6.7, 2),
  c(7.8, 1), c(8.3, 1),

  // ── Phase 2: barriers only ────────────────────────────────────────
  bar(10.0, 1),                // single block in the centre
  bar(11.6, 0),                // single block on the left
  bar(13.0, 1), bar(13.0, 2),  // only the left lane is open
  bar(14.6, 0), bar(14.6, 1),  // only the right lane is open

  // ── Phase 3: risk / reward ────────────────────────────────────────
  // A: big core centre, escape left or right. Safe lane: left.
  c(17.6, 0), c(18.0, 0),
  big(18.0, 1), bar(18.75, 1),

  bar(20.2, 1), bar(20.2, 2),  // only the left lane is open

  // B: big core left, escape to centre. Safe lane: right.
  c(21.6, 2), c(22.0, 2),
  big(22.0, 0), bar(22.7, 0),

  bar(24.2, 0), bar(24.2, 1),  // only the right lane is open

  // C: big core right, escape to centre. Safe lane: left. (tightest gap)
  c(25.6, 0), c(26.0, 0),
  big(26.0, 2), bar(26.6, 2),

  // Finale: a straight line of cores down the centre.
  c(27.8, 1), c(28.2, 1), c(28.6, 1), c(29.0, 1),
];

/** Tutorial banners of the first round. */
export const BANNERS: readonly Banner[] = [
  { t: 0.2, dur: 2.6, title: 'COLLECT THE CORES', sub: '+100 each · every core builds your streak', tone: 'core' },
  { t: 8.9, dur: 2.4, title: 'AVOID THE BARRIERS', sub: 'A crash resets your streak', tone: 'barrier' },
  // Starts after the last phase-2 wall (14.6 s) and is gone before the first pair arrives.
  { t: 14.9, dur: 2.0, title: '+500 · BARRIER BEHIND IT', sub: 'Grab it and escape, or let it pass.', tone: 'risk' },
];

/** The rematch skips the tutorials: one banner with the score to beat. */
export function rematchBanners(target: number): Banner[] {
  return [{ t: 0.2, dur: 2.6, title: `SAME TUNNEL · BEAT ${target}`, sub: 'Same cores, same barriers, same timing', tone: 'neutral' }];
}

/** Banners for a round: the tutorials in round 1, the target in the rematch. */
export function bannersFor(round: number, previousScore: number | undefined): readonly Banner[] {
  return round > 1 && previousScore !== undefined ? rematchBanners(previousScore) : BANNERS;
}

/** The banner visible at sim time `time`, if any. */
export function bannerAt(banners: readonly Banner[], time: number): Banner | undefined {
  return banners.find((b) => time >= b.t && time < b.t + b.dur);
}

/** High-value cores paired with the barrier that follows them in the same lane. */
export function riskPairs(track: readonly TrackItem[] = TRACK): RiskPair[] {
  const pairs: RiskPair[] = [];
  for (const core of track) {
    if (core.kind !== 'bigCore') continue;
    const barrier = track
      .filter((o) => o.kind === 'barrier' && o.lane === core.lane && o.t > core.t)
      .sort((a, b) => a.t - b.t)[0];
    if (barrier) pairs.push({ core, barrier });
  }
  return pairs;
}
