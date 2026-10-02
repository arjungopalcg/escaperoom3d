// Quarters and deck modules: Acts 3 and 4.
import type { ModuleSpec } from '../builder.ts';
import { GLYPHS, HEADINGS, HEADING_NAMES, SYMBOL_IDS, glyphLabel } from '../theme.ts';

const STORM_EVENTS = [
  'Storm from the west. Lost the mainmast',
  'Squall at dusk. Two barrels washed overboard',
  'Gale off the cape. Rigging torn to ribbons',
  'Hurricane winds. The cook was sick in the soup',
  'Thunderstorm. Lightning split the bowsprit',
];
const CALM_EVENTS = [
  'Calm seas. Flogged Jenkins for singing',
  'Took on fresh water at Gull Rock',
  'Parrot bit the bosun. Good bird',
  'Spotted a merchantman; too fast for us',
  'Counted the gold twice. Still not enough',
  'Mutineers grumbling. Doubled the watch',
];

export const chestCode: ModuleSpec = {
  id: 'chest_code',
  name: "Captain's chest code",
  bands: ['small', 'mid'],
  acts: [3],
  minPlayers: 1,
  build(b, o) {
    const stormDays = b.rng.sample([1, 2, 3, 4, 5, 6, 7, 8, 9], 4).sort((a, c) => a - c);
    const storms = b.rng.sample(STORM_EVENTS, 4);
    const mastIdx = storms.findIndex((s) => s.includes('mainmast'));
    const calmDays = b.rng.sample(
      Array.from({ length: 19 }, (_, i) => i + 10),
      4,
    );
    const entries = [
      ...stormDays.map((d, i) => ({ d, t: storms[i] })),
      ...calmDays.map((d, i) => ({ d, t: CALM_EVENTS[i] })),
    ].sort((a, c) => a.d - c.d);
    const small = b.style === 'small' && mastIdx >= 0;
    const ordered = small ? [...stormDays.slice(mastIdx), ...stormDays.slice(0, mastIdx)] : stormDays;
    const code = ordered.join('');
    const logbook = b.clue({
      kind: 'logbook',
      title: "Captain Blackwater's logbook",
      area: o.source,
      look: 'A heavy leather logbook lies open on the desk.',
      content: {
        text: 'LOG OF THE CRIMSON GULL — this month:',
        table: [['Day', 'Entry'], ...entries.map((e) => [String(e.d), e.t])],
      },
      revealedBy: o.gate,
    });
    const plate = small
      ? '“Four storms nearly sank her. Begin with the one that took my mainmast, then the rest as they struck, wrapping round.”'
      : '“Four storms nearly sank her. Their days, in the order they struck, open me.”';
    const p = b.puzzle({
      module: this.id,
      name: "Captain's sea chest",
      act: o.act,
      area: o.area,
      mission: o.mission,
      prop: 'chest',
      look: `An iron-bound sea chest with four number dials. The brass plate reads: ${plate}`,
      interaction: { type: 'code', digits: 4, prompt: plate },
      solution: { type: 'code', value: code },
      requires: { clues: [logbook.id], puzzles: o.gate },
      reward: o.reward,
      solvedText: `The sea chest creaks open. ${o.rewardText}`,
      hints: [
        `The sea chest wants the days of four storms. The captain records everything.`,
        small
          ? `Find the four storm entries in the logbook. Start with the mainmast storm and carry on in date order, wrapping round.`
          : `Find the four storm entries in the logbook and read their days in date order.`,
        `The code is ${code}.`,
      ],
      estMinutes: 6,
      wrongPenalty: 10,
    });
    return p.id;
  },
};

export const wheelBearings: ModuleSpec = {
  id: 'wheel_bearings',
  name: "Ship's wheel bearings",
  bands: ['small', 'mid', 'big'],
  acts: [4],
  minPlayers: 1,
  build(b, o) {
    const count = b.style === 'small' ? 3 : 2;
    const bearings: number[] = [];
    while (bearings.length < count) {
      const v = b.rng.int(0, 23) * 15;
      if (!bearings.includes(v) && (bearings.length === 0 || Math.abs(bearings[bearings.length - 1] - v) >= 45)) bearings.push(v);
    }
    const chart = b.clue({
      kind: 'chart',
      title: 'Sea chart with pencilled course',
      area: o.source,
      look: 'A sea chart with a course pencilled through the reefs.',
      navigatorOnly: true,
      content: {
        text:
          'Pencilled in Blackwater’s hand — the only safe channel through the reef:\n' +
          bearings.map((v, i) => `${i + 1}. Bear ${String(v).padStart(3, '0')}°`).join('\n'),
      },
      revealedBy: o.gate,
    });
    const p = b.puzzle({
      module: this.id,
      name: "Ship's wheel",
      act: o.act,
      area: o.area,
      mission: o.mission,
      prop: 'wheel',
      look: 'The great ship’s wheel, beside a binnacle compass. The reef is close.',
      interaction: { type: 'dial', count, step: 15, prompt: `Steer through the reef: set ${count} bearings in order.` },
      solution: { type: 'dial', value: bearings },
      requires: { clues: [chart.id], puzzles: o.gate },
      reward: o.reward,
      solvedText: `The Crimson Gull heels through the reef channel. ${o.rewardText}`,
      hints: [
        `The wheel needs a safe course through the reef — the captain charted one.`,
        `The sea chart in ${b.areaLong(o.source)} lists the bearings (a Navigator can read it).`,
        `Steer ${bearings.map((v) => v + '°').join(', then ')}.`,
      ],
      estMinutes: 4,
      wrongPenalty: 20,
    });
    return p.id;
  },
};

export const cannonSequence: ModuleSpec = {
  id: 'cannon_sequence',
  name: 'Cannon sequence',
  bands: ['mid', 'big'],
  acts: [4],
  minPlayers: 2,
  build(b, o) {
    const marks = b.rng.sample(SYMBOL_IDS, 4);
    const order = b.rng.shuffle(marks);
    const orders = b.clue({
      kind: 'note',
      title: 'Gunnery orders',
      area: o.source,
      look: 'Orders for the gun crews, sealed with red wax.',
      content: {
        text:
          'SIGNAL TO THE FLEET — fire the deck guns in this order, a different gunner at each:\n' +
          order.map((s, i) => `${i + 1}. ${glyphLabel(s)} gun`).join('\n'),
        glyphs: order,
      },
      revealedBy: o.gate,
    });
    const p = b.puzzle({
      module: this.id,
      name: 'Signal cannons',
      act: o.act,
      area: o.area,
      mission: o.mission,
      prop: 'cannons',
      look: 'Four deck guns, each with a painted symbol on its carriage.',
      interaction: {
        type: 'stations',
        stations: marks.map((s) => ({ id: s, label: `${GLYPHS[s].name} gun`, symbol: s })),
        prompt: 'Fire the guns in the signalled order. Each shot must come from a different gunner than the last.',
      },
      solution: { type: 'stations', value: order },
      requires: { clues: [orders.id], puzzles: o.gate },
      reward: o.reward,
      minPlayers: 2,
      solvedText: `BOOM — BOOM — BOOM — BOOM! The signal rolls across the waves and Blackwater's men dive for cover. ${o.rewardText}`,
      hints: [
        `The four deck guns must be fired in a set order, by different gunners.`,
        `The gunnery orders are in ${b.areaLong(o.source)}.`,
        `Fire ${order.map((s) => GLYPHS[s].name).join(' → ')}, switching gunner each shot.`,
      ],
      estMinutes: 4,
      wrongPenalty: 15,
    });
    return p.id;
  },
};

type Constraint = { text: string; test: (h: string) => boolean; kind: string };
const ANGLE: Record<string, number> = { N: 0, NE: 45, E: 90, SE: 135, S: 180, SW: 225, W: 270, NW: 315 };
const COMP: Record<string, string> = { N: 'north', E: 'east', S: 'south', W: 'west' };

export function headingConstraints(answer: string): Constraint[] {
  const out: Constraint[] = [];
  for (const c of ['N', 'E', 'S', 'W']) {
    if (answer.includes(c))
      out.push({ kind: 'incl', text: `Port Haven lies somewhere ${COMP[c]}ward of us.`, test: (h) => h.includes(c) });
    else
      out.push({
        kind: 'excl',
        text: `Reefs to the ${COMP[c]}! Any course with even a touch of ${COMP[c]} in it will rip our hull open.`,
        test: (h) => !h.includes(c),
      });
  }
  const diag = answer.length === 2;
  out.push(
    diag
      ? { kind: 'diag', text: 'The wind will only let us sail between two points of the compass — never straight N, E, S or W.', test: (h) => h.length === 2 }
      : { kind: 'diag', text: 'The current only allows a true cardinal heading: N, E, S or W, nothing in between.', test: (h) => h.length === 1 },
  );
  for (const h of HEADINGS) {
    if (h === answer) continue;
    out.push({ kind: 'not', text: `Whatever you do, never steer ${HEADING_NAMES[h]} — that is the course to the Isle of Bones.`, test: (x) => x !== h });
    const d = Math.min(Math.abs(ANGLE[h] - ANGLE[answer]), 360 - Math.abs(ANGLE[h] - ANGLE[answer]));
    if (d <= 90)
      out.push({
        kind: 'near',
        text: `Haven is no more than a quarter-turn (90°) from ${HEADING_NAMES[h]}.`,
        test: (x) => Math.min(Math.abs(ANGLE[h] - ANGLE[x]), 360 - Math.abs(ANGLE[h] - ANGLE[x])) <= 90,
      });
  }
  return out;
}

export const headingVote: ModuleSpec = {
  id: 'heading_vote',
  name: 'Heading vote',
  bands: ['big'],
  acts: [4],
  minPlayers: 3,
  build(b, o) {
    const answer = b.rng.pick(HEADINGS);
    const cands = b.rng.shuffle(headingConstraints(answer));
    let chosen: Constraint[] = [];
    search: for (let i = 0; i < cands.length; i++)
      for (let j = i + 1; j < cands.length; j++)
        for (let k = j + 1; k < cands.length; k++) {
          const set = [cands[i], cands[j], cands[k]];
          if (new Set(set.map((c) => c.kind)).size < 2) continue;
          const left = HEADINGS.filter((h) => set.every((c) => c.test(h)));
          if (left.length === 1 && left[0] === answer) {
            chosen = set;
            break search;
          }
        }
    if (!chosen.length) throw new Error('heading constraints failed');
    const areas = [o.source, o.source2 ?? o.area, o.area];
    const titles = ['Torn page of the master’s log', 'Note from the lookout', 'Scrap of a pilot’s letter'];
    const clueIds = chosen.map((c, i) =>
      b.clue({
        kind: i === 0 ? 'logbook' : 'note',
        title: titles[i],
        area: areas[i],
        look: 'A water-stained scrap of paper about the course to Port Haven.',
        content: { text: `Evidence ${i + 1} of 3: ${c.text}` },
        revealedBy: o.gate,
      }).id,
    );
    const p = b.puzzle({
      module: this.id,
      name: 'Heading vote',
      act: o.act,
      area: o.area,
      mission: o.mission,
      prop: 'navTable',
      look: 'The navigation table, with eight brass pegs around a compass rose. The crew must agree on a heading to Port Haven.',
      interaction: {
        type: 'vote',
        options: HEADINGS.map((h) => ({ id: h, label: HEADING_NAMES[h] })),
        prompt: 'Vote on the heading to Port Haven. Most of the crew must agree; a wrong course costs time.',
      },
      solution: { type: 'vote', value: answer },
      requires: { clues: clueIds, puzzles: o.gate },
      reward: o.reward,
      minPlayers: 3,
      simultaneous: true,
      solvedText: `The crew agrees: ${HEADING_NAMES[answer]}! The bow swings toward Port Haven. ${o.rewardText}`,
      hints: [
        `Three scraps of evidence about the course are spread across the ship. Gather them before voting.`,
        `Evidence is in ${[...new Set(areas)].map((a) => b.areaLong(a)).join(', ')}. Each one rules some headings out.`,
        `The heading is ${HEADING_NAMES[answer]}.`,
      ],
      estMinutes: 6,
      wrongPenalty: 60,
    });
    return p.id;
  },
};

export const lowerLifeboat: ModuleSpec = {
  id: 'lower_lifeboat',
  name: 'Lower the lifeboat',
  bands: ['small', 'mid', 'big'],
  acts: [4],
  minPlayers: 2,
  build(b, o) {
    const needed = b.style === 'small' ? 2 : b.style === 'mid' ? 3 : 4;
    const p = b.puzzle({
      module: this.id,
      name: 'Lifeboat davits',
      act: o.act,
      area: o.area,
      mission: o.mission,
      prop: 'davit',
      look: `The lifeboat hangs from two davits. ${needed} sailors must work the falls at once or it will tip.`,
      interaction: {
        type: 'sync',
        needed,
        windowMs: 1500,
        verb: 'Lower away!',
        prompt: `${needed} crewmates must lower together.`,
      },
      solution: { type: 'sync' },
      requires: { puzzles: o.gate },
      reward: o.reward,
      minPlayers: needed,
      simultaneous: true,
      solvedText: `The lifeboat splashes down alongside. ${o.rewardText}`,
      hints: [
        `The lifeboat must be lowered evenly by ${needed} people at once.`,
        `Gather ${needed} crewmates at the davits.`,
        `Everyone at the davits press “Lower away!” within a second and a half of each other.`,
      ],
      estMinutes: 2,
    });
    return p.id;
  },
};
