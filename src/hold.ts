// Held arrow during a round (input only; the simulation never reads it).
//
// A press moves one lane at once (main.ts calls Sim.move on keydown). If the
// same arrow is still down HOLD_REPEAT seconds later, it moves ONE more lane:
// enough to cross all three lanes with a single held key. The timing is the
// game's own, so the operating system's key repeat (e.repeat) never matters.
// Releasing the key before the threshold cancels the extra move. Holding
// against the edge stays silent: no extra move, no extra bump.
//
// No DOM: the Node tests drive it with explicit times.

import { HOLD_REPEAT, LANES } from './config.ts';

export type Dir = -1 | 1;

export class HoldRepeat {
  private dir: Dir | 0 = 0;
  private since = 0;

  /** A fresh (non-repeat) press that the round already answered with one move. */
  press(dir: Dir, now: number): void {
    this.dir = dir;
    this.since = now;
  }

  /** Key released: cancels the pending extra move of that direction. */
  release(dir: Dir): void {
    if (this.dir === dir) this.dir = 0;
  }

  /** Pause, focus loss, screen change, next player. */
  clear(): void {
    this.dir = 0;
  }

  /** Direction still held and waiting for its extra move (0 = none). */
  get held(): Dir | 0 {
    return this.dir;
  }

  /**
   * The extra move due at `now` for a ship in `lane`, or 0. Fires at most
   * once per press, and only if the next lane exists.
   */
  poll(now: number, lane: number): Dir | 0 {
    if (this.dir === 0 || now - this.since < HOLD_REPEAT) return 0;
    const d = this.dir;
    this.dir = 0;
    const to = lane + d;
    return to >= 0 && to < LANES ? d : 0;
  }
}
