// Cage modules: usable in Act 1 (and some in Act 2).
import type { ModuleSpec } from '../builder.ts';
import { GLYPHS, KNOTS, SYMBOL_IDS, glyphLabel } from '../theme.ts';

export const wallSymbols: ModuleSpec = {
  id: 'wall_symbols',
  name: 'Wall symbols',
  bands: ['small', 'mid', 'big'],
  acts: [1],
  minPlayers: 2,
  build(b, o) {
    const answer = b.rng.sample(SYMBOL_IDS, 4);
    const small = b.style === 'small';
    let text: string;
    if (small) {
      // Tight variant: symbols are scrambled, notches give the order.
      const shuffled = b.rng.shuffle(answer.map((s, i) => ({ s, notches: i + 1 })));
      text =
        'Four symbols are scratched deep into the planks, each with a row of notches beneath it:\n' +
        shuffled.map((x) => `${glyphLabel(x.s)} — ${'|'.repeat(x.notches)} (${x.notches} notch${x.notches > 1 ? 'es' : ''})`).join('\n') +
        '\nSomeone has carved underneath: “fewest cuts first”.';
    } else {
      text = 'Scratched into the planks by some desperate prisoner, left to right:\n' + answer.map(glyphLabel).join('   ');
    }
    const clue = b.clue({
      kind: 'carving',
      title: 'Scratched carving',
      area: o.source,
      look: 'Something is scratched into the wall planks here.',
      content: { text, glyphs: small ? undefined : answer },
      revealedBy: o.gate,
    });
    const wheels = b.rng.shuffle(SYMBOL_IDS);
    const p = b.puzzle({
      module: this.id,
      name: 'Symbol padlock',
      act: o.act,
      area: o.area,
      mission: o.mission,
      prop: 'symbolLock',
      look: 'A heavy padlock with four wheels of carved symbols.',
      interaction: { type: 'symbols', slots: 4, symbols: wheels, prompt: 'Turn the four symbol wheels.' },
      solution: { type: 'symbols', value: answer },
      requires: { clues: [clue.id], puzzles: o.gate },
      reward: o.reward,
      solvedText: `The symbol padlock in ${b.areaName(o.area)} clicks open. ${o.rewardText}`,
      hints: [
        `The symbol padlock in ${b.areaLong(o.area)} needs four symbols. Someone in ${b.areaLong(o.source)} should search their walls.`,
        small
          ? `The carving in ${b.areaLong(o.source)} lists symbols with notches. Order them by the number of notches, fewest first.`
          : `The scratches in ${b.areaLong(o.source)} read left to right — call them out across the hold.`,
        `Set the wheels to: ${answer.map(glyphLabel).join(', ')}.`,
      ],
      estMinutes: 4,
      wrongPenalty: 0,
    });
    return p.id;
  },
};

export const ropeHook: ModuleSpec = {
  id: 'rope_hook',
  name: 'Rope and hook',
  bands: ['small', 'mid', 'big'],
  acts: [1],
  minPlayers: 2,
  build(b, o) {
    const rope = b.item({
      kind: 'rope',
      name: 'Coil of rope',
      desc: 'A length of tarred rope, frayed at one end. Long enough to throw a loop.',
      area: o.source,
      revealedBy: o.gate,
    });
    const p = b.puzzle({
      module: this.id,
      name: 'Key on the hook',
      act: o.act,
      area: o.area,
      mission: o.mission,
      prop: 'hook',
      look: 'A key dangles from a hook just beyond the bars — far out of reach of any arm.',
      interaction: { type: 'useItem', accepts: 'rope', prompt: 'You need something long to snag the hook.' },
      solution: { type: 'useItem', value: rope.id },
      requires: { items: [rope.id], puzzles: o.gate },
      reward: o.reward,
      solvedText: `A rope loop snags the hook and the key swings in to ${b.areaName(o.area)}. ${o.rewardText}`,
      hints: [
        `The key on the hook outside ${b.areaLong(o.area)} is out of reach. Something long could snag it.`,
        `There is a coil of rope in ${b.areaLong(o.source)}. Pass or throw it across.`,
        `Bring the rope from ${b.areaLong(o.source)} to ${b.areaLong(o.area)}, select it, and use it on the hook.`,
      ],
      estMinutes: 3,
    });
    return p.id;
  },
};

export const sailorsKnots: ModuleSpec = {
  id: 'knots',
  name: "Sailor's knots",
  bands: ['small', 'mid', 'big'],
  acts: [1, 2],
  minPlayers: 2,
  build(b, o) {
    const tags = b.rng.sample(SYMBOL_IDS, KNOTS.length);
    const knots = b.rng.shuffle(KNOTS);
    const table = tags.map((t, i) => [glyphLabel(t) + ` (${GLYPHS[t].colorName})`, knots[i]]);
    const which = b.rng.int(0, tags.length - 1);
    const tag = tags[which];
    const answer = knots[which];
    const chart = b.clue({
      kind: 'note',
      title: "Bosun's knot chart",
      area: o.source,
      look: 'A greasy chart of knots is nailed to a beam.',
      content: { text: 'BOSUN’S RULE — each shackle tag calls for its own knot:', table: [['Tag', 'Knot'], ...table] },
      revealedBy: o.gate,
    });
    const p = b.puzzle({
      module: this.id,
      name: 'Knotted shackle',
      act: o.act,
      area: o.area,
      mission: o.mission,
      prop: 'knotPost',
      look: `A shackle bound by a rope post. A tag marked ${glyphLabel(tag)} (${GLYPHS[tag].colorName}) hangs from it.`,
      interaction: {
        type: 'choice',
        options: KNOTS.map((k) => ({ id: k, label: k, icon: k })),
        prompt: `The tag reads ${glyphLabel(tag)}. Tie the right knot to release the shackle.`,
      },
      solution: { type: 'choice', value: answer },
      requires: { clues: [chart.id], puzzles: o.gate },
      reward: o.reward,
      solvedText: `The ${answer.toLowerCase()} holds and the shackle springs free. ${o.rewardText}`,
      hints: [
        `The knotted shackle in ${b.areaLong(o.area)} wants a particular knot. The tag on it matters.`,
        `${b.areaLong(o.source)} has the bosun’s knot chart. Find the row for the ${GLYPHS[tag].name} tag.`,
        `Tie a ${answer}.`,
      ],
      estMinutes: 4,
      wrongPenalty: 15,
    });
    return p.id;
  },
};

export const brokenCompass: ModuleSpec = {
  id: 'compass',
  name: 'Broken compass',
  bands: ['small', 'mid', 'big'],
  acts: [1, 2],
  minPlayers: 2,
  build(b, o) {
    const bearing = b.rng.int(1, 23) * 15;
    const code = String(bearing).padStart(3, '0');
    const needle = b.item({
      kind: 'needle',
      name: 'Compass needle',
      desc: 'A slim magnetised needle, painted red at the north end.',
      area: o.source,
      revealedBy: o.gate,
    });
    const housing = b.puzzle({
      module: this.id,
      name: 'Needleless compass',
      act: o.act,
      area: o.area,
      mission: o.mission,
      prop: 'compass',
      look: 'A brass compass housing bolted down. Its needle is missing.',
      interaction: { type: 'useItem', accepts: 'needle', prompt: 'The compass has no needle.' },
      solution: { type: 'useItem', value: needle.id },
      requires: { items: [needle.id], puzzles: o.gate },
      solvedText: `The needle drops into the compass in ${b.areaName(o.area)} and swings to ${bearing}°.`,
      hints: [
        `The compass in ${b.areaLong(o.area)} is missing its needle.`,
        `The needle is in ${b.areaLong(o.source)}.`,
        `Pass the compass needle from ${b.areaLong(o.source)} and use it on the compass.`,
      ],
      estMinutes: 2,
    });
    const reading = b.clue({
      kind: 'reveal',
      title: 'Compass reading',
      area: o.area,
      look: 'The repaired compass.',
      attachedTo: housing.id,
      content: { text: `The needle steadies and points to ${bearing}° on the brass rose.` },
      revealedBy: [housing.id],
    });
    const lock = b.puzzle({
      module: this.id,
      name: 'Compass-rose lock',
      act: o.act,
      area: o.area,
      mission: o.mission,
      prop: 'codeLock',
      look: 'A lock engraved with a compass rose and three number dials: “Follow the needle.”',
      interaction: { type: 'code', digits: 3, prompt: '“Follow the needle.” Set three digits.' },
      solution: { type: 'code', value: code },
      requires: { clues: [reading.id], puzzles: [housing.id] },
      reward: o.reward,
      solvedText: `The compass-rose lock turns to ${code} and opens. ${o.rewardText}`,
      hints: [
        `The compass-rose lock in ${b.areaLong(o.area)} wants the bearing the repaired compass shows.`,
        `Read the repaired compass. Write the bearing as three digits.`,
        `The code is ${code}.`,
      ],
      estMinutes: 2,
    });
    return lock.id;
  },
};
