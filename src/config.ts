// Tuning values for the prototype. Everything that affects control feel,
// readability and fairness lives here so it can be adjusted in one place.

/** Number of lanes. Lane 0 = left, 1 = centre, 2 = right. */
export const LANES = 3;

/** Forward speed in world units per second (1 unit = 1 lane width). */
export const SPEED = 12;

/** Seconds an object is on screen before it reaches the ship (draw distance). */
export const LOOKAHEAD = 3.2;

/** Seconds of fog fade-in after an object appears at the far end. */
export const FADE_IN = 0.45;

/** ± seconds around the crossing moment in which a core can be collected. */
export const CORE_WINDOW = 0.08;

/** After a crash the ship ghosts through barriers for this long (avoids double hits). */
export const INVULNERABLE_AFTER_CRASH = 0.6;

export const CORE_POINTS = 100;
export const BIG_CORE_POINTS = 500;

/** Length of the fixed course in seconds. */
export const RUN_DURATION = 30;

/** "3, 2, 1" before the ship starts moving. */
export const COUNTDOWN = 2.4;

/** Pause on the "FINISH" banner before the results appear. */
export const FINISH_HOLD = 1.2;

/** Maximum number of rounds per player (1 run + 1 rematch). */
export const MAX_ROUNDS = 2;

/** Simulation step (fixed, deterministic). */
export const SIM_DT = 1 / 120;

// ── Presentation only (never read by the simulation) ─────────────────

/** Title and closing ignore input for this long after appearing (anti-mash). */
export const INPUT_LOCK = 0.6;

/** Results ignore input for this long, so mashing ENTER can't pick "One more round". */
export const RESULTS_LOCK = 1.2;

/** Results, closing or pause with no input for this long → back to the title. */
export const IDLE_RESET = 45;

/** The "back to the start in N" notice appears this many seconds before the reset. */
export const IDLE_WARNING = 10;

/** A barrier dodged by leaving its lane this soon before it arrives shows "CLOSE!". */
export const CLOSE_DODGE = 0.35;

/** Master volume of the synthesised sound effects (0–1). */
export const VOLUME = 0.55;

/** Fictional story clock (presentation only): round 1 is played at 10:30 PM… */
export const CLOCK_START = 22 * 60 + 30; // minutes after midnight
/** …and choosing "One more round" moves it this many minutes later. */
export const CLOCK_STEP = 30;
