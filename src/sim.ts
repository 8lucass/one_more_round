// Deterministic game simulation. No rendering, no DOM: the browser game and
// the Node tests drive exactly the same code.

import {
  BIG_CORE_POINTS,
  CORE_POINTS,
  CORE_WINDOW,
  INVULNERABLE_AFTER_CRASH,
  LANES,
  RUN_DURATION,
} from './config.ts';
import { TRACK, type ObjKind, type TrackItem } from './track.ts';

export type ObjState = 'pending' | 'collected' | 'missed' | 'hit' | 'passed';

export interface SimObject {
  readonly id: number;
  readonly t: number;
  readonly lane: number;
  readonly kind: ObjKind;
  state: ObjState;
  /** Sim time at which the state stopped being 'pending'. */
  resolvedAt: number;
}

export type SimEvent =
  /** `points` = what reached the score right now (0 for a +500 that still has to be banked). */
  | { type: 'collect'; obj: SimObject; points: number; streak: number }
  /** A +500 core whose barrier was passed without crashing: its points reach the score. */
  | { type: 'bank'; obj: SimObject; points: number }
  /** A +500 core whose barrier was hit: its points are lost. */
  | { type: 'lose'; obj: SimObject; points: number }
  | { type: 'crash'; obj: SimObject }
  | { type: 'dodge'; obj: SimObject }
  | { type: 'miss'; obj: SimObject }
  | { type: 'move'; from: number; to: number }
  | { type: 'bump'; dir: number }
  | { type: 'finish' };

export interface Stats {
  score: number;
  streak: number;
  bestStreak: number;
  cores: number;
  coresTotal: number;
  /** +500 cores grabbed (banked, lost or still pending). */
  bigCores: number;
  /** +500 cores whose barrier was then passed cleanly: their points count. */
  bigBanked: number;
  /** +500 cores grabbed and then lost by crashing into their barrier. */
  bigLost: number;
  bigCoresTotal: number;
  crashes: number;
  dodges: number;
}

export class Sim {
  time = 0;
  lane = 1;
  invulnerableUntil = -1;
  finished = false;
  readonly objects: SimObject[];
  readonly stats: Stats;
  /** Events since the last drain; the renderer turns them into feedback. */
  events: SimEvent[] = [];
  /** "Bank on clear": each +500 core → the barrier that follows it in the same lane. */
  private readonly guardOf = new Map<number, SimObject>();
  /** +500 cores grabbed whose barrier has not been resolved yet. */
  private readonly pending = new Set<SimObject>();

  constructor(track: readonly TrackItem[] = TRACK) {
    this.objects = track
      .map((o, i) => ({ id: i, t: o.t, lane: o.lane, kind: o.kind, state: 'pending' as ObjState, resolvedAt: -1 }))
      .sort((a, b) => a.t - b.t);
    this.stats = {
      score: 0,
      streak: 0,
      bestStreak: 0,
      cores: 0,
      coresTotal: track.filter((o) => o.kind !== 'barrier').length,
      bigCores: 0,
      bigBanked: 0,
      bigLost: 0,
      bigCoresTotal: track.filter((o) => o.kind === 'bigCore').length,
      crashes: 0,
      dodges: 0,
    };
    for (const core of this.objects) {
      if (core.kind !== 'bigCore') continue;
      const guard = this.objects.find((o) => o.kind === 'barrier' && o.lane === core.lane && o.t > core.t);
      if (guard) this.guardOf.set(core.id, guard);
    }
  }

  /** Points of the +500 cores grabbed but not yet banked (shown as "+500?"). */
  get pendingBonus(): number {
    return this.pending.size * BIG_CORE_POINTS;
  }

  /** One lane per call. Returns false (and emits a bump) at the edge. */
  move(dir: -1 | 1): boolean {
    if (this.finished) return false;
    const to = this.lane + dir;
    if (to < 0 || to >= LANES) {
      this.events.push({ type: 'bump', dir });
      return false;
    }
    this.events.push({ type: 'move', from: this.lane, to });
    this.lane = to;
    // Moving into a core that is inside its window collects it right away.
    this.resolveCores(this.time);
    return true;
  }

  get invulnerable(): boolean {
    return this.time < this.invulnerableUntil;
  }

  step(dt: number): void {
    if (this.finished) return;
    const prev = this.time;
    const now = prev + dt;
    this.time = now;

    // Barriers resolve on the exact frame they cross the ship.
    for (const o of this.objects) {
      if (o.state !== 'pending' || o.kind !== 'barrier') continue;
      if (o.t > now) break;
      if (o.t <= prev) continue;
      if (o.lane === this.lane && !(o.t < this.invulnerableUntil)) {
        o.state = 'hit';
        o.resolvedAt = now;
        this.stats.crashes++;
        this.stats.streak = 0;
        this.invulnerableUntil = o.t + INVULNERABLE_AFTER_CRASH;
        this.events.push({ type: 'crash', obj: o });
      } else {
        o.state = 'passed';
        o.resolvedAt = now;
        this.stats.dodges++;
        this.events.push({ type: 'dodge', obj: o });
      }
      this.settleBonuses();
    }

    this.resolveCores(now);

    if (now >= RUN_DURATION) {
      this.finished = true;
      this.events.push({ type: 'finish' });
    }
  }

  private resolveCores(now: number): void {
    for (const o of this.objects) {
      if (o.state !== 'pending' || o.kind === 'barrier') continue;
      if (o.t - CORE_WINDOW > now) break;
      if (o.lane === this.lane && Math.abs(now - o.t) <= CORE_WINDOW) {
        const big = o.kind === 'bigCore';
        o.state = 'collected';
        o.resolvedAt = now;
        const s = this.stats;
        // A +500 only counts once its barrier is passed without a crash (bank on clear).
        const points = big ? 0 : CORE_POINTS;
        s.score += points;
        s.streak++;
        s.bestStreak = Math.max(s.bestStreak, s.streak);
        s.cores++;
        if (big) {
          s.bigCores++;
          this.pending.add(o);
        }
        this.events.push({ type: 'collect', obj: o, points, streak: s.streak });
        if (big) this.settleBonuses();
      } else if (now > o.t + CORE_WINDOW) {
        o.state = 'missed';
        o.resolvedAt = now;
        this.events.push({ type: 'miss', obj: o });
      }
    }
  }

  /** Banks or loses every grabbed +500 whose barrier has been resolved (or that has none). */
  private settleBonuses(): void {
    for (const core of this.pending) {
      const guard = this.guardOf.get(core.id);
      if (guard && guard.state === 'pending') continue;
      this.pending.delete(core);
      const s = this.stats;
      if (guard && guard.state === 'hit') {
        s.bigLost++;
        this.events.push({ type: 'lose', obj: core, points: BIG_CORE_POINTS });
      } else {
        s.bigBanked++;
        s.score += BIG_CORE_POINTS;
        this.events.push({ type: 'bank', obj: core, points: BIG_CORE_POINTS });
      }
    }
  }

  drainEvents(): SimEvent[] {
    const e = this.events;
    this.events = [];
    return e;
  }
}
