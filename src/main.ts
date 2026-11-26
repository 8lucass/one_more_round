// App shell: screens, input, fixed-step loop.
//
// title → countdown → playing → finishing → results
//   results: "One more round" (once) → countdown (same course, clock +30 min)
//            "Finish" → closing → (next player) title
//   closing: summary → 3 cards → end page, one page per ENTER / → / tap
//            (← goes back); ENTER on the end page → title for the next player
//   playing/countdown: window loses focus or tab hidden → paused
//            → ENTER / tap → countdown (3-2-1) → playing, same sim time
//   Escape (any screen), or IDLE_RESET s without input in results, closing
//   or paused → title for the next player (round 1, no results).

import { Sfx } from './audio.ts';
import {
  COUNTDOWN,
  FINISH_HOLD,
  IDLE_RESET,
  IDLE_WARNING,
  INPUT_LOCK,
  MAX_ROUNDS,
  RESULTS_LOCK,
  SIM_DT,
} from './config.ts';
import { DodgeTracker } from './feedback.ts';
import { H, MUTE_BUTTON, Renderer, resultButtons, W, type Screen, type View } from './render.ts';
import { Sim, type SimEvent, type Stats } from './sim.ts';
import { clockAt, closingFor, closingPageCount, type Closing } from './story.ts';
import { bannerAt, bannersFor, type Banner } from './track.ts';

const canvas = document.getElementById('game') as HTMLCanvasElement;
const ctx = canvas.getContext('2d')!;
const renderer = new Renderer();
const sfx = new Sfx();
const dodges = new DodgeTracker();

let screen: Screen = 'title';
let screenTime = 0;
let round = 1;
let sim = new Sim();
let results: Stats[] = [];
let selected = 0;
let countdown = COUNTDOWN;
let countdownTick = 0; // last "3, 2, 1" number announced
let acc = 0;
let lastInput = performance.now();
let pauseReason: 'blur' | 'hidden' | null = null;
let pauses = 0;
let closing: Closing | null = null;
let closingPage = 0;

const media = (q: string) => (typeof window.matchMedia === 'function' ? window.matchMedia(q) : null);
const reducedMotionQuery = media('(prefers-reduced-motion: reduce)');
// Touch-first device → "Tap to play". Switches with the last input actually used.
let touchUI = !!media('(hover: none) and (pointer: coarse)')?.matches;

function go(next: Screen): void {
  screen = next;
  screenTime = 0;
  lastInput = performance.now();
}

function lockFor(s: Screen): number {
  if (s === 'results') return RESULTS_LOCK;
  if (s === 'title' || s === 'closing' || s === 'paused') return INPUT_LOCK;
  return 0;
}

const locked = () => screenTime < lockFor(screen);

function startCountdown(): void {
  countdown = COUNTDOWN;
  countdownTick = 0;
  acc = 0;
  go('countdown');
}

function startRound(): void {
  sim = new Sim();
  renderer.reset(sim.lane);
  dodges.reset();
  startCountdown();
}

function newPlayer(): void {
  round = 1;
  results = [];
  selected = 0;
  pauseReason = null;
  closing = null;
  closingPage = 0;
  sim = new Sim();
  renderer.reset(sim.lane);
  dodges.reset();
  go('title');
}

/** Freeze the round when nobody can be playing it (focus lost or tab hidden). */
function pause(reason: 'blur' | 'hidden'): void {
  if (screen !== 'playing' && screen !== 'countdown') return;
  pauseReason = reason;
  pauses++;
  go('paused');
}

function confirmResults(): void {
  const buttons = resultButtons(round < MAX_ROUNDS);
  const b = buttons[Math.min(selected, buttons.length - 1)];
  sfx.play('confirm');
  if (b.id === 'rematch') {
    round++; // the fictional clock moves 30 min later only here
    startRound();
  } else {
    closing = closingFor(results);
    closingPage = 0;
    go('closing');
  }
}

/** Closing pages: forward (ENTER, →, tap) or back (←). Each new page re-arms the input lock. */
function turnPage(dir: -1 | 1): void {
  if (!closing) return;
  const next = closingPage + dir;
  if (next < 0 || next >= closingPageCount(closing)) return;
  closingPage = next;
  sfx.play(dir > 0 ? 'confirm' : 'menuMove');
  go('closing');
}

function confirm(): void {
  if (locked()) return;
  if (screen === 'title') {
    sfx.play('confirm');
    startRound();
  } else if (screen === 'results') confirmResults();
  else if (screen === 'closing') {
    if (closing && closingPage < closingPageCount(closing) - 1) turnPage(1);
    else {
      sfx.play('confirm');
      newPlayer();
    }
  } else if (screen === 'paused') {
    sfx.play('confirm');
    startCountdown(); // 3-2-1, then the round continues from the same sim time
  }
}

/** Route freshly drained sim events to the visual and the audio feedback. */
function feed(events: SimEvent[]): void {
  if (events.length === 0) return;
  const close = dodges.scan(events, sim.time);
  renderer.handleEvents(events, sim.time, close);
  sfx.handleEvents(events, close);
}

function steer(dir: -1 | 1): void {
  if (screen === 'playing') {
    sim.move(dir);
    // Feedback for the press is shown (and heard) on the very next frame.
    feed(sim.drainEvents());
  } else if (screen === 'results' && !locked()) {
    const n = resultButtons(round < MAX_ROUNDS).length;
    const next = Math.max(0, Math.min(n - 1, selected + dir));
    if (next !== selected) sfx.play('menuMove');
    selected = next;
  } else if (screen === 'closing' && !locked() && closing) {
    // → never leaves the last page: only ENTER / tap starts the next player.
    if (dir < 0 || closingPage < closingPageCount(closing) - 1) turnPage(dir);
  }
}

window.addEventListener('keydown', (e) => {
  const k = e.key;
  lastInput = performance.now();
  if (k === 'Escape' || k === 'Esc') {
    e.preventDefault();
    if (!e.repeat) newPlayer();
    return;
  }
  if (!e.repeat) {
    touchUI = false;
    sfx.unlock(); // a key press is a user gesture: audio may start now
  }
  if (k === 'ArrowLeft' || k === 'a' || k === 'A') {
    e.preventDefault();
    if (!e.repeat) steer(-1); // one press = one lane; holding does nothing
  } else if (k === 'ArrowRight' || k === 'd' || k === 'D') {
    e.preventDefault();
    if (!e.repeat) steer(1);
  } else if (k === 'Enter' || k === ' ' || k === 'Spacebar') {
    e.preventDefault();
    if (!e.repeat) confirm(); // holding ENTER never confirms twice
  } else if (k === 'm' || k === 'M') {
    if (!e.repeat) sfx.toggleMute();
  }
});

// Pointer / touch: menus use the drawn buttons, gameplay uses screen halves.
canvas.addEventListener('pointerdown', (e) => {
  lastInput = performance.now();
  touchUI = e.pointerType !== 'mouse';
  sfx.unlock();
  const rect = canvas.getBoundingClientRect();
  const { scale, ox, oy } = layout();
  const dpr = canvas.width / rect.width;
  const x = ((e.clientX - rect.left) * dpr - ox) / scale;
  const y = ((e.clientY - rect.top) * dpr - oy) / scale;
  const inside = (b: { x: number; y: number; w: number; h: number }) => x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h;
  if (screen === 'playing') {
    steer(x < W / 2 ? -1 : 1);
  } else if (inside(MUTE_BUTTON)) {
    sfx.toggleMute(); // touch has no M key
  } else if (screen === 'results') {
    if (locked()) return;
    const buttons = resultButtons(round < MAX_ROUNDS);
    const i = buttons.findIndex(inside);
    if (i >= 0) {
      selected = i;
      confirmResults();
    }
  } else {
    confirm();
  }
});

window.addEventListener('blur', () => pause('blur'));
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') pause('hidden');
});

// ── Canvas sizing (letterboxed 16:9, crisp on HiDPI) ─────────────────
function resize(): void {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.round(window.innerWidth * dpr);
  canvas.height = Math.round(window.innerHeight * dpr);
  canvas.style.width = `${window.innerWidth}px`;
  canvas.style.height = `${window.innerHeight}px`;
}

function layout(): { scale: number; ox: number; oy: number } {
  const scale = Math.min(canvas.width / W, canvas.height / H);
  return { scale, ox: (canvas.width - W * scale) / 2, oy: (canvas.height - H * scale) / 2 };
}

window.addEventListener('resize', resize);
resize();

// ── Main loop ────────────────────────────────────────────────────────
const idleScreen = () => screen === 'results' || screen === 'closing' || screen === 'paused';
/** Real seconds since the last input (counts while the tab was hidden, too). */
const idleFor = () => (performance.now() - lastInput) / 1000;

function update(dt: number): void {
  screenTime += dt;
  if (screen === 'countdown') {
    countdown -= dt;
    const n = Math.max(1, Math.ceil(countdown / (COUNTDOWN / 3)));
    if (countdown > 0 && n !== countdownTick) {
      countdownTick = n;
      sfx.play('tick');
    }
    if (countdown <= 0) {
      sfx.play('go');
      go('playing');
    }
  } else if (screen === 'playing') {
    acc += dt;
    while (acc >= SIM_DT && !sim.finished) {
      sim.step(SIM_DT);
      acc -= SIM_DT;
    }
    feed(sim.drainEvents());
    if (sim.finished) {
      results.push({ ...sim.stats });
      go('finishing');
    }
  } else if (screen === 'finishing') {
    if (screenTime >= FINISH_HOLD) {
      selected = 0;
      go('results');
    }
  }
  if (idleScreen() && idleFor() >= IDLE_RESET) newPlayer();
  renderer.update(dt, sim.lane);
}

function currentBanner(): Banner | undefined {
  const banners = bannersFor(round, results[0]?.score);
  if (screen === 'playing') return bannerAt(banners, sim.time);
  // The rematch target is already on screen during its first countdown.
  if (screen === 'countdown' && round > 1 && sim.time === 0) return banners[0];
  return undefined;
}

function view(): View {
  const lock = lockFor(screen);
  return {
    screen,
    screenTime,
    round,
    maxRounds: MAX_ROUNDS,
    countdown,
    resuming: screen === 'countdown' && sim.time > 0,
    results,
    selected,
    inputLocked: locked(),
    lockProgress: lock > 0 ? Math.min(1, screenTime / lock) : 1,
    banner: currentBanner(),
    idleLeft: idleScreen() ? Math.max(0, IDLE_RESET - idleFor()) : null,
    idleWarning: IDLE_WARNING,
    touch: touchUI,
    reducedMotion: !!reducedMotionQuery?.matches,
    muted: sfx.muted,
    clock: clockAt(round),
    nextClock: clockAt(round + 1),
    closing,
    closingPage,
  };
}

let last = performance.now();
function frame(now: number): void {
  const dt = Math.min(0.05, Math.max(0, (now - last) / 1000));
  last = now;
  update(dt);
  const { scale, ox, oy } = layout();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.setTransform(scale, 0, 0, scale, ox, oy);
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, W, H);
  ctx.clip();
  renderer.draw(ctx, sim, view());
  ctx.restore();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// Read-only hook for automated browser tests and debugging in the console.
(window as unknown as { omr: unknown }).omr = {
  snapshot: () => ({
    screen,
    round,
    time: sim.time,
    lane: sim.lane,
    stats: { ...sim.stats },
    results: results.map((r) => ({ ...r })),
    selected,
    buttons: screen === 'results' ? resultButtons(round < MAX_ROUNDS).map((b) => b.id) : [],
    clock: clockAt(round),
    pendingBonus: sim.pendingBonus,
    closing:
      screen === 'closing' && closing
        ? {
            page: closingPage,
            pages: closingPageCount(closing),
            card: closingPage === 0 ? 'summary' : closing.cards[closingPage - 1]?.tag ?? 'end',
            finalClock: closing.finalClock,
            headline: closing.headline,
            you: closing.cards[closingPage - 1]?.you ?? null,
          }
        : null,
    locked: locked(),
    screenTime,
    banner: currentBanner()?.title ?? null,
    idleLeft: idleScreen() ? Math.max(0, IDLE_RESET - idleFor()) : null,
    pauseReason,
    pauses,
    muted: sfx.muted,
    audio: sfx.state,
    sounds: { ...sfx.counts },
    touch: touchUI,
    reducedMotion: !!reducedMotionQuery?.matches,
    shake: renderer.shakeAmp,
  }),
};
