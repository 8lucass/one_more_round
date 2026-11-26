# One More Round

A 30-second browser arcade game about the question *"why is it so hard to stop after one more round?"*

Made for the Grade 11 project **"This Is the Teenage Brain on Video Games"** and shown at a gallery walk. The game is the visual representation. A separate written explanation (APA, with references) covers the science in depth.

## Try it in two minutes

1. Download **`dist/one-more-round.html`** from this repository (open the file on GitHub and press *Download raw file*).
2. Double-click it. It opens in Chrome, Edge or Firefox. It is a single file and needs no internet, no install and no other files.
3. Press **Enter**, then use **← / →** (or **A / D**) to change lane. Sound is on; **M** mutes it.
4. For the best view, use full screen (**F11**). **Esc** returns to the title screen at any time.

A full play-through, including the closing screens, takes about 2 to 3 minutes.

## The concept

You fly a small ship down a three-lane tunnel for 30 seconds. You collect cyan **cores** (+100) and avoid red striped **barriers**.

The twist is the golden **+500 core**, which always has a barrier right behind it in the same lane:

- Collect it and it stays **pending** ("+500?").
- It is **banked** only if you then get past its barrier without crashing.
- If you crash into that barrier, the +500 is **lost** and your streak resets.
- You can also **let it pass** and take the safe lane for a guaranteed, smaller gain.

For each +500, the points work out like this:

| Choice | Result |
|---|---|
| Let it pass | +200 (safe cores in the other lane) |
| Collect it and escape the barrier | +500 |
| Collect it and crash | 0, plus a crash |

So the tempting choice is not always the best one. Every player gets the exact same tunnel, so a score is a fair comparison.

### The "one more round" loop

After round 1 the results screen offers **One more round** or **Finish**:

- The fictional clock on the alarm clock moves from **10:30 PM** to **11:00 PM** only if you choose another round.
- Round 2 is the same tunnel, with no tutorials, and the game tells you the score to beat.
- Only one rematch is offered. The closing screens then connect the run to the topic.

### The closing screens

The game ends with two pages, read at the player's own pace:

1. **"Your run":** score, change between rounds, how many +500s were won, lost or let pass, and what the final clock time was.
2. **"What this has to do with your brain":** three short blocks, each with a citation.

| Block | Brain structure | Idea in the game | Source |
|---|---|---|---|
| Reward | Striatum | Game play and dopamine in the reward system | Koepp et al. (1998) |
| Decisions | Prefrontal cortex | Judging risk is still maturing in adolescence | NIMH (2023) |
| Sleep timing | Suprachiasmatic nucleus | The body clock and why "just one more" gets late | NIGMS (2023); NIMH (2023) |

The page ends with a question for the person in front of the screen: *"What made you want to keep playing, if anything?"*

## An honest framing

Score, crashes, timing and the choice to play again are **game data, not brain data**. The game does not measure dopamine, brain activity or anyone's self-control. It gives the player an experience to think about, and the closing screens say so on screen. The clock is also fictional.

## How the game teaches (design choices)

- **No science during play.** The tunnel is for playing. The explanations appear only after the run, when the player has something to relate them to.
- **Short and repeatable.** One round is 30 seconds, so a visitor at the gallery walk can finish quickly and the next person starts straight away (the game resets itself after 45 s without input).
- **The setting carries the theme.** A night bedroom frames the whole game: a moon in the window, a desk and monitor, an LED alarm clock and a note that says "School tomorrow!". Choosing another round moves the clock to 11:00 PM and the room gets a little darker.
- **Readable without sound or colour alone.** Barriers are tall and striped, cores are small and round, and a streak trail and "CLOSE!" / "CRASH!" messages give feedback. Sound effects are synthesised in the browser, so there are no audio files.
- **Reduced motion.** With the system setting `prefers-reduced-motion`, shake, flicker and zoom are turned off.

## Controls

| Input | Action |
|---|---|
| ← / → or A / D | Move one lane per press. Holding the arrow for 0.2 s moves one extra lane |
| Enter / Space | Start, confirm, next page |
| ← / → on results | Choose a button |
| ← / → on closing pages | Previous / next page |
| Mouse / touch | Click the drawn buttons; while playing, tap the left or right half |
| M | Mute / unmute |
| Esc | Back to the title screen for the next player |

If the window loses focus or the tab is hidden during a round, the game pauses. Press Enter to resume with a 3-2-1.

## For developers

TypeScript + Canvas 2D, with no runtime dependencies, images or fonts. The simulation (`src/sim.ts`) is deterministic and has no DOM, so the same code runs in the browser and in the Node tests.

```bash
npm install
npm run dev         # build + local server at http://localhost:8000
npm run build       # regenerate dist/ (index.html + game.js + one-more-round.html)
npm run typecheck   # strict tsc
npm test            # simulation, level design, scoring routes, closing text (Node)
npm run test:e2e    # real Chromium plays full rounds (~5 min; first time: npx playwright install chromium)
```

`npm run test:e2e` and `npm run test:e2e:standalone` rewrite `dist/`, so run `npm run build` afterwards.

| File | Role |
|---|---|
| `src/config.ts` | Tunable values: speed, scoring, locks, volume |
| `src/track.ts` | The fixed level and phase messages (0–9 s cores, 9–15 s barriers, 15–30 s risk) |
| `src/sim.ts` | Deterministic simulation and scoring |
| `src/render.ts` | Tunnel, HUD, screens and camera |
| `src/scene.ts` | The bedroom, LED clock, note and window |
| `src/story.ts` | Fictional clock and closing-screen text |
| `src/hold.ts` | Held-arrow extra lane |
| `src/main.ts` | Screen flow, input, pause, idle reset, main loop |
| `src/audio.ts` | Synthesised sound effects |
| `src/feedback.ts` | Close-call detection shared by graphics and sound |

The tests check that the level is fair (every barrier row leaves a free lane, every +500 has an escape) and that four scripted routes give exactly 800, 1800, 1900 and 3100 points.
