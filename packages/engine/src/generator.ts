import { Builder, type BuildOpts, type ModuleSpec } from './builder.ts';
import { checkScenario } from './checker.ts';
import { layoutFor } from './layout.ts';
import { Rng, randomSeed } from './rng.ts';
import {
  ALLIES,
  CAGE_SKINS,
  CAPTAIN_LINES,
  MISSION_NAMES,
  PARROT_CHATTER,
  TREASURE_SPOTS,
} from './theme.ts';
import type { Act, AreaDef, AreaId, CageInfo, MissionInfo, Scenario, Secret, StyleBand } from './types.ts';
import { brokenCompass, ropeHook, sailorsKnots, wallSymbols } from './modules/act1.ts';
import {
  barrelBalance,
  lanternInk,
  messageRelay,
  parrotPhrase,
  synchronisedHaul,
  tidalValves,
} from './modules/hold.ts';
import {
  cannonSequence,
  chestCode,
  headingVote,
  lowerLifeboat,
  wheelBearings,
} from './modules/finale.ts';

export const MODULES: ModuleSpec[] = [
  wallSymbols,
  ropeHook,
  sailorsKnots,
  brokenCompass,
  lanternInk,
  barrelBalance,
  tidalValves,
  parrotPhrase,
  synchronisedHaul,
  messageRelay,
  chestCode,
  wheelBearings,
  cannonSequence,
  headingVote,
  lowerLifeboat,
];

const ACT2_POOLS: Record<StyleBand, ModuleSpec[]> = {
  small: [barrelBalance, lanternInk, parrotPhrase, sailorsKnots, brokenCompass],
  mid: [barrelBalance, tidalValves, lanternInk, parrotPhrase, sailorsKnots, brokenCompass],
  big: [tidalValves, synchronisedHaul, messageRelay, lanternInk, parrotPhrase, sailorsKnots, brokenCompass],
};

/** Modules that use a unique prop (only one parrot aboard). */
const ONCE = new Set(['parrot_phrase']);

export interface GenerateOptions {
  seed?: number;
  maxAttempts?: number;
  durationMinutes?: number;
}

export function generateScenario(players: number, opts: GenerateOptions = {}): Scenario {
  const seed = opts.seed ?? randomSeed();
  const maxAttempts = opts.maxAttempts ?? 25;
  let lastErrors: string[] = [];
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const rng = new Rng((seed + attempt * 0x9e3779b1) >>> 0);
    let scn: Scenario;
    try {
      scn = build(players, seed, rng, opts.durationMinutes ?? 45);
    } catch (e) {
      lastErrors = [String((e as Error).message)];
      continue;
    }
    const res = checkScenario(scn);
    scn.estMinutes = res.estMinutes;
    scn.attempts = attempt + 1;
    if (res.ok) return scn;
    lastErrors = res.errors;
  }
  throw new Error(`could not generate a solvable run: ${lastErrors.join('; ')}`);
}

function build(players: number, seed: number, rng: Rng, durationMinutes: number): Scenario {
  const layout = layoutFor(players);
  const spot = rng.pick(TREASURE_SPOTS);
  const ally = rng.pick(ALLIES);
  const secret: Secret = {
    treasureSpot: spot.id,
    treasureSpotName: spot.name,
    ally: ally.id,
    allyName: ally.name,
    allyTell: ally.tell,
    summary: `Blackwater's gold was hidden ${spot.name.toLowerCase()}, and the friend slipping you notes was ${ally.name}.`,
  };
  const cageAreas: AreaId[] = Array.from({ length: layout.cages }, (_, i) => `cage${i}`);
  const areas: AreaDef[] = [
    ...cageAreas.map((id, i) => ({ id, name: CAGE_SKINS[i].name, unlockedBy: [], slots: 8 })),
    { id: 'hold', name: 'The Hold', unlockedBy: [], slots: 28 },
    { id: 'quarters', name: "Captain's Quarters", unlockedBy: [], slots: 14 },
    { id: 'deck', name: 'Main Deck', unlockedBy: [], slots: 18 },
  ];
  const b = new Builder(rng, layout, secret, areas);
  // Least-used-first draw across the whole run keeps modules varied.
  const usage = new Map<string, number>();
  const used = (id: string) => usage.get(id) ?? 0;
  const markUsed = (m: ModuleSpec) => (usage.set(m.id, used(m.id) + 1), m);
  const drawer = (pool: ModuleSpec[], act: Act) => (avoid: string[] = []): ModuleSpec => {
    const cands = pool.filter((m) => m.acts.includes(act) && !(ONCE.has(m.id) && used(m.id) > 0));
    const pref = cands.filter((m) => !avoid.includes(m.id));
    const list = pref.length ? pref : cands;
    if (!list.length) throw new Error('module pool exhausted');
    const min = Math.min(...list.map((m) => used(m.id)));
    return markUsed(rng.pick(list.filter((m) => used(m.id) === min)));
  };
  const gatePuzzle = (name: string, act: Act, area: AreaId, requires: string[], unlockArea: AreaId | undefined, solvedText: string) =>
    b.puzzle({
      module: 'gate',
      name,
      act,
      area,
      prop: 'gate',
      look: '',
      interaction: { type: 'gate' },
      solution: { type: 'gate' },
      requires: { puzzles: requires },
      reward: unlockArea ? { unlockArea } : {},
      auto: true,
      solvedText,
      hints: ['', '', ''],
      estMinutes: 0,
    }).id;

  // ---------- Act 1: break the cages ----------
  const n = layout.cages;
  const drawAct1 = drawer([wallSymbols, ropeHook, sailorsKnots, brokenCompass], 1);
  const extraCage = layout.style === 'mid' ? rng.int(0, n - 1) : -1;
  const cages: CageInfo[] = [];
  for (let i = 0; i < n; i++) {
    const steps = layout.style === 'small' || i === extraCage ? 2 : 1;
    let gate: string[] = [];
    const usedHere: string[] = [];
    for (let s = 0; s < steps; s++) {
      const last = s === steps - 1;
      const mod = drawAct1(usedHere);
      usedHere.push(mod.id);
      // Alternate the neighbouring cage that holds the inputs, so cages form a ring of dependencies.
      const source = cageAreas[s % 2 === 0 ? (i + 1) % n : (i + n - 1) % n];
      const id = mod.build(b, {
        act: 1,
        area: cageAreas[i],
        source,
        gate,
        reward: last ? { openCage: i } : {},
        rewardText: last ? `The door of the ${CAGE_SKINS[i].name} swings open!` : 'The leg-irons fall away — one lock down, one to go.',
      });
      gate = [id];
    }
    const skin = CAGE_SKINS[i];
    cages.push({ index: i, area: cageAreas[i], name: skin.name, colorName: skin.colorName, color: skin.color, emblem: skin.emblem, lockPuzzle: gate[0] });
  }
  const gate2 = gatePuzzle('Every cage is open', 2, 'hold', cages.map((c) => c.lockPuzzle), 'hold', CAPTAIN_LINES.act2);

  // ---------- Act 2: the hold ----------
  const drawAct2 = drawer(ACT2_POOLS[layout.style], 2);
  const missionIds = rng.shuffle(Object.keys(MISSION_NAMES));
  const missions: MissionInfo[] = [];
  const pickSource = (): AreaId => (rng.chance(0.65) ? 'hold' : rng.pick(cageAreas));
  const act2 = (mission: string, gate: string[], final: boolean, avoid: string[] = []): string => {
    const mod = drawAct2(avoid);
    const opts: BuildOpts = {
      act: 2,
      area: 'hold',
      source: pickSource(),
      source2: pickSource(),
      gate,
      mission,
      reward: {},
      rewardText: final ? `Mission complete: ${MISSION_NAMES[mission]}.` : 'Something new shakes loose nearby.',
    };
    const id = mod.build(b, opts);
    let m = missions.find((x) => x.id === mission);
    if (!m) missions.push((m = { id: mission, name: MISSION_NAMES[mission], puzzles: [] }));
    m.puzzles.push(...b.puzzles.filter((p) => p.mission === mission && !m!.puzzles.includes(p.id)).map((p) => p.id));
    return id;
  };
  const act2Finals: string[] = [];
  if (layout.act2 === 'chain') {
    let g = [gate2];
    for (let s = 0; s < 3; s++) g = [act2(missionIds[s], g, true)];
    act2Finals.push(g[0]);
  } else if (layout.act2 === 'split') {
    const first = act2(missionIds[0], [gate2], true);
    const a = act2(missionIds[1], [first], true);
    const c = act2(missionIds[2], [first], true);
    act2Finals.push(act2(missionIds[3], [a, c], true));
  } else {
    for (const mission of missionIds) {
      const len = layout.players >= 12 && (mission === 'rigging' || mission === 'pump') ? 3 : 2;
      let g = [gate2];
      for (let s = 0; s < len; s++) g = [act2(mission, g, s === len - 1)];
      act2Finals.push(g[0]);
    }
  }
  const gate3 = gatePuzzle('All hold missions complete', 3, 'quarters', act2Finals, 'quarters', CAPTAIN_LINES.act3);

  // ---------- Act 3: the captain's quarters ----------
  const quarterLocks: string[] = [];
  const chestText = 'Inside the sea chest: a sea chart, sealed orders and a small brass key.';
  if (layout.style === 'big') {
    const codeMod = markUsed(used('lantern_ink') ? brokenCompass : lanternInk);
    const wordMod = markUsed(used('parrot_phrase') ? messageRelay : parrotPhrase);
    for (const mod of [codeMod, wordMod]) {
      quarterLocks.push(
        mod.build(b, {
          act: 3,
          area: 'quarters',
          source: rng.chance(0.5) ? 'quarters' : 'hold',
          source2: 'hold',
          gate: [gate3],
          reward: {},
          rewardText: 'One of the sea chest’s two locks gives way.',
        }),
      );
    }
  } else {
    let g = [gate3];
    if (layout.style === 'mid') {
      const drawerMod = markUsed(
        !used('parrot_phrase') ? parrotPhrase : used('knots') <= used('compass') ? sailorsKnots : brokenCompass,
      );
      g = [
        drawerMod.build(b, {
          act: 3,
          area: 'quarters',
          source: rng.chance(0.5) ? 'quarters' : 'hold',
          gate: g,
          reward: {},
          rewardText: 'The captain’s desk drawer slides open: his logbook is inside.',
        }),
      ];
    }
    quarterLocks.push(chestCode.build(b, { act: 3, area: 'quarters', source: 'quarters', gate: g, reward: {}, rewardText: chestText }));
  }
  const chestOpen = gatePuzzle('The sea chest is open', 3, 'quarters', quarterLocks, undefined, chestText);
  b.item({
    kind: 'brassKey',
    name: 'Small brass key',
    desc: 'A small brass key engraved with a gull. It looks like it opens a hidden compartment.',
    area: 'quarters',
    revealedBy: [chestOpen],
  });
  const riddle = rng.pick(spot.riddles);
  const letter = b.clue({
    kind: 'letter',
    title: 'Unsent letter',
    area: 'quarters',
    look: 'An unsent letter, half-burned in the grate.',
    content: {
      text: `My dearest Marguerite — should this storm take me, know I have provided for you. ${riddle} The little brass key will open it. — B.`,
    },
    revealedBy: [gate3],
  });
  const gate4 = gatePuzzle('Up to the deck', 4, 'deck', [chestOpen], 'deck', CAPTAIN_LINES.act4);

  // ---------- Act 4: take the ship ----------
  const deckMods: ModuleSpec[] =
    layout.style === 'small'
      ? [wheelBearings]
      : layout.style === 'mid'
        ? [wheelBearings, cannonSequence]
        : [headingVote, cannonSequence, synchronisedHaul];
  const act4Finals = deckMods.map((mod) =>
    mod.build(b, {
      act: 4,
      area: 'deck',
      source: mod.id === 'sync_haul' ? 'deck' : 'quarters',
      source2: 'hold',
      gate: [gate4],
      reward: {},
      rewardText: 'The lifeboat davits are within reach.',
    }),
  );
  const finalPuzzle = lowerLifeboat.build(b, {
    act: 4,
    area: 'deck',
    source: 'deck',
    gate: act4Finals,
    reward: {},
    rewardText: 'EVERYONE INTO THE BOAT!',
  });
  const brassKey = b.items.find((i) => i.kind === 'brassKey')!;
  const treasure = b.puzzle({
    module: 'treasure',
    name: 'Hiding places',
    act: 4,
    area: 'deck',
    prop: 'stash',
    look: 'Five places on deck where a captain might hide something. A small brass keyhole could be anywhere.',
    interaction: {
      type: 'choice',
      options: TREASURE_SPOTS.map((t) => ({ id: t.id, label: t.name })),
      prompt: 'Where did Blackwater hide his gold? You need his brass key. Guess wrong and you lose precious time.',
    },
    solution: { type: 'choice', value: spot.id },
    requires: { items: [brassKey.id], clues: [letter.id], puzzles: [gate4] },
    optional: true,
    solvedText: `The brass key turns ${spot.name.toLowerCase()} — gold doubloons spill out! Treasure secured.`,
    hints: [
      'The captain wrote about his gold in a letter he never sent.',
      `The letter in the Captain's Quarters hides the place in a riddle: “${riddle}”`,
      `The gold is ${spot.name.toLowerCase()}. Bring the brass key.`,
    ],
    estMinutes: 3,
    wrongPenalty: 45,
  }).id;

  // Area unlocks follow the act gates.
  areas.find((a) => a.id === 'hold')!.unlockedBy = [gate2];
  areas.find((a) => a.id === 'quarters')!.unlockedBy = [gate3];
  areas.find((a) => a.id === 'deck')!.unlockedBy = [gate4];

  return {
    seed,
    layout,
    secret,
    areas,
    cages,
    missions,
    items: b.items,
    clues: b.clues,
    puzzles: b.puzzles,
    finalPuzzle,
    treasurePuzzle: treasure,
    gates: { act2: gate2, act3: gate3, act4: gate4 },
    parrotChatter: rng.sample(PARROT_CHATTER, 4),
    captainLines: CAPTAIN_LINES,
    estMinutes: 0,
    durationMinutes,
    attempts: 0,
  };
}
