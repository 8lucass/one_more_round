// Canvas 2D renderer: 2.5D tunnel seen from behind the ship, plus HUD and
// menu screens. Placeholder art: the goal is legibility, not final looks.

import { BIG_CORE_POINTS, COUNTDOWN, CORE_POINTS, FADE_IN, LOOKAHEAD, RUN_DURATION, SPEED } from './config.ts';
import type { Sim, SimEvent, SimObject, Stats } from './sim.ts';
import type { Banner } from './track.ts';

// ── Logical screen + camera ──────────────────────────────────────────
export const W = 960;
export const H = 540;
const CX = W / 2;
const VY = 196; // vanishing point height
const FLOOR_Y = 490; // floor line at the ship plane
const LANE_PX = 230; // lane width in px at the ship plane
const CAM = 4; // camera distance behind the ship plane (world units)
const Z_NEAR = -2;
const Z_FAR = LOOKAHEAD * SPEED + 0.6;
const HALF_W = 1.75; // tunnel half width (lanes are ±1.5)
const TUNNEL_H = 2.3;
const RING_SPACING = 3;
// Barriers are taller than cores float, so a barrier behind a core stays visible above it.
const BARRIER_H = 1.0;
const CORE_Y = 0.3;

const FONT = '"Segoe UI", system-ui, -apple-system, Roboto, Helvetica, Arial, sans-serif';

const COL = {
  bg: '#04050d',
  floorNear: '#1a2140',
  floorFar: '#070914',
  wall: '#0d1126',
  ceiling: '#080a18',
  ring: '#4d6bff',
  lane: '#8fa6ff',
  laneHi: '#47e7ff',
  core: '#47e7ff',
  big: '#ffc933',
  barrier: '#ff3b3b',
  barrierDark: '#3a0a0a',
  ship: '#e9f1ff',
  text: '#f2f5ff',
  dim: '#8c95b8',
  close: '#9dff8a',
  missed: '#5d6482',
  missedEdge: '#a3a9c2',
  warn: '#ffd37a',
};

/** A collected core flies into the ship for this long (hides the early pickup). */
const MAGNET_TIME = 0.07;
/** A missed core turns grey and fades out over this long. */
const MISS_FADE = 0.5;
/** Vertical gap between stacked popups in the same lane (px). */
const POPUP_ROW = 80;

interface P {
  x: number;
  y: number;
  s: number;
}

function proj(x: number, y: number, z: number): P {
  const s = CAM / (z + CAM);
  return { x: CX + x * LANE_PX * s, y: VY + (FLOOR_Y - VY) * s - y * LANE_PX * s, s };
}

const laneX = (lane: number) => lane - 1;

function poly(ctx: CanvasRenderingContext2D, pts: P[]): void {
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
  ctx.closePath();
}

/** 1 near the ship, fading to 0 at the far end of the draw distance. */
function fog(z: number): number {
  const fadeZ = FADE_IN * SPEED;
  return Math.max(0, Math.min(1, (LOOKAHEAD * SPEED - z) / fadeZ));
}

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
const easeOut = (t: number) => 1 - (1 - t) * (1 - t);

// ── UI model shared with main.ts ─────────────────────────────────────
export type Screen = 'title' | 'countdown' | 'playing' | 'paused' | 'finishing' | 'results' | 'closing';

/** Speaker icon (bottom right): shows the sound state; tapping it toggles mute. */
export const MUTE_BUTTON = { x: W - 54, y: H - 44, w: 42, h: 34 };

export interface Button {
  id: 'rematch' | 'finish';
  label: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

export function resultButtons(canRematch: boolean): Button[] {
  const bw = 250;
  const bh = 58;
  const y = 418;
  if (!canRematch) return [{ id: 'finish', label: 'Finish', x: CX - bw / 2, y, w: bw, h: bh }];
  return [
    { id: 'rematch', label: 'One more round', x: CX - bw - 14, y, w: bw, h: bh },
    { id: 'finish', label: 'Finish', x: CX + 14, y, w: bw, h: bh },
  ];
}

export interface View {
  screen: Screen;
  screenTime: number; // seconds since entering the screen
  round: number;
  maxRounds: number;
  countdown: number; // seconds left in the countdown
  resuming: boolean; // countdown after a pause (the round is half played)
  results: Stats[]; // finished rounds of the current player
  selected: number; // focused button index
  inputLocked: boolean;
  lockProgress: number; // 0 → 1 while the screen ignores input
  banner: Banner | undefined; // phase banner to show now
  idleLeft: number | null; // seconds until the automatic return to the title
  idleWarning: number; // show the notice when idleLeft drops below this
  touch: boolean; // last input was touch: say "tap" instead of "press ENTER"
  reducedMotion: boolean; // prefers-reduced-motion: no shake, no flicker, no pulsing
  muted: boolean;
}

// ── Effects ──────────────────────────────────────────────────────────
interface Popup {
  kind: 'score' | 'crash' | 'close';
  text: string;
  sub: string;
  color: string;
  x: number;
  age: number;
  life: number;
  row: number; // 0 = lowest; newer popups in the same lane push older ones up
  shownRow: number; // animated towards `row`
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  age: number;
  life: number;
  color: string;
  size: number;
}

export class Renderer {
  shipX = 0; // visual lateral position (world units)
  /** Camera shake amplitude used in the last drawn frame (px). Read by tests. */
  shakeAmp = 0;
  private trail: number[] = [];
  private tilt = 0;
  private bump = 0; // edge bump offset
  private shake = 0;
  private flash = 0;
  private flashColor = COL.barrier;
  private streakPulse = 0;
  private laneFlash = 0;
  private idleClock = 0;
  private crashAt = -Infinity; // sim time of the last crash (ship flicker phase)
  private popups: Popup[] = [];
  private particles: Particle[] = [];

  reset(lane: number): void {
    this.shipX = laneX(lane);
    this.trail = [];
    this.tilt = 0;
    this.bump = 0;
    this.shake = 0;
    this.flash = 0;
    this.crashAt = -Infinity;
    this.popups = [];
    this.particles = [];
  }

  /** `time` = sim time of the drain; `close` = ids of barriers dodged at the last moment. */
  handleEvents(events: SimEvent[], time: number, close: ReadonlySet<number>): void {
    for (const e of events) {
      switch (e.type) {
        case 'move':
          this.laneFlash = 1;
          break;
        case 'bump':
          this.bump = e.dir * 0.12;
          break;
        case 'collect': {
          const big = e.obj.kind === 'bigCore';
          // Only the latest score popup is shown, so quick pickups don't stack up.
          this.popups = this.popups.filter((p) => p.kind !== 'score');
          this.addPopup('score', `+${e.points}`, `STREAK ${e.streak}`, big ? COL.big : COL.core, laneX(e.obj.lane), big ? 1.3 : 0.7);
          this.burst(laneX(e.obj.lane), big ? COL.big : COL.core, big ? 36 : 18, big ? 1.4 : 1);
          this.streakPulse = 1;
          if (big) {
            this.flash = 0.35;
            this.flashColor = COL.big;
          }
          break;
        }
        case 'crash':
          this.crashAt = time;
          this.addPopup('crash', 'CRASH!', 'STREAK RESET', COL.barrier, laneX(e.obj.lane), 1.2);
          this.burst(laneX(e.obj.lane), COL.barrier, 40, 1.6);
          this.shake = 1;
          this.flash = 0.55;
          this.flashColor = COL.barrier;
          break;
        case 'dodge':
          if (close.has(e.obj.id)) {
            this.addPopup('close', 'CLOSE!', 'NICE DODGE', COL.close, laneX(e.obj.lane), 0.8);
            this.burst(laneX(e.obj.lane), COL.close, 10, 0.7);
          }
          break;
        default:
          break;
      }
    }
  }

  /** New popups start at the bottom row; older ones in the same lane move up so both stay readable. */
  private addPopup(kind: Popup['kind'], text: string, sub: string, color: string, x: number, life: number): void {
    for (const p of this.popups) if (Math.abs(p.x - x) < 0.9) p.row++;
    this.popups = this.popups.filter((p) => p.row < 3);
    this.popups.push({ kind, text, sub, color, x, age: 0, life, row: 0, shownRow: 0 });
  }

  private burst(x: number, color: string, n: number, power: number): void {
    const p = proj(x, 0.35, 0);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const v = (120 + Math.random() * 260) * power;
      this.particles.push({
        x: p.x,
        y: p.y,
        vx: Math.cos(a) * v,
        vy: Math.sin(a) * v - 120,
        age: 0,
        life: 0.45 + Math.random() * 0.35,
        color,
        size: 2 + Math.random() * 4,
      });
    }
  }

  /** Advance purely visual state. `lane` is the logical lane (already switched). */
  update(dt: number, lane: number): void {
    this.idleClock += dt;
    const target = laneX(lane);
    // Very fast exponential approach: ~90 % of the way in 0.1 s.
    const k = 1 - Math.exp(-dt / 0.042);
    const before = this.shipX;
    this.shipX += (target - this.shipX) * k;
    const vel = dt > 0 ? (this.shipX - before) / dt : 0;
    this.tilt += (Math.max(-0.45, Math.min(0.45, vel * 0.035)) - this.tilt) * (1 - Math.exp(-dt / 0.05));
    this.trail.unshift(this.shipX);
    if (this.trail.length > 6) this.trail.pop();
    this.bump *= Math.exp(-dt / 0.06);
    this.shake = Math.max(0, this.shake - dt / 0.4);
    this.flash = Math.max(0, this.flash - dt * 1.6);
    this.streakPulse = Math.max(0, this.streakPulse - dt * 3);
    this.laneFlash = Math.max(0, this.laneFlash - dt * 4);
    const kr = 1 - Math.exp(-dt / 0.06);
    for (const p of this.popups) {
      p.age += dt;
      p.shownRow += (p.row - p.shownRow) * kr;
    }
    this.popups = this.popups.filter((p) => p.age < p.life);
    for (const p of this.particles) {
      p.age += dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += 700 * dt;
    }
    this.particles = this.particles.filter((p) => p.age < p.life);
  }

  // ── Main draw ──────────────────────────────────────────────────────
  draw(ctx: CanvasRenderingContext2D, sim: Sim, view: View): void {
    ctx.save();
    ctx.fillStyle = COL.bg;
    ctx.fillRect(0, 0, W, H);

    const playingLike =
      view.screen === 'playing' || view.screen === 'finishing' || view.screen === 'countdown' || view.screen === 'paused';
    const time = sim.time;
    const dist = playingLike || view.screen === 'results' ? time * SPEED : this.idleClock * SPEED * 0.6;

    this.shakeAmp = 0;
    if (this.shake > 0 && !view.reducedMotion) {
      const a = this.shake * this.shake * 14;
      this.shakeAmp = a;
      ctx.translate((Math.random() - 0.5) * a, (Math.random() - 0.5) * a);
    }

    this.drawTunnel(ctx, dist);
    const showWorld = view.screen !== 'title' && view.screen !== 'closing';
    if (showWorld) {
      this.drawLaneHighlight(ctx, sim.lane);
      this.drawFloorWarnings(ctx, sim);
      const objs = this.visibleObjects(sim);
      // Behind the ship: everything still ahead of it, and the debris of a hit barrier
      // (the ship must stay visible through its own crash).
      const inFront = (o: SimObject) => o.state !== 'hit' && (o.t - time) * SPEED <= 0.3;
      for (const o of objs) if (!inFront(o)) this.drawObject(ctx, o, time);
      this.drawShip(ctx, sim, view.reducedMotion);
      for (const o of objs) if (inFront(o)) this.drawObject(ctx, o, time);
      this.drawParticles(ctx);
      this.drawPopups(ctx);
    }
    ctx.restore();

    if (this.flash > 0) {
      ctx.save();
      ctx.globalAlpha = this.flash * 0.5;
      const g = ctx.createRadialGradient(CX, H / 2, H * 0.25, CX, H / 2, W * 0.65);
      g.addColorStop(0, 'rgba(0,0,0,0)');
      g.addColorStop(1, this.flashColor);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
      ctx.restore();
    }

    if (playingLike) {
      this.drawHud(ctx, sim, view);
      if (view.banner && (view.screen === 'playing' || view.screen === 'countdown')) {
        this.drawBanner(ctx, view.banner, view.screen === 'playing' ? time : null);
      }
    }
    if (view.screen === 'countdown') this.drawCountdown(ctx, view);
    if (view.screen === 'paused') this.drawPaused(ctx, view);
    if (view.screen === 'finishing') this.drawFinish(ctx, view);
    if (view.screen === 'title') this.drawTitle(ctx, view);
    if (view.screen === 'results') this.drawResults(ctx, view);
    if (view.screen === 'closing') this.drawClosing(ctx, view);
    if (view.idleLeft !== null && view.idleLeft <= view.idleWarning) this.drawIdleWarning(ctx, view);
    this.drawSoundIcon(ctx, view);
  }

  // ── Tunnel ─────────────────────────────────────────────────────────
  private drawTunnel(ctx: CanvasRenderingContext2D, dist: number): void {
    const nl = proj(-HALF_W, 0, Z_NEAR);
    const nr = proj(HALF_W, 0, Z_NEAR);
    const fl = proj(-HALF_W, 0, Z_FAR);
    const fr = proj(HALF_W, 0, Z_FAR);
    const ntl = proj(-HALF_W, TUNNEL_H, Z_NEAR);
    const ntr = proj(HALF_W, TUNNEL_H, Z_NEAR);
    const ftl = proj(-HALF_W, TUNNEL_H, Z_FAR);
    const ftr = proj(HALF_W, TUNNEL_H, Z_FAR);

    // Far end glow.
    const g0 = ctx.createRadialGradient(CX, VY, 4, CX, VY, 120);
    g0.addColorStop(0, '#2b3a8a');
    g0.addColorStop(1, COL.bg);
    ctx.fillStyle = g0;
    ctx.fillRect(ftl.x - 40, ftl.y - 40, ftr.x - ftl.x + 80, fl.y - ftl.y + 80);

    // Floor.
    const gf = ctx.createLinearGradient(0, fl.y, 0, H);
    gf.addColorStop(0, COL.floorFar);
    gf.addColorStop(1, COL.floorNear);
    ctx.fillStyle = gf;
    poly(ctx, [nl, nr, fr, fl]);
    ctx.fill();

    // Walls + ceiling.
    ctx.fillStyle = COL.wall;
    poly(ctx, [nl, fl, ftl, ntl]);
    ctx.fill();
    poly(ctx, [nr, fr, ftr, ntr]);
    ctx.fill();
    ctx.fillStyle = COL.ceiling;
    poly(ctx, [ntl, ntr, ftr, ftl]);
    ctx.fill();

    // Rings scrolling towards the camera (sense of speed).
    const off = dist % RING_SPACING;
    for (let z = Z_FAR - ((Z_FAR + off) % RING_SPACING); z > Z_NEAR + 0.5; z -= RING_SPACING) {
      const a = fog(z) * 0.55;
      if (a <= 0) continue;
      const p0 = proj(-HALF_W, 0, z);
      const p1 = proj(HALF_W, 0, z);
      const p2 = proj(HALF_W, TUNNEL_H, z);
      const p3 = proj(-HALF_W, TUNNEL_H, z);
      ctx.strokeStyle = COL.ring;
      ctx.globalAlpha = a;
      ctx.lineWidth = Math.max(1, 3 * p0.s);
      ctx.beginPath();
      ctx.moveTo(p0.x, p0.y);
      ctx.lineTo(p3.x, p3.y);
      ctx.lineTo(p2.x, p2.y);
      ctx.lineTo(p1.x, p1.y);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;

    // Lane edges (solid) and dividers (dashed, scrolling).
    ctx.fillStyle = COL.lane;
    for (const x of [-1.5, 1.5]) {
      ctx.globalAlpha = 0.5;
      poly(ctx, [proj(x - 0.02, 0, Z_NEAR), proj(x + 0.02, 0, Z_NEAR), proj(x + 0.02, 0, Z_FAR), proj(x - 0.02, 0, Z_FAR)]);
      ctx.fill();
    }
    const dash = 1.4;
    const dOff = dist % (dash * 2);
    for (const x of [-0.5, 0.5]) {
      for (let z = -dOff + Z_NEAR; z < Z_FAR; z += dash * 2) {
        const z0 = Math.max(Z_NEAR, z);
        const z1 = Math.min(Z_FAR, z + dash);
        if (z1 <= z0) continue;
        ctx.globalAlpha = 0.75 * fog(z0);
        poly(ctx, [proj(x - 0.025, 0, z0), proj(x + 0.025, 0, z0), proj(x + 0.025, 0, z1), proj(x - 0.025, 0, z1)]);
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
  }

  /** The ship's lane lights up instantly on key press: the clearest cue of the switch. */
  private drawLaneHighlight(ctx: CanvasRenderingContext2D, lane: number): void {
    const x = laneX(lane);
    const near = proj(x, 0, Z_NEAR);
    const far = proj(x, 0, Z_FAR);
    const g = ctx.createLinearGradient(0, near.y, 0, far.y);
    const a = 0.22 + this.laneFlash * 0.25;
    g.addColorStop(0, `rgba(71,231,255,${a})`);
    g.addColorStop(0.55, `rgba(71,231,255,${a * 0.35})`);
    g.addColorStop(1, 'rgba(71,231,255,0)');
    ctx.fillStyle = g;
    poly(ctx, [proj(x - 0.48, 0, Z_NEAR), proj(x + 0.48, 0, Z_NEAR), proj(x + 0.48, 0, Z_FAR), proj(x - 0.48, 0, Z_FAR)]);
    ctx.fill();
    // Bright edges of the active lane.
    ctx.fillStyle = COL.laneHi;
    for (const ex of [x - 0.48, x + 0.48]) {
      ctx.globalAlpha = 0.6 + this.laneFlash * 0.4;
      poly(ctx, [proj(ex - 0.018, 0, Z_NEAR), proj(ex + 0.018, 0, Z_NEAR), proj(ex + 0.018, 0, 16), proj(ex - 0.018, 0, 16)]);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  /** Red glow on the floor in front of every upcoming barrier. */
  private drawFloorWarnings(ctx: CanvasRenderingContext2D, sim: Sim): void {
    for (const o of sim.objects) {
      if (o.kind !== 'barrier' || o.state === 'hit') continue;
      const z = (o.t - sim.time) * SPEED;
      if (z > LOOKAHEAD * SPEED || z < Z_NEAR) continue;
      const x = laneX(o.lane);
      const z0 = Math.max(Z_NEAR, z - 3);
      const a = fog(z) * 0.5;
      const pn = proj(x, 0, z0);
      const pf = proj(x, 0, z);
      const g = ctx.createLinearGradient(0, pn.y, 0, pf.y);
      g.addColorStop(0, 'rgba(255,59,59,0)');
      g.addColorStop(1, `rgba(255,59,59,${a})`);
      ctx.fillStyle = g;
      poly(ctx, [proj(x - 0.46, 0, z0), proj(x + 0.46, 0, z0), proj(x + 0.46, 0, z), proj(x - 0.46, 0, z)]);
      ctx.fill();
    }
  }

  private visibleObjects(sim: Sim): SimObject[] {
    const out: SimObject[] = [];
    for (const o of sim.objects) {
      const z = (o.t - sim.time) * SPEED;
      const age = sim.time - o.resolvedAt;
      if (o.state === 'collected') {
        if (age < MAGNET_TIME) out.push(o);
        continue;
      }
      if (o.state === 'missed') {
        if (age < MISS_FADE) out.push(o);
        continue;
      }
      if (z > LOOKAHEAD * SPEED || z < Z_NEAR + 0.2) continue;
      if (o.state === 'hit' && age > 0.45) continue;
      if (o.state !== 'hit' && z < -1) continue;
      out.push(o);
    }
    return out.sort((a, b) => b.t - a.t);
  }

  private drawObject(ctx: CanvasRenderingContext2D, o: SimObject, time: number): void {
    if (o.kind !== 'barrier' && (o.state === 'collected' || o.state === 'missed')) {
      this.drawResolvedCore(ctx, o, time);
      return;
    }
    // A hit barrier stays where it broke (just ahead of the ship) while it shatters.
    const z = o.state === 'hit' ? 0.5 : (o.t - time) * SPEED;
    // Cores keep full opacity as they pass the ship: a missed core must still be seen.
    const fadePast = o.kind === 'barrier' && z < 0 ? clamp01(1 + z) : 1;
    const alpha = fog(z) * fadePast;
    if (alpha <= 0) return;
    ctx.save();
    ctx.globalAlpha = alpha;
    if (o.kind === 'barrier') this.drawBarrier(ctx, o, z, time);
    else this.drawCore(ctx, o, z, time);
    ctx.restore();
  }

  /** Collected: flies into the ship. Missed: turns grey where it passed and fades. */
  private drawResolvedCore(ctx: CanvasRenderingContext2D, o: SimObject, time: number): void {
    const z0 = (o.t - o.resolvedAt) * SPEED;
    const x0 = laneX(o.lane);
    ctx.save();
    if (o.state === 'collected') {
      const k = easeOut(clamp01((time - o.resolvedAt) / MAGNET_TIME));
      ctx.globalAlpha = 1 - k * 0.6;
      this.drawCore(ctx, o, z0 * (1 - k), time, {
        x: x0 + (this.shipX - x0) * k,
        y: CORE_Y + (0.2 - CORE_Y) * k,
        scale: 1 - k * 0.6,
      });
    } else {
      const k = clamp01((time - o.resolvedAt) / MISS_FADE);
      ctx.globalAlpha = 1 - k;
      this.drawCore(ctx, o, z0, time, { y: CORE_Y - k * 0.2, gray: true });
    }
    ctx.restore();
  }

  private drawCore(
    ctx: CanvasRenderingContext2D,
    o: SimObject,
    z: number,
    time: number,
    opt: { x?: number; y?: number; scale?: number; gray?: boolean } = {},
  ): void {
    const big = o.kind === 'bigCore';
    const gray = !!opt.gray;
    const x = opt.x ?? laneX(o.lane);
    const bob = gray ? 0 : Math.sin(time * 5 + o.id) * 0.04;
    const c = proj(x, (opt.y ?? CORE_Y) + bob, z);
    const r = (big ? 0.2 : 0.15) * LANE_PX * c.s * (opt.scale ?? 1);
    const color = gray ? COL.missed : big ? COL.big : COL.core;

    // Shadow on the floor.
    const sh = proj(x, 0, z);
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ctx.beginPath();
    ctx.ellipse(sh.x, sh.y, r * 0.9, r * 0.25, 0, 0, Math.PI * 2);
    ctx.fill();

    // Glow (a missed core has lost it).
    if (!gray) {
      const g = ctx.createRadialGradient(c.x, c.y, 0, c.x, c.y, r * 1.9);
      g.addColorStop(0, big ? 'rgba(255,201,51,0.65)' : 'rgba(71,231,255,0.55)');
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(c.x, c.y, r * 1.9, 0, Math.PI * 2);
      ctx.fill();
    }

    // Body: diamond (normal) or 8-point star (high value).
    const rot = (gray ? o.resolvedAt : time) * (big ? 2.2 : 3) + o.id;
    ctx.fillStyle = color;
    ctx.strokeStyle = gray ? COL.missedEdge : '#ffffff';
    ctx.lineWidth = Math.max(1, 2.5 * c.s);
    ctx.beginPath();
    const pts = big ? 16 : 4;
    for (let i = 0; i < pts; i++) {
      const a = rot + (i / pts) * Math.PI * 2;
      const rr = big ? (i % 2 === 0 ? r : r * 0.55) : r;
      const px = c.x + Math.cos(a) * rr * (big ? 1 : 0.8);
      const py = c.y + Math.sin(a) * rr;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = gray ? COL.missedEdge : '#ffffff';
    ctx.beginPath();
    ctx.arc(c.x, c.y, r * 0.28, 0, Math.PI * 2);
    ctx.fill();

    if (big && !gray && o.state === 'pending') {
      // Pulsing ring + value tag so it reads as "special" from far away.
      const pulse = (time * 1.8) % 1;
      ctx.strokeStyle = COL.big;
      ctx.globalAlpha *= 1 - pulse;
      ctx.lineWidth = Math.max(1, 3 * c.s);
      ctx.beginPath();
      ctx.arc(c.x, c.y, r * (1.2 + pulse * 1.2), 0, Math.PI * 2);
      ctx.stroke();
      if (z < 18) {
        ctx.globalAlpha = fog(z) * clamp01((18 - z) / 4);
        const fs = Math.max(12, 30 * c.s);
        ctx.font = `800 ${fs}px ${FONT}`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.lineWidth = Math.max(2, 5 * c.s);
        ctx.strokeStyle = 'rgba(0,0,0,0.8)';
        ctx.strokeText(`+${BIG_CORE_POINTS}`, c.x - r * 2.6, c.y);
        ctx.fillStyle = COL.big;
        ctx.fillText(`+${BIG_CORE_POINTS}`, c.x - r * 2.6, c.y);
      }
    }
  }

  private drawBarrier(ctx: CanvasRenderingContext2D, o: SimObject, z: number, time: number): void {
    const x = laneX(o.lane);
    if (o.state === 'hit') {
      // Two halves split apart, drop and fade.
      const k = easeOut(clamp01((time - o.resolvedAt) / 0.45));
      ctx.globalAlpha *= 1 - k;
      this.drawBox(ctx, x - 0.44 - k * 0.5, x - k * 0.5, -k * 0.5, z, true);
      this.drawBox(ctx, x + k * 0.5, x + 0.44 + k * 0.5, -k * 0.5, z, true);
      return;
    }
    this.drawBox(ctx, x - 0.44, x + 0.44, 0, z, false);
  }

  private drawBox(ctx: CanvasRenderingContext2D, x0: number, x1: number, oy: number, z: number, broken: boolean): void {
    const h = BARRIER_H;
    const d = 0.35;
    const zf = z;
    const zb = z + d;
    const f = [proj(x0, oy, zf), proj(x1, oy, zf), proj(x1, h + oy, zf), proj(x0, h + oy, zf)];
    const b = [proj(x0, oy, zb), proj(x1, oy, zb), proj(x1, h + oy, zb), proj(x0, h + oy, zb)];

    // Top face.
    ctx.fillStyle = '#ff7a6a';
    poly(ctx, [f[3], f[2], b[2], b[3]]);
    ctx.fill();
    // Inner side face (the one facing the tunnel centre).
    ctx.fillStyle = '#8a1414';
    if (x1 < 0) {
      poly(ctx, [f[1], b[1], b[2], f[2]]);
      ctx.fill();
    } else if (x0 > 0) {
      poly(ctx, [f[0], b[0], b[3], f[3]]);
      ctx.fill();
    }
    // Front face with hazard stripes.
    const fx = f[0].x;
    const fy = f[3].y;
    const fw = f[1].x - f[0].x;
    const fh = f[0].y - f[3].y;
    ctx.fillStyle = COL.barrier;
    ctx.fillRect(fx, fy, fw, fh);
    ctx.save();
    ctx.beginPath();
    ctx.rect(fx, fy, fw, fh);
    ctx.clip();
    ctx.fillStyle = COL.barrierDark;
    const sw = Math.max(4, fw / 6);
    for (let sx = fx - fh; sx < fx + fw + fh; sx += sw * 2) {
      ctx.beginPath();
      ctx.moveTo(sx, fy + fh);
      ctx.lineTo(sx + sw, fy + fh);
      ctx.lineTo(sx + sw + fh, fy);
      ctx.lineTo(sx + fh, fy);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
    ctx.strokeStyle = '#ffd0c8';
    ctx.lineWidth = Math.max(1, 3 * f[0].s);
    ctx.strokeRect(fx, fy, fw, fh);
    if (broken) {
      // Crack lines.
      ctx.strokeStyle = '#ffffff';
      ctx.beginPath();
      ctx.moveTo(fx + fw * 0.2, fy);
      ctx.lineTo(fx + fw * 0.55, fy + fh * 0.5);
      ctx.lineTo(fx + fw * 0.35, fy + fh);
      ctx.moveTo(fx + fw * 0.55, fy + fh * 0.5);
      ctx.lineTo(fx + fw, fy + fh * 0.3);
      ctx.stroke();
    }
  }

  // ── Ship ───────────────────────────────────────────────────────────
  private drawShip(ctx: CanvasRenderingContext2D, sim: Sim, reducedMotion: boolean): void {
    // While ghosting after a crash the ship dims (steady with reduced motion,
    // a 4 Hz flicker otherwise) but never disappears. The flicker starts at the
    // crash with the ship fully drawn.
    let alpha = 1;
    if (sim.invulnerable) {
      if (reducedMotion) alpha = 0.7;
      else alpha = Math.floor((sim.time - this.crashAt) * 12) % 3 === 2 ? 0.4 : 1;
    }
    const xs = this.shipX + this.bump;

    // Motion ghosts while switching lanes.
    for (let i = this.trail.length - 1; i >= 2; i -= 2) {
      const gx = this.trail[i] + this.bump;
      if (Math.abs(gx - xs) < 0.06) continue;
      this.drawShipShape(ctx, gx, 0.18 - i * 0.02, true);
    }
    this.drawShipShape(ctx, xs, alpha, false);
  }

  private drawShipShape(ctx: CanvasRenderingContext2D, x: number, alpha: number, ghost: boolean): void {
    const base = proj(x, 0, 0);
    const p = proj(x, 0.2, 0);
    ctx.save();
    ctx.globalAlpha = alpha;
    if (!ghost) {
      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      ctx.beginPath();
      ctx.ellipse(base.x, base.y, 70, 12, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.translate(p.x, p.y);
    ctx.rotate(this.tilt);

    // Engine glow.
    if (!ghost) {
      for (const ex of [-26, 26]) {
        const g = ctx.createRadialGradient(ex, 14, 0, ex, 14, 30);
        g.addColorStop(0, 'rgba(120,230,255,0.95)');
        g.addColorStop(1, 'rgba(120,230,255,0)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(ex, 14, 30, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    // Hull.
    ctx.fillStyle = ghost ? COL.laneHi : COL.ship;
    ctx.beginPath();
    ctx.moveTo(-66, 12);
    ctx.lineTo(-22, -30);
    ctx.lineTo(22, -30);
    ctx.lineTo(66, 12);
    ctx.lineTo(42, 24);
    ctx.lineTo(-42, 24);
    ctx.closePath();
    ctx.fill();
    if (!ghost) {
      ctx.fillStyle = '#9aa8d6';
      ctx.beginPath();
      ctx.moveTo(-42, 24);
      ctx.lineTo(42, 24);
      ctx.lineTo(30, 10);
      ctx.lineTo(-30, 10);
      ctx.closePath();
      ctx.fill();
      // Cockpit.
      ctx.fillStyle = '#1b2a66';
      ctx.beginPath();
      ctx.ellipse(0, -14, 17, 9, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = COL.laneHi;
      ctx.beginPath();
      ctx.ellipse(-4, -16, 7, 3, 0, 0, Math.PI * 2);
      ctx.fill();
      // Engines.
      ctx.fillStyle = '#ffffff';
      for (const ex of [-26, 26]) {
        ctx.beginPath();
        ctx.arc(ex, 15, 8, 0, Math.PI * 2);
        ctx.fill();
      }
      // Wing tip lights.
      ctx.fillStyle = '#ff5a7a';
      ctx.fillRect(-68, 8, 8, 5);
      ctx.fillStyle = '#5aff9a';
      ctx.fillRect(60, 8, 8, 5);
    }
    ctx.restore();
  }

  private drawParticles(ctx: CanvasRenderingContext2D): void {
    for (const p of this.particles) {
      ctx.globalAlpha = 1 - p.age / p.life;
      ctx.fillStyle = p.color;
      ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
    }
    ctx.globalAlpha = 1;
  }

  private drawPopups(ctx: CanvasRenderingContext2D): void {
    // Crash messages are drawn last, on top of any bonus text.
    const order = [...this.popups].sort((a, b) => Number(a.kind === 'crash') - Number(b.kind === 'crash'));
    for (const p of order) {
      const t = p.age / p.life;
      const pos = proj(p.x, 0.9, 0);
      const y = pos.y - 40 - easeOut(t) * 50 - p.shownRow * POPUP_ROW;
      ctx.globalAlpha = 1 - t * t;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = `900 40px ${FONT}`;
      ctx.lineWidth = 6;
      ctx.strokeStyle = 'rgba(0,0,0,0.75)';
      ctx.strokeText(p.text, pos.x, y);
      ctx.fillStyle = p.color;
      ctx.fillText(p.text, pos.x, y);
      ctx.font = `700 16px ${FONT}`;
      ctx.lineWidth = 4;
      ctx.strokeText(p.sub, pos.x, y + 28);
      ctx.fillStyle = COL.text;
      ctx.fillText(p.sub, pos.x, y + 28);
    }
    ctx.globalAlpha = 1;
  }

  // ── HUD ────────────────────────────────────────────────────────────
  private drawHud(ctx: CanvasRenderingContext2D, sim: Sim, view: View): void {
    const s = sim.stats;
    ctx.save();
    ctx.textBaseline = 'top';
    ctx.fillStyle = 'rgba(4,5,13,0.55)';
    roundRect(ctx, 14, 12, 190, 66, 10);
    ctx.fill();
    roundRect(ctx, W - 204, 12, 190, 66, 10);
    ctx.fill();

    ctx.textAlign = 'left';
    ctx.fillStyle = COL.dim;
    ctx.font = `700 13px ${FONT}`;
    ctx.fillText('SCORE', 28, 20);
    ctx.fillStyle = COL.text;
    ctx.font = `800 34px ${FONT}`;
    ctx.fillText(String(s.score), 28, 36);

    ctx.textAlign = 'right';
    ctx.fillStyle = COL.dim;
    ctx.font = `700 13px ${FONT}`;
    ctx.fillText(`STREAK  ·  BEST ${s.bestStreak}`, W - 28, 20);
    const pulse = 1 + this.streakPulse * 0.25;
    ctx.save();
    ctx.translate(W - 28, 54);
    ctx.scale(pulse, pulse);
    ctx.fillStyle = s.streak > 0 ? COL.core : COL.text;
    ctx.font = `800 34px ${FONT}`;
    ctx.textBaseline = 'middle';
    ctx.fillText(`x${s.streak}`, 0, 0);
    ctx.restore();

    // Course progress.
    const bw = 300;
    const bx = CX - bw / 2;
    const progress = clamp01(sim.time / RUN_DURATION);
    ctx.fillStyle = 'rgba(255,255,255,0.15)';
    roundRect(ctx, bx, 22, bw, 8, 4);
    ctx.fill();
    ctx.fillStyle = COL.laneHi;
    roundRect(ctx, bx, 22, Math.max(8, bw * progress), 8, 4);
    ctx.fill();
    ctx.textAlign = 'center';
    ctx.fillStyle = COL.dim;
    ctx.font = `700 13px ${FONT}`;
    const label = view.round > 1 ? `ROUND ${view.round} · LAST ROUND` : `ROUND ${view.round}`;
    ctx.fillText(label, CX, 38);
    ctx.restore();
  }

  /** `time` null = static (shown during the countdown, before the round moves). */
  private drawBanner(ctx: CanvasRenderingContext2D, b: Banner, time: number | null): void {
    const t = time === null ? 0.5 : (time - b.t) / b.dur;
    const a = Math.max(0, Math.min(1, t * 8, (1 - t) * 6));
    const color = b.tone === 'barrier' ? COL.barrier : b.tone === 'risk' ? COL.big : b.tone === 'core' ? COL.core : COL.text;
    ctx.save();
    ctx.globalAlpha = a;
    ctx.fillStyle = 'rgba(4,5,13,0.7)';
    roundRect(ctx, CX - 300, 92, 600, 74, 12);
    ctx.fill();
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = color;
    ctx.font = `900 30px ${FONT}`;
    ctx.fillText(b.title, CX, 118);
    ctx.fillStyle = COL.text;
    ctx.font = `600 16px ${FONT}`;
    ctx.fillText(b.sub, CX, 149);
    ctx.restore();
  }

  private drawCountdown(ctx: CanvasRenderingContext2D, view: View): void {
    const step = COUNTDOWN / 3;
    const n = Math.ceil(view.countdown / step);
    const frac = (Math.max(0, view.countdown) % step) / step;
    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    if (view.resuming) {
      ctx.fillStyle = COL.laneHi;
      ctx.font = `800 22px ${FONT}`;
      ctx.fillText('GET READY · THE ROUND CONTINUES', CX, 128);
    }
    ctx.globalAlpha = 0.4 + frac * 0.6;
    ctx.fillStyle = COL.text;
    ctx.font = `900 ${90 + (1 - frac) * 30}px ${FONT}`;
    ctx.fillText(String(Math.max(1, n)), CX, 200);
    ctx.globalAlpha = 1;
    drawKeyHint(ctx, CX, 300);
    ctx.restore();
  }

  private drawFinish(ctx: CanvasRenderingContext2D, view: View): void {
    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.globalAlpha = Math.min(1, view.screenTime * 4);
    ctx.fillStyle = COL.text;
    ctx.font = `900 72px ${FONT}`;
    ctx.fillText('FINISH', CX, 210);
    ctx.restore();
  }

  // ── Screens ────────────────────────────────────────────────────────
  private dim(ctx: CanvasRenderingContext2D, a: number): void {
    ctx.fillStyle = `rgba(4,5,13,${a})`;
    ctx.fillRect(0, 0, W, H);
  }

  private drawTitle(ctx: CanvasRenderingContext2D, view: View): void {
    this.dim(ctx, 0.55);
    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = COL.text;
    ctx.font = `900 64px ${FONT}`;
    ctx.fillText('ONE MORE ROUND', CX, 112);
    ctx.fillStyle = COL.dim;
    ctx.font = `600 18px ${FONT}`;
    ctx.fillText('A 30-second run through the tunnel', CX, 158);

    drawKeyHint(ctx, CX, 226);

    // Legend.
    const items: [string, string, string][] = [
      ['core', `Core  +${CORE_POINTS}`, 'Builds your streak'],
      ['big', `High-value core  +${BIG_CORE_POINTS}`, 'Often guarded'],
      ['barrier', 'Barrier', 'Crash = streak reset'],
    ];
    items.forEach(([kind, label, sub], i) => {
      const x = CX - 280 + i * 280;
      const y = 318;
      if (kind === 'barrier') {
        ctx.fillStyle = COL.barrier;
        ctx.fillRect(x - 20, y - 18, 40, 34);
        ctx.strokeStyle = '#ffd0c8';
        ctx.lineWidth = 2;
        ctx.strokeRect(x - 20, y - 18, 40, 34);
      } else {
        drawGem(ctx, x, y, kind === 'big' ? 20 : 15, kind === 'big' ? COL.big : COL.core, kind === 'big');
      }
      ctx.fillStyle = COL.text;
      ctx.font = `700 17px ${FONT}`;
      ctx.fillText(label, x, y + 40);
      ctx.fillStyle = COL.dim;
      ctx.font = `500 14px ${FONT}`;
      ctx.fillText(sub, x, y + 62);
    });

    drawPrompt(ctx, view, view.touch ? 'Tap to play' : 'Press ENTER or SPACE to play', 460);
    ctx.restore();
  }

  private drawPaused(ctx: CanvasRenderingContext2D, view: View): void {
    this.dim(ctx, 0.75);
    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = COL.text;
    ctx.font = `900 64px ${FONT}`;
    ctx.fillText('PAUSED', CX, 196);
    ctx.fillStyle = COL.dim;
    ctx.font = `600 18px ${FONT}`;
    ctx.fillText('The game window lost focus, so the round is frozen.', CX, 246);
    drawPrompt(ctx, view, view.touch ? 'Tap to resume' : 'Press ENTER or SPACE to resume', 320);
    ctx.fillStyle = COL.dim;
    ctx.font = `500 15px ${FONT}`;
    ctx.fillText('3 · 2 · 1, then the round continues where it stopped', CX, 372);
    ctx.restore();
  }

  private drawIdleWarning(ctx: CanvasRenderingContext2D, view: View): void {
    const left = Math.max(1, Math.ceil(view.idleLeft ?? 0));
    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const y = view.screen === 'paused' ? 420 : 26;
    ctx.fillStyle = 'rgba(4,5,13,0.75)';
    roundRect(ctx, CX - 210, y - 16, 420, 32, 16);
    ctx.fill();
    ctx.fillStyle = COL.warn;
    ctx.font = `700 16px ${FONT}`;
    ctx.fillText(`No input · back to the start in ${left} s`, CX, y + 1);
    ctx.restore();
  }

  /** Speaker icon: dim on menus, highlighted (with a cross) whenever sound is off. */
  private drawSoundIcon(ctx: CanvasRenderingContext2D, view: View): void {
    const menus = view.screen !== 'playing' && view.screen !== 'countdown' && view.screen !== 'finishing';
    if (!view.muted && !menus) return;
    const b = MUTE_BUTTON;
    const x = b.x + 8;
    const y = b.y + b.h / 2;
    ctx.save();
    ctx.globalAlpha = view.muted ? 0.95 : 0.55;
    ctx.fillStyle = 'rgba(4,5,13,0.6)';
    roundRect(ctx, b.x, b.y, b.w, b.h, 8);
    ctx.fill();
    ctx.fillStyle = COL.text;
    ctx.strokeStyle = COL.text;
    ctx.lineWidth = 2;
    // Speaker body.
    ctx.beginPath();
    ctx.moveTo(x, y - 5);
    ctx.lineTo(x + 6, y - 5);
    ctx.lineTo(x + 13, y - 11);
    ctx.lineTo(x + 13, y + 11);
    ctx.lineTo(x + 6, y + 5);
    ctx.lineTo(x, y + 5);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    if (view.muted) {
      ctx.strokeStyle = COL.barrier;
      ctx.lineWidth = 3;
      ctx.moveTo(x + 18, y - 7);
      ctx.lineTo(x + 28, y + 7);
      ctx.moveTo(x + 28, y - 7);
      ctx.lineTo(x + 18, y + 7);
    } else {
      ctx.arc(x + 14, y, 7, -0.9, 0.9);
      ctx.moveTo(x + 14 + 12 * Math.cos(-0.9), y + 12 * Math.sin(-0.9));
      ctx.arc(x + 14, y, 12, -0.9, 0.9);
    }
    ctx.stroke();
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    ctx.font = `700 13px ${FONT}`;
    ctx.fillStyle = view.muted ? COL.text : COL.dim;
    ctx.fillText(view.muted ? (view.touch ? 'SOUND OFF' : 'SOUND OFF · M') : view.touch ? '' : 'M', b.x - 8, y);
    ctx.restore();
  }

  private drawResults(ctx: CanvasRenderingContext2D, view: View): void {
    this.dim(ctx, 0.72);
    const s = view.results[view.results.length - 1];
    if (!s) return;
    const a = Math.min(1, view.screenTime * 3);
    ctx.save();
    ctx.globalAlpha = a;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = COL.dim;
    ctx.font = `800 20px ${FONT}`;
    ctx.fillText(`ROUND ${view.results.length} COMPLETE`, CX, 64);
    ctx.fillStyle = COL.text;
    ctx.font = `700 16px ${FONT}`;
    ctx.fillText('SCORE', CX, 112);
    ctx.font = `900 72px ${FONT}`;
    ctx.fillText(String(s.score), CX, 160);

    const canRematch = view.round < view.maxRounds;
    const prev = view.results.length > 1 ? view.results[view.results.length - 2] : undefined;
    if (prev) {
      const diff = s.score - prev.score;
      ctx.font = `700 17px ${FONT}`;
      ctx.fillStyle = diff >= 0 ? COL.core : COL.dim;
      ctx.fillText(`Round 1: ${prev.score}   →   Round 2: ${s.score}  (${diff >= 0 ? '+' : ''}${diff})`, CX, 208);
    } else if (canRematch) {
      ctx.font = `800 20px ${FONT}`;
      ctx.fillStyle = COL.laneHi;
      ctx.fillText(`Same tunnel. Beat ${s.score}?`, CX, 208);
    }

    // Normal and +500 cores are counted separately (no double counting).
    const rows: [string, string][] = [
      ['Best streak', String(s.bestStreak)],
      ['Cores', `${s.cores - s.bigCores} / ${s.coresTotal - s.bigCoresTotal}`],
      [`+${BIG_CORE_POINTS} cores`, `${s.bigCores} / ${s.bigCoresTotal}`],
      ['Crashes', String(s.crashes)],
    ];
    rows.forEach(([k, v], i) => {
      const y = 250 + i * 34;
      ctx.textAlign = 'right';
      ctx.fillStyle = COL.dim;
      ctx.font = `600 20px ${FONT}`;
      ctx.fillText(k, CX - 14, y);
      ctx.textAlign = 'left';
      ctx.fillStyle = i === 0 ? COL.core : COL.text;
      ctx.font = `800 22px ${FONT}`;
      ctx.fillText(v, CX + 14, y);
    });

    const buttons = resultButtons(canRematch);
    buttons.forEach((b, i) => drawButton(ctx, b, i === view.selected, view.inputLocked));
    // Visible lock: a bar fills under the buttons while they ignore input.
    if (view.inputLocked) {
      const x0 = buttons[0].x;
      const x1 = buttons[buttons.length - 1].x + buttons[buttons.length - 1].w;
      const y = buttons[0].y + buttons[0].h + 8;
      ctx.fillStyle = 'rgba(255,255,255,0.12)';
      roundRect(ctx, x0, y, x1 - x0, 4, 2);
      ctx.fill();
      ctx.fillStyle = COL.dim;
      roundRect(ctx, x0, y, Math.max(4, (x1 - x0) * view.lockProgress), 4, 2);
      ctx.fill();
    }
    ctx.textAlign = 'center';
    ctx.fillStyle = COL.dim;
    ctx.font = `500 14px ${FONT}`;
    const hint =
      buttons.length > 1
        ? view.touch
          ? 'Tap a button'
          : '← → choose · ENTER confirm'
        : view.touch
          ? 'This was your last round · tap Finish'
          : 'This was your last round · ENTER to finish';
    ctx.fillText(hint, CX, 502);
    ctx.restore();
  }

  private drawClosing(ctx: CanvasRenderingContext2D, view: View): void {
    this.dim(ctx, 0.7);
    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = COL.text;
    ctx.font = `900 50px ${FONT}`;
    ctx.fillText('THANKS FOR PLAYING', CX, 150);
    const last = view.results[view.results.length - 1];
    if (last) {
      ctx.fillStyle = COL.dim;
      ctx.font = `600 18px ${FONT}`;
      const rounds = view.results.length === 1 ? '1 round' : `${view.results.length} rounds`;
      ctx.fillText(`You played ${rounds} · final score ${last.score}`, CX, 205);
    }
    ctx.fillStyle = COL.dim;
    ctx.font = `italic 500 15px ${FONT}`;
    ctx.fillText('[ Provisional ending: the closing content arrives in the next iteration ]', CX, 270);
    drawPrompt(ctx, view, view.touch ? 'Next player: tap to continue' : 'Next player: press ENTER or SPACE', 400);
    ctx.restore();
  }
}

/**
 * Call to action on a pill. Pulses gently between 0.7 and 1.0 opacity (steady
 * with reduced motion); stays faint while the screen still ignores input.
 */
function drawPrompt(ctx: CanvasRenderingContext2D, view: View, text: string, y: number): void {
  ctx.save();
  const pulse = view.reducedMotion ? 1 : 0.85 + 0.15 * Math.sin(view.screenTime * 4);
  ctx.globalAlpha = view.inputLocked ? 0.35 : pulse;
  ctx.font = `800 24px ${FONT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const w = ctx.measureText(text).width + 56;
  roundRect(ctx, CX - w / 2, y - 26, w, 52, 26);
  ctx.fillStyle = 'rgba(71,231,255,0.12)';
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = COL.laneHi;
  ctx.stroke();
  ctx.fillStyle = COL.laneHi;
  ctx.fillText(text, CX, y + 1);
  ctx.restore();
}

// ── Small drawing helpers ────────────────────────────────────────────
function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function drawButton(ctx: CanvasRenderingContext2D, b: Button, focused: boolean, locked: boolean): void {
  ctx.save();
  ctx.globalAlpha *= locked ? 0.5 : 1;
  roundRect(ctx, b.x, b.y, b.w, b.h, 12);
  ctx.fillStyle = focused ? COL.laneHi : 'rgba(255,255,255,0.08)';
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = focused ? '#ffffff' : 'rgba(255,255,255,0.35)';
  ctx.stroke();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = focused ? COL.bg : COL.text;
  ctx.font = `800 22px ${FONT}`;
  ctx.fillText(b.label, b.x + b.w / 2, b.y + b.h / 2 + 1);
  ctx.restore();
}

function drawKey(ctx: CanvasRenderingContext2D, x: number, y: number, label: string): void {
  roundRect(ctx, x - 26, y - 24, 52, 48, 8);
  ctx.fillStyle = 'rgba(255,255,255,0.1)';
  ctx.fill();
  ctx.strokeStyle = COL.text;
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.fillStyle = COL.text;
  ctx.font = `800 26px ${FONT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, x, y + 1);
}

function drawKeyHint(ctx: CanvasRenderingContext2D, x: number, y: number): void {
  drawKey(ctx, x - 150, y, '←');
  drawKey(ctx, x + 150, y, '→');
  ctx.fillStyle = COL.text;
  ctx.font = `700 19px ${FONT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('One press = one lane', x, y - 10);
  ctx.fillStyle = COL.dim;
  ctx.font = `500 15px ${FONT}`;
  ctx.fillText('(touch: tap left / right half)', x, y + 14);
}

function drawGem(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, color: string, star: boolean): void {
  ctx.fillStyle = color;
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = 2;
  ctx.beginPath();
  const n = star ? 16 : 4;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 - Math.PI / 2;
    const rr = star ? (i % 2 === 0 ? r : r * 0.55) : r;
    const px = x + Math.cos(a) * rr * (star ? 1 : 0.8);
    const py = y + Math.sin(a) * rr;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
}
