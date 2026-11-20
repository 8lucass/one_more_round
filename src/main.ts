// App shell: screens, input, fixed-step loop.
//
// title → countdown → playing → finishing → results
//   results: "One more round" (once) → countdown (same course)
//            "Finish" → closing → (next player) title

import { COUNTDOWN, FINISH_HOLD, MAX_ROUNDS, SIM_DT } from './config.ts';
import { H, Renderer, resultButtons, W, type Screen, type View } from './render.ts';
import { Sim, type Stats } from './sim.ts';

const INPUT_LOCK = 0.6; // seconds menus ignore input after appearing (anti-mash)

const canvas = document.getElementById('game') as HTMLCanvasElement;
const ctx = canvas.getContext('2d')!;
const renderer = new Renderer();

let screen: Screen = 'title';
let screenTime = 0;
let round = 1;
let sim = new Sim();
let results: Stats[] = [];
let selected = 0;
let countdown = COUNTDOWN;
let acc = 0;

function go(next: Screen): void {
  screen = next;
  screenTime = 0;
}

function startRound(): void {
  sim = new Sim();
  renderer.reset(sim.lane);
  countdown = COUNTDOWN;
  acc = 0;
  go('countdown');
}

function newPlayer(): void {
  round = 1;
  results = [];
  go('title');
}

const locked = () => (screen === 'title' || screen === 'results' || screen === 'closing') && screenTime < INPUT_LOCK;

function confirmResults(): void {
  const buttons = resultButtons(round < MAX_ROUNDS);
  const b = buttons[Math.min(selected, buttons.length - 1)];
  if (b.id === 'rematch') {
    round++;
    startRound();
  } else {
    go('closing');
  }
}

function confirm(): void {
  if (locked()) return;
  if (screen === 'title') startRound();
  else if (screen === 'results') confirmResults();
  else if (screen === 'closing') newPlayer();
}

function steer(dir: -1 | 1): void {
  if (screen === 'playing') {
    sim.move(dir);
    // Feedback for the press is shown on the very next frame.
    renderer.handleEvents(sim.drainEvents());
  } else if (screen === 'results' && !locked()) {
    const n = resultButtons(round < MAX_ROUNDS).length;
    selected = Math.max(0, Math.min(n - 1, selected + dir));
  }
}

window.addEventListener('keydown', (e) => {
  const k = e.key;
  if (k === 'ArrowLeft' || k === 'a' || k === 'A') {
    e.preventDefault();
    if (!e.repeat) steer(-1); // one press = one lane; holding does nothing
  } else if (k === 'ArrowRight' || k === 'd' || k === 'D') {
    e.preventDefault();
    if (!e.repeat) steer(1);
  } else if (k === 'Enter' || k === ' ' || k === 'Spacebar') {
    e.preventDefault();
    if (!e.repeat) confirm();
  }
});

// Pointer / touch: menus use the drawn buttons, gameplay uses screen halves.
canvas.addEventListener('pointerdown', (e) => {
  const rect = canvas.getBoundingClientRect();
  const { scale, ox, oy } = layout();
  const dpr = canvas.width / rect.width;
  const x = ((e.clientX - rect.left) * dpr - ox) / scale;
  const y = ((e.clientY - rect.top) * dpr - oy) / scale;
  if (screen === 'playing') {
    steer(x < W / 2 ? -1 : 1);
  } else if (screen === 'results') {
    if (locked()) return;
    const buttons = resultButtons(round < MAX_ROUNDS);
    const i = buttons.findIndex((b) => x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h);
    if (i >= 0) {
      selected = i;
      confirmResults();
    }
  } else {
    confirm();
  }
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
function update(dt: number): void {
  screenTime += dt;
  if (screen === 'countdown') {
    countdown -= dt;
    if (countdown <= 0) go('playing');
  } else if (screen === 'playing') {
    acc += dt;
    while (acc >= SIM_DT && !sim.finished) {
      sim.step(SIM_DT);
      acc -= SIM_DT;
    }
    renderer.handleEvents(sim.drainEvents());
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
  renderer.update(dt, sim.lane);
}

function view(): View {
  return {
    screen,
    screenTime,
    round,
    maxRounds: MAX_ROUNDS,
    countdown,
    results,
    selected,
    inputLocked: locked(),
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
    locked: locked(),
  }),
};
