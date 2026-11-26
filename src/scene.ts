// Bedroom scene (presentation only), direction A "10:30 PM"
// (docs/auditoria-v0.1.0.md §3.1): the night-time room around the monitor the
// game is played on. Canvas 2D shapes and gradients only: no images, no fonts
// to load, so it works offline from file://.
//
// Two shots share one idea, the game lives inside the monitor's screen:
//   wide → title: window with the moon, desk, monitor, alarm clock, note.
//   desk → results and closing: close-up of the monitor, the clock in front.
// Each shot is drawn in its own 960×540 space. `roomTransform` maps that space
// so the shot's screen lands on any rect: the renderer zooms the camera into
// (or out of) the screen by moving that rect towards the full canvas.

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export type Shot = 'wide' | 'desk';

/** Where the monitor's screen sits in each shot (16:9, like the game). */
export const SCREEN: Record<Shot, Rect> = {
  wide: { x: 270, y: 132, w: 420, h: 236.25 },
  desk: { x: 80, y: 14, w: 800, h: 450 },
};

export const FULL: Rect = { x: 0, y: 0, w: 960, h: 540 };

/** Night blue and cream, with amber and green accents. Red stays reserved for barriers. */
export const PAL = {
  night: '#060818',
  cream: '#f3e9d2',
  amber: '#ffb84d',
  led: '#7dffa8',
  ink: '#3b2a10',
  paper: '#f4dd8f',
};

export interface RoomState {
  /** What the alarm clock shows, e.g. "10:30 PM". */
  clock: string;
  /** 0 = the room at 10:30 PM; 1 = one notch darker (after "One more round"). */
  dim: number;
  /** 0..1 highlight on the clock right after it jumped. */
  clockFlash: number;
}

export const lerpRect = (a: Rect, b: Rect, k: number): Rect => ({
  x: a.x + (b.x - a.x) * k,
  y: a.y + (b.y - a.y) * k,
  w: a.w + (b.w - a.w) * k,
  h: a.h + (b.h - a.h) * k,
});

/** Map the shot's own space so its screen covers `rect`. */
export function roomTransform(ctx: CanvasRenderingContext2D, shot: Shot, rect: Rect): void {
  const s = SCREEN[shot];
  const k = rect.w / s.w;
  ctx.translate(rect.x - s.x * k, rect.y - s.y * k);
  ctx.scale(k, k);
}

// ── Colour helpers ───────────────────────────────────────────────────
function rgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** Darken a colour: the room light drops one notch after a rematch. */
function shade(hex: string, dim: number, amount = 0.32): string {
  const f = 1 - amount * dim;
  const [r, g, b] = rgb(hex);
  return `rgb(${Math.round(r * f)},${Math.round(g * f)},${Math.round(b * f)})`;
}

function rr(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// ── Seven-segment LED clock ──────────────────────────────────────────
const SEGMENTS: Record<string, string> = {
  '0': 'abcdef',
  '1': 'bc',
  '2': 'abged',
  '3': 'abgcd',
  '4': 'fgbc',
  '5': 'afgcd',
  '6': 'afgedc',
  '7': 'abc',
  '8': 'abcdefg',
  '9': 'abcdfg',
};

function segmentRects(x: number, y: number, h: number): Record<string, [number, number, number, number]> {
  const w = h * 0.52;
  const t = h * 0.13;
  const half = h / 2;
  const v = half - t * 1.5;
  return {
    a: [x + t, y, w - 2 * t, t],
    b: [x + w - t, y + t, t, v],
    c: [x + w - t, y + half + t / 2, t, v],
    d: [x + t, y + h - t, w - 2 * t, t],
    e: [x, y + half + t / 2, t, v],
    f: [x, y + t, t, v],
    g: [x + t, y + half - t / 2, w - 2 * t, t],
  };
}

/**
 * "10:30 PM" as LED digits, centred on (cx, cy). `h` = digit height.
 * Unlit segments glow faintly, like a real alarm clock.
 */
export function drawLedClock(ctx: CanvasRenderingContext2D, cx: number, cy: number, h: number, text: string, color = PAL.led): void {
  const m = /^(\d{1,2}):(\d{2})\s*(AM|PM)?$/.exec(text.trim());
  if (!m) return;
  const digits = m[1].padStart(2, ' ') + m[2];
  const w = h * 0.52;
  const gap = h * 0.16;
  const colon = h * 0.26;
  const label = m[3] ?? '';
  const labelSize = Math.max(8, h * 0.4);
  ctx.save();
  ctx.font = `800 ${labelSize}px system-ui, -apple-system, "Segoe UI", sans-serif`;
  const labelW = label ? ctx.measureText(label).width + gap : 0;
  const total = 4 * w + 3 * gap + colon + gap + labelW;
  let x = cx - total / 2;
  const y = cy - h / 2;
  const [r, g, b] = rgb(color);
  const drawDigit = (ch: string) => {
    const on = SEGMENTS[ch] ?? '';
    const rects = segmentRects(x, y, h);
    for (const [id, s] of Object.entries(rects)) {
      ctx.fillStyle = on.includes(id) ? color : `rgba(${r},${g},${b},0.07)`;
      ctx.fillRect(s[0], s[1], s[2], s[3]);
    }
    x += w + gap;
  };
  drawDigit(digits[0]);
  drawDigit(digits[1]);
  ctx.fillStyle = color;
  const dot = h * 0.12;
  ctx.fillRect(x + (colon - dot) / 2, y + h * 0.28, dot, dot);
  ctx.fillRect(x + (colon - dot) / 2, y + h * 0.64, dot, dot);
  x += colon + gap;
  drawDigit(digits[2]);
  drawDigit(digits[3]);
  if (label) {
    ctx.fillStyle = color;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(label, x, y + h);
  }
  ctx.restore();
}

// ── Props ────────────────────────────────────────────────────────────
function drawWindow(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  moon: { x: number; y: number; r: number },
  dim: number,
): void {
  const frame = 8;
  ctx.fillStyle = shade('#1f2757', dim);
  ctx.fillRect(x, y, w, h);
  const gx = x + frame;
  const gy = y + frame;
  const gw = w - frame * 2;
  const gh = h - frame * 2;
  const glass = ctx.createLinearGradient(0, gy, 0, gy + gh);
  glass.addColorStop(0, '#1d2f74');
  glass.addColorStop(1, '#0b1440');
  ctx.save();
  ctx.beginPath();
  ctx.rect(gx, gy, gw, gh);
  ctx.clip();
  ctx.fillStyle = glass;
  ctx.fillRect(gx, gy, gw, gh);
  // Stars (fixed, so the sky never flickers).
  ctx.fillStyle = 'rgba(243,233,210,0.75)';
  for (const [sx, sy, sr] of [
    [0.18, 0.12, 1.4],
    [0.42, 0.3, 1],
    [0.12, 0.55, 1.2],
    [0.7, 0.62, 1],
    [0.32, 0.78, 1.3],
    [0.86, 0.85, 0.9],
    [0.55, 0.08, 0.9],
  ]) {
    ctx.beginPath();
    ctx.arc(gx + sx * gw, gy + sy * gh, sr, 0, Math.PI * 2);
    ctx.fill();
  }
  // Moon: soft halo, then a crescent cut with the same sky gradient.
  const halo = ctx.createRadialGradient(moon.x, moon.y, moon.r * 0.8, moon.x, moon.y, moon.r * 2.4);
  halo.addColorStop(0, 'rgba(243,233,210,0.26)');
  halo.addColorStop(1, 'rgba(243,233,210,0)');
  ctx.fillStyle = halo;
  ctx.fillRect(moon.x - moon.r * 2.4, moon.y - moon.r * 2.4, moon.r * 4.8, moon.r * 4.8);
  ctx.fillStyle = PAL.cream;
  ctx.beginPath();
  ctx.arc(moon.x, moon.y, moon.r, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = glass;
  ctx.beginPath();
  ctx.arc(moon.x - moon.r * 0.45, moon.y - moon.r * 0.25, moon.r * 0.88, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  // Window bars.
  ctx.fillStyle = shade('#1f2757', dim);
  ctx.fillRect(x + w / 2 - 3, gy, 6, gh);
  ctx.fillRect(gx, y + h / 2 - 3, gw, 6);
}

function drawNote(ctx: CanvasRenderingContext2D, cx: number, cy: number, w: number, h: number, rot: number, size: number, dim: number): void {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(rot);
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.fillRect(-w / 2 + 4, -h / 2 + 5, w, h);
  ctx.fillStyle = shade(PAL.paper, dim, 0.22);
  ctx.fillRect(-w / 2, -h / 2, w, h);
  // Tape.
  ctx.fillStyle = 'rgba(255,255,255,0.28)';
  ctx.fillRect(-w * 0.18, -h / 2 - 6, w * 0.36, 12);
  ctx.fillStyle = PAL.ink;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `italic 800 ${size}px "Segoe Print", "Bradley Hand", "Comic Sans MS", system-ui, sans-serif`;
  ctx.fillText('School', 0, -size * 0.55);
  ctx.fillText('tomorrow!', 0, size * 0.6);
  ctx.restore();
}

function drawAlarmClock(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, st: RoomState): void {
  // Green glow the display throws on the desk and the wall.
  const glow = ctx.createRadialGradient(x + w / 2, y + h * 0.45, 4, x + w / 2, y + h * 0.45, w * 0.95);
  glow.addColorStop(0, `rgba(125,255,168,${0.16 + st.clockFlash * 0.3})`);
  glow.addColorStop(1, 'rgba(125,255,168,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(x - w * 0.5, y - h * 0.6, w * 2, h * 2);
  // Snooze button.
  ctx.fillStyle = shade('#2c3366', st.dim);
  rr(ctx, x + w * 0.32, y - h * 0.08, w * 0.36, h * 0.12, 3);
  ctx.fill();
  // Body.
  const body = ctx.createLinearGradient(0, y, 0, y + h);
  body.addColorStop(0, shade('#262c58', st.dim));
  body.addColorStop(1, shade('#151936', st.dim));
  ctx.fillStyle = body;
  rr(ctx, x, y, w, h, h * 0.18);
  ctx.fill();
  ctx.strokeStyle = shade('#39407a', st.dim);
  ctx.lineWidth = 2;
  ctx.stroke();
  // Display.
  const px = w * 0.08;
  const py = h * 0.15;
  ctx.fillStyle = '#020503';
  rr(ctx, x + px, y + py, w - px * 2, h - py * 2.2, h * 0.08);
  ctx.fill();
  if (st.clockFlash > 0) {
    ctx.strokeStyle = `rgba(125,255,168,${st.clockFlash})`;
    ctx.lineWidth = 3;
    ctx.stroke();
  }
  drawLedClock(ctx, x + w / 2, y + py + (h - py * 2.2) / 2, (h - py * 2.2) * 0.62, st.clock);
}

function drawMonitor(ctx: CanvasRenderingContext2D, s: Rect, pad: number, dim: number): void {
  rr(ctx, s.x - pad, s.y - pad, s.w + pad * 2, s.h + pad * 2, pad + 2);
  ctx.fillStyle = '#04050b';
  ctx.fill();
  ctx.strokeStyle = shade('#2c3470', dim);
  ctx.lineWidth = 2;
  ctx.stroke();
  // Power light.
  ctx.fillStyle = PAL.amber;
  ctx.beginPath();
  ctx.arc(s.x + s.w - 4, s.y + s.h + pad * 0.5, Math.max(1.5, pad * 0.16), 0, Math.PI * 2);
  ctx.fill();
}

function drawDesk(ctx: CanvasRenderingContext2D, top: number, edge: number, dim: number): void {
  ctx.fillStyle = shade('#2b2547', dim);
  ctx.fillRect(0, top, 960, edge - top);
  ctx.fillStyle = shade('#433b70', dim);
  ctx.fillRect(0, top, 960, 2);
  const front = ctx.createLinearGradient(0, edge, 0, 540);
  front.addColorStop(0, shade('#17132c', dim));
  front.addColorStop(1, shade('#0b0919', dim));
  ctx.fillStyle = front;
  ctx.fillRect(0, edge, 960, 540 - edge);
}

function wall(ctx: CanvasRenderingContext2D, dim: number): void {
  const g = ctx.createLinearGradient(0, 0, 0, 540);
  g.addColorStop(0, shade('#121a46', dim));
  g.addColorStop(0.8, shade('#0b1030', dim));
  ctx.fillStyle = g;
  ctx.fillRect(-960, -540, 960 * 3, 540 * 3);
}

/** Light the screen throws on the room around it. */
function screenGlow(ctx: CanvasRenderingContext2D, s: Rect, r: number, a: number): void {
  const g = ctx.createRadialGradient(s.x + s.w / 2, s.y + s.h / 2, s.w * 0.3, s.x + s.w / 2, s.y + s.h / 2, r);
  g.addColorStop(0, `rgba(120,140,255,${a})`);
  g.addColorStop(1, 'rgba(120,140,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(s.x + s.w / 2 - r, s.y + s.h / 2 - r, r * 2, r * 2);
}

// ── Shots ────────────────────────────────────────────────────────────
/** Everything behind (and around) the screen. Call inside `roomTransform`. */
export function drawRoomBack(ctx: CanvasRenderingContext2D, shot: Shot, st: RoomState): void {
  const s = SCREEN[shot];
  const d = st.dim;
  wall(ctx, d);
  if (shot === 'wide') {
    // Moonlight falling from the window onto the desk.
    ctx.fillStyle = `rgba(200,210,255,${0.05 * (1 - d * 0.4)})`;
    ctx.beginPath();
    ctx.moveTo(214, 150);
    ctx.lineTo(214, 340);
    ctx.lineTo(470, 540);
    ctx.lineTo(330, 540);
    ctx.closePath();
    ctx.fill();
    screenGlow(ctx, s, 380, 0.16);
    // Curtain rod and curtains frame the window.
    drawWindow(ctx, 50, 150, 158, 186, { x: 168, y: 196, r: 18 }, d);
    ctx.fillStyle = shade('#1b1542', d);
    for (const [x0, dir] of [
      [22, 1],
      [236, -1],
    ] as const) {
      ctx.beginPath();
      ctx.moveTo(x0, 138);
      ctx.lineTo(x0 + dir * 34, 138);
      ctx.quadraticCurveTo(x0 + dir * 22, 250, x0 + dir * 40, 372);
      ctx.lineTo(x0 - dir * 4, 372);
      ctx.closePath();
      ctx.fill();
    }
    ctx.fillStyle = shade('#2e3566', d);
    ctx.fillRect(12, 132, 236, 6);
    ctx.fillStyle = shade('#2a3366', d);
    ctx.fillRect(40, 336, 178, 10);
    drawDesk(ctx, 390, 404, d);
    // Monitor glow on the desk, stand, then the monitor.
    ctx.fillStyle = 'rgba(120,140,255,0.12)';
    ctx.beginPath();
    ctx.ellipse(480, 397, 250, 8, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = shade('#1c2040', d);
    ctx.fillRect(464, 378, 32, 14);
    ctx.fillStyle = shade('#262b52', d);
    rr(ctx, 418, 388, 124, 8, 4);
    ctx.fill();
    drawMonitor(ctx, s, 12, d);
    drawNote(ctx, 812, 196, 140, 88, -0.06, 21, d);
    drawAlarmClock(ctx, 752, 318, 148, 72, st);
  } else {
    // Close-up: a sliver of window on the left, a warm lamp off-screen right.
    drawWindow(ctx, -46, 40, 106, 250, { x: 24, y: 96, r: 15 }, d);
    const lamp = ctx.createRadialGradient(960, 150, 10, 960, 150, 260);
    lamp.addColorStop(0, `rgba(255,184,77,${0.2 * (1 - d * 0.6)})`);
    lamp.addColorStop(1, 'rgba(255,184,77,0)');
    ctx.fillStyle = lamp;
    ctx.fillRect(700, -110, 520, 520);
    screenGlow(ctx, s, 600, 0.14);
    drawDesk(ctx, 476, 490, d);
    ctx.fillStyle = shade('#262b52', d);
    rr(ctx, 390, 474, 180, 10, 4);
    ctx.fill();
    drawMonitor(ctx, s, 12, d);
    // Mug on the desk.
    ctx.fillStyle = shade('#3a2f5c', d);
    rr(ctx, 10, 468, 44, 54, 6);
    ctx.fill();
    ctx.strokeStyle = shade('#3a2f5c', d);
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.arc(56, 492, 10, -1.2, 1.2);
    ctx.stroke();
  }
}

/** Props in front of the screen (they may overlap its edge). Call inside `roomTransform`. */
export function drawRoomFront(ctx: CanvasRenderingContext2D, shot: Shot, st: RoomState): void {
  if (shot === 'desk') {
    // Subtle glass glare on the screen.
    const s = SCREEN.desk;
    const g = ctx.createLinearGradient(s.x, s.y, s.x + s.w * 0.5, s.y + s.h * 0.6);
    g.addColorStop(0, 'rgba(255,255,255,0.045)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(s.x, s.y, s.w, s.h);
    drawNote(ctx, 876, 46, 112, 72, 0.08, 16, st.dim);
    drawAlarmClock(ctx, 716, 446, 156, 84, st);
  }
}
