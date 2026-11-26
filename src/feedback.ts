// Presentation-side reading of simulation events, shared by the renderer and
// the audio. Nothing here changes the simulation or the score.

import { CLOSE_DODGE, LANES } from './config.ts';
import type { SimEvent } from './sim.ts';

/**
 * Remembers when the ship last left each lane, so a dodged barrier can be
 * classified as "close" (the player got out of its lane at the last moment).
 */
export class DodgeTracker {
  private leftAt: number[] = new Array(LANES).fill(-Infinity);

  reset(): void {
    this.leftAt.fill(-Infinity);
  }

  /** Ids of the barriers in `events` that were dodged close. `time` = sim time of the drain. */
  scan(events: readonly SimEvent[], time: number): Set<number> {
    const close = new Set<number>();
    for (const e of events) {
      if (e.type === 'move') this.leftAt[e.from] = time;
      else if (e.type === 'dodge') {
        const gap = e.obj.t - this.leftAt[e.obj.lane];
        if (gap >= 0 && gap <= CLOSE_DODGE) close.add(e.obj.id);
      }
    }
    return close;
  }
}
