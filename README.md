# Crimson Gull — 3D Co-op Escape Room

> “Every crew gets a different ship.”

A browser-based 3D co-op escape room for **4 to 15 friends**, built from the *Crimson Gull — 3D Co-op Escape Room PRD*.
Your crew mutinied against Captain Blackwater and lost. You start locked in separate cages in his flooding hold, and you have
45 minutes to break out, retake the ship and reach the lifeboat together. The puzzles, clue placement, mystery and cage
layout are generated fresh for every run and adapt to the size of your crew.

## Quick start

```bash
npm install
npm run build      # build the 3D client
npm start          # serve client + game server on http://localhost:8787
```

Open the URL, choose a name and **Launch a new ship**. Share the invite link (`?room=CODE`). The host starts the run once
4–15 players have joined. **Practice run** lets any number of players (even one) try a run: cage bars do not block you and
the run is not added to the leaderboard.

For development with hot reload:

```bash
npm run dev        # game server on :8787 + Vite client on :5173 (proxying /ws)
```

### Configuration (environment variables)

| Variable | Default | Meaning |
| --- | --- | --- |
| `PORT` | `8787` | HTTP + WebSocket port |
| `RUN_MINUTES` | `45` | Length of a run |
| `MIN_PLAYERS` | `4` | Minimum crew to start a normal run |
| `GRACE_SECONDS` | `60` | Reconnect grace period before a dropped player's tasks are handed off |
| `STUCK_MINUTES` | `5` | No progress for this long → the parrot offers a hint |
| `DATA_DIR` | `./data` | Leaderboard (`leaderboard.json`) and analytics (`analytics.jsonl`) |
| `DEBUG_API` | off | `1` exposes `/api/debug/rooms/:code` (full scenario with solutions) for automated tests only |

## How to play

| Action | Control |
| --- | --- |
| Move / hurry | `W A S D` / hold `Shift` |
| Look | Drag the mouse, or `Q` `E` / arrow keys |
| Interact | Click glinting things: pick up items, read clues, work locks |
| Inventory | `1`–`6` select · `I` inspect (rotate/zoom) · `G` drop |
| Use an item | Select it, then click the lock or contraption |
| Throw to a crewmate | Select an item, then click them (or ⇄ on the slot), even into another cage |
| Combine | Select one item, then ⊕ on another |
| Hint | `H` |
| Chat | `Enter` |
| Mic | `M` mute · hold `V` for push-to-talk (in settings) · Captain holds `B` to ring the bell |

## What is implemented (PRD coverage)

**Story & structure.** *The Brig of the Crimson Gull*: a fixed four-act spine with variable details.
1. **Break the cages.** 2–5 cages depending on crew size. Each cage's lock needs a clue or object held in a neighbouring
   cage, and objects are thrown between cages.
2. **The hold.** Small crews get one linked chain, mid crews a chain with a short split, big crews parallel missions:
   *Pump out the hold*, *Repair the rigging*, *Fix the lifeboat* and *Decode the map*.
3. **The captain's quarters.** Open Blackwater's sea chest using his logbook. An unsent letter hides the optional secret.
4. **Take the ship.** Steer through the reef, fire the signal guns in order, vote on a heading (big crews) and lower the
   lifeboat together. **Everyone must escape.**

Endings: **Full escape**, **Escape with the treasure** (the randomised secret was solved) and **Lost at sea**. The rising
water is the visible timer. The captain speaks from above deck and the parrot repeats phrases. All spoken lines are
subtitled and can optionally be read aloud.

**Puzzle engine** (`packages/engine`, shared and theme-independent, unit-tested):
- 15 modules from the PRD catalogue: rope & hook, broken compass, wall symbols, lantern & invisible ink, barrel balance,
  sailor's knots, ship's wheel bearings, tidal valves, parrot phrase, captain's chest code, synchronised haul, message
  relay, cannon sequence, heading vote and lifeboat davits. Each declares inputs, outputs, randomised parameters, player
  requirements, crew-size tags, tiered hints and a pirate skin.
- A seeded **generator** follows the PRD's 7 steps: layout by player count, the mystery outcome, modules per act for the
  crew size, randomised parameters, a dependency graph that crosses between cages, placement, and a solvability check.
- A **solvability checker** simulates the graph, checks that no cage starts blocked and that every cage gives and needs
  help, rejects puzzles whose inputs sit behind themselves, and estimates solve time. Runs far from the 45-minute target
  are rejected and regenerated.
- Group-size scaling follows the PRD tables. Tight multi-clue puzzles go to small crews, information split across areas
  to mid crews, and many-hands puzzles (haul on the drum beat, message relay, cannon order fired by different gunners,
  crew vote) to big crews.

**Multiplayer** (`packages/server`):
- Rooms, invite links, a lobby with mic check, and host start.
- The server owns all puzzle and object state. Solutions and clue text never leave the server unless a player is close
  enough to read the clue.
- Random roles: **Captain** (bell broadcast), **Navigator** (only they can read tidal and sea charts while connected),
  **Quartermaster** (6 slots, double throw range), **Bosun** (counts double on ropes) and **Lookout** (spyglass reads
  distant markings and sees glints from afar).
- Disconnects: a grace period lets a player reconnect to the same spot. After it, their items pass to crewmates, and an
  empty cage swings open with its clues made public, so the crew is never blocked. Disconnected players do not count
  toward "everyone must escape". Late joins are refused (an open question in the PRD).
- In-story tiered hints: a note through the floorboards, signed by the run's secret ally, or the parrot “remembering”.
  The game offers a hint when the crew is stuck. Wrong answers let in extra water.
- Scoring, per-band leaderboards, a results screen with the run's secret and highlights, a shareable result card, and
  **Play again**, which keeps the crew and generates a new ship.
- Analytics events (`run_start`, `run_end` with per-puzzle solve times and hints) go to `analytics.jsonl`.

**3D client** (`packages/client`, Three.js + TypeScript + Vite):
- A stylised low-poly ship built entirely from code, with no asset downloads. It has a lantern-lit hold with colour-coded,
  emblem-flagged cages, the captain's quarters, and a storm-swept deck with rain, lightning and swell. Water rises in the
  hold as time runs down.
- First-person WASD with drag-to-look and click-to-interact. Interactive objects glint. There is an inventory bar, a 3D
  item inspector, throws animated across the hold, and puzzle panels for every interaction type.
- Proximity voice chat over WebRTC: crewmates fade with distance and are muffled between hold and deck. The Captain's
  bell broadcasts to everyone. Push-to-talk or open mic, per-player mute and volume, and text chat as a fallback.
- Procedural audio: storm ambience that intensifies with the clock, creaking timbers, and sound effects.
- Accessibility: every colour cue also has a symbol, subtitles for all spoken lines, adjustable text size and audio levels.

### Deviations from the proposed stack

The PRD's technical stack is a proposal to validate in a prototype. This MVP uses plain Three.js rather than React Three
Fiber, a dependency-free WebSocket server rather than Colyseus, and JSON files rather than Postgres. Voice is a
**peer-to-peer WebRTC mesh** signalled through the game server, so it runs with no extra infrastructure. As the PRD
notes, a mesh will not hold up well at 15 players. The per-peer gain model is written so a media server such as LiveKit
can replace the transport.

## Project layout

```
packages/engine   puzzle modules, generator, solvability checker, runtime, wire protocol (+ tests)
packages/server   rooms, lobby, authoritative game state, persistence (+ tests)
packages/client   Three.js world, controls, HUD and panels, audio, voice
scripts/e2e.mts   browser end-to-end run (Playwright) against a server started with DEBUG_API=1
```

## Testing

```bash
npm test            # engine + server unit/integration tests
npm run typecheck
# Optional browser run-through (needs Playwright + Chromium):
DEBUG_API=1 npm start &
npx tsx scripts/e2e.mts 4 e2e-shots
```

The engine tests generate runs for every crew size from 1 to 15 across many seeds. Every run must pass the checker and
be completable with the real answer runtime. The server tests play whole runs through the game rules for crews of 4–15,
including disconnect handling, Navigator-only charts, hints, the timer and endings, plus a WebSocket lobby, start and
reconnect flow.
