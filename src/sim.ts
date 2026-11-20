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
  | { type: 'collect'; obj: SimObject; points: number; streak: number }
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
  bigCores: number;
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
      bigCoresTotal: track.filter((o) => o.kind === 'bigCore').length,
      crashes: 0,
      dodges: 0,
    };
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
        const points = o.kind === 'bigCore' ? BIG_CORE_POINTS : CORE_POINTS;
        o.state = 'collected';
        o.resolvedAt = now;
        const s = this.stats;
        s.score += points;
        s.streak++;
        s.bestStreak = Math.max(s.bestStreak, s.streak);
        s.cores++;
        if (o.kind === 'bigCore') s.bigCores++;
        this.events.push({ type: 'collect', obj: o, points, streak: s.streak });
      } else if (now > o.t + CORE_WINDOW) {
        o.state = 'missed';
        o.resolvedAt = now;
        this.events.push({ type: 'miss', obj: o });
      }
    }
  }

  drainEvents(): SimEvent[] {
    const e = this.events;
    this.events = [];
    return e;
  }
}
