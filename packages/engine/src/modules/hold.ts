// Hold modules: Act 2 missions (some reused in Acts 3-4).
import type { ModuleSpec } from '../builder.ts';
import { GLYPHS, PARROT_PAIRS, RELAY_WORDS, SYMBOL_IDS, glyphLabel } from '../theme.ts';

export const lanternInk: ModuleSpec = {
  id: 'lantern_ink',
  name: 'Lantern and invisible ink',
  bands: ['small', 'mid', 'big'],
  acts: [2, 3],
  minPlayers: 1,
  build(b, o) {
    const digits = Array.from({ length: 4 }, () => b.rng.int(0, 9)).join('');
    const lantern = b.item({
      kind: 'lantern',
      name: 'Unlit lantern',
      desc: 'A storm lantern with a dry wick. It needs a flame.',
      area: o.source,
      revealedBy: o.gate,
    });
    const tinder = b.item({
      kind: 'tinderbox',
      name: 'Tinderbox',
      desc: 'Flint, steel and a pinch of dry char cloth. Combine it with something that burns.',
      area: o.source2 ?? o.source,
      revealedBy: o.gate,
    });
    const lit = b.item({
      kind: 'litLantern',
      name: 'Lit lantern',
      desc: 'A lantern burning hot and bright. Old sailors say heat wakes hidden ink.',
      area: o.source,
      slot: -1,
      revealedBy: o.gate,
      combinedFrom: [lantern.id, tinder.id],
    });
    const parchment = b.puzzle({
      module: this.id,
      name: 'Blank map',
      act: o.act,
      area: o.area,
      mission: o.mission,
      prop: 'parchment',
      look: 'A map pinned to the timbers — curiously blank, but it smells faintly of lemon.',
      interaction: { type: 'useItem', accepts: 'litLantern', prompt: 'The parchment is blank. Perhaps heat would help.' },
      solution: { type: 'useItem', value: lit.id },
      requires: { items: [lit.id], puzzles: o.gate },
      solvedText: `Brown letters bloom across the map in ${b.areaName(o.area)} as the lantern warms it.`,
      hints: [
        `The blank map in ${b.areaLong(o.area)} smells of lemon. Invisible ink needs heat.`,
        `Combine the lantern (${b.areaLong(o.source)}) with the tinderbox (${b.areaLong(o.source2 ?? o.source)}) to light it.`,
        `Light the lantern by combining it with the tinderbox, then use the lit lantern on the blank map.`,
      ],
      estMinutes: 4,
    });
    const msg = b.clue({
      kind: 'reveal',
      title: 'Hidden ink',
      area: o.area,
      look: 'The heated map.',
      attachedTo: parchment.id,
      content: { text: `Revealed in brown ink: “My strongbox answers only to ${digits.split('').join('-')}. — B.”` },
      revealedBy: [parchment.id],
    });
    const lock = b.puzzle({
      module: this.id,
      name: 'Captain’s strongbox',
      act: o.act,
      area: o.area,
      mission: o.mission,
      prop: 'codeLock',
      look: 'An iron strongbox with four brass number dials, stamped with a “B”.',
      interaction: { type: 'code', digits: 4, prompt: 'Four brass dials.' },
      solution: { type: 'code', value: digits },
      requires: { clues: [msg.id], puzzles: [parchment.id] },
      reward: o.reward,
      solvedText: `The strongbox opens to ${digits}. ${o.rewardText}`,
      hints: [
        `The strongbox in ${b.areaLong(o.area)} belongs to Blackwater. He signed a message about it.`,
        `Read the hidden ink on the heated map.`,
        `The code is ${digits}.`,
      ],
      estMinutes: 2,
      wrongPenalty: 10,
    });
    return lock.id;
  },
};

function subsetsSumming(weights: number[], target: number): number[][] {
  const out: number[][] = [];
  const n = weights.length;
  for (let m = 1; m < 1 << n; m++) {
    let s = 0;
    const idx: number[] = [];
    for (let i = 0; i < n; i++) if (m & (1 << i)) (s += weights[i]), idx.push(i);
    if (s === target) out.push(idx);
  }
  return out;
}

export const barrelBalance: ModuleSpec = {
  id: 'barrel_balance',
  name: 'Barrel balance',
  bands: ['small', 'mid'],
  acts: [2],
  minPlayers: 1,
  build(b, o) {
    let weights: number[] = [];
    let target = 0;
    let pick: number[] = [];
    for (let tries = 0; tries < 200; tries++) {
      weights = Array.from({ length: 6 }, () => b.rng.int(2, 13));
      pick = b.rng.sample([0, 1, 2, 3, 4, 5], 3);
      target = pick.reduce((s, i) => s + weights[i], 0);
      if (subsetsSumming(weights, target).length === 1) break;
    }
    const glyphs = b.rng.sample(SYMBOL_IDS, 6);
    const options = weights.map((w, i) => ({ id: glyphs[i], label: `${glyphLabel(glyphs[i])} barrel`, marks: w }));
    const small = b.style === 'small';
    const slateText = small
      ? `TRAPDOOR SCALE. The pan must carry exactly the stone of the ship's guns — ${Math.floor(target / 2)} long guns and ${target - Math.floor(target / 2)} swivel guns, one stone apiece. Not a pebble more.`
      : `TRAPDOOR SCALE — load exactly ${target} stone. Not a pebble more.`;
    const slate = b.clue({
      kind: 'slate',
      title: 'Chalk slate',
      area: o.source,
      look: 'A chalk slate hangs on a nail, scrawled with numbers.',
      content: { text: slateText },
      revealedBy: o.gate,
    });
    const p = b.puzzle({
      module: this.id,
      name: 'Barrel scale',
      act: o.act,
      area: o.area,
      mission: o.mission,
      prop: 'scale',
      look: 'A great scale pan chained to a trapdoor. Six barrels stand beside it, each notched with marks.',
      interaction: {
        type: 'subset',
        options,
        prompt: 'Roll barrels onto the pan. Each notch on a barrel is one stone.',
      },
      solution: { type: 'subset', value: pick.map((i) => glyphs[i]).sort() },
      requires: { clues: [slate.id], puzzles: o.gate },
      reward: o.reward,
      solvedText: `The scale settles and the trapdoor grinds open. ${o.rewardText}`,
      hints: [
        `The scale in ${b.areaLong(o.area)} needs an exact weight. A slate somewhere names it.`,
        `The slate is in ${b.areaLong(o.source)}. The pan needs exactly ${target} stone; count each barrel's notches.`,
        `Load the ${pick.map((i) => GLYPHS[glyphs[i]].name).join(', ')} barrels.`,
      ],
      estMinutes: 5,
      wrongPenalty: 15,
    });
    return p.id;
  },
};

export const tidalValves: ModuleSpec = {
  id: 'tidal_valves',
  name: 'Tidal valves',
  bands: ['mid', 'big'],
  acts: [2],
  minPlayers: 2,
  build(b, o) {
    const valves = b.rng.sample(SYMBOL_IDS, 5);
    const length = b.style === 'big' ? 5 : 4;
    const order = b.rng.sample(valves, length);
    const chart = b.clue({
      kind: 'chart',
      title: 'Tidal chart',
      area: o.source,
      look: 'A tidal chart covered in curling lines and numbered symbols.',
      navigatorOnly: true,
      content: {
        text:
          'To drain the bilge against a flooding tide, open the sea-valves in this order:\n' +
          order.map((s, i) => `${i + 1}. ${glyphLabel(s)} (${GLYPHS[s].colorName})`).join('\n'),
        glyphs: order,
      },
      revealedBy: o.gate,
    });
    const p = b.puzzle({
      module: this.id,
      name: 'Bilge valves',
      act: o.act,
      area: o.area,
      mission: o.mission,
      prop: 'valves',
      look: 'A bank of five bilge valves, each wheel marked with a coloured symbol.',
      interaction: {
        type: 'sequence',
        buttons: valves.map((v) => ({ id: v, label: `${GLYPHS[v].name} valve`, symbol: v })),
        length,
        prompt: `Open ${length} valves in the right order. A wrong valve floods the line and resets it.`,
      },
      solution: { type: 'sequence', value: order },
      requires: { clues: [chart.id], puzzles: o.gate },
      reward: o.reward,
      solvedText: `The valves gurgle in sequence and the pumps draw the bilge down. ${o.rewardText}`,
      hints: [
        `The valves in ${b.areaLong(o.area)} must be opened in a particular order.`,
        `The tidal chart in ${b.areaLong(o.source)} gives the order (a Navigator reads charts best).`,
        `Open: ${order.map((s) => GLYPHS[s].name).join(' → ')}.`,
      ],
      estMinutes: 5,
      wrongPenalty: 20,
    });
    return p.id;
  },
};

export const parrotPhrase: ModuleSpec = {
  id: 'parrot_phrase',
  name: 'Parrot phrase',
  bands: ['small', 'mid', 'big'],
  acts: [2, 3],
  minPlayers: 1,
  build(b, o) {
    const pair = b.rng.pick(PARROT_PAIRS);
    const parrot = b.clue({
      kind: 'parrot',
      title: 'Captain’s parrot',
      area: o.source,
      look: 'A scruffy green parrot eyes you from a perch. Click it to make it talk.',
      content: { text: pair.phrase },
      revealedBy: o.gate,
    });
    const p = b.puzzle({
      module: this.id,
      name: 'Riddle lock',
      act: o.act,
      area: o.area,
      mission: o.mission,
      prop: 'wordLock',
      look: `A letter lock engraved: “${pair.question}”`,
      interaction: { type: 'word', letters: pair.word.length, prompt: `“${pair.question}” (${pair.word.length} letters)` },
      solution: { type: 'word', value: pair.word },
      requires: { clues: [parrot.id], puzzles: o.gate },
      reward: o.reward,
      solvedText: `“${pair.word}”. The letter lock falls open — the parrot looks smug. ${o.rewardText}`,
      hints: [
        `Only someone who lives with the captain would know the answer to the riddle lock in ${b.areaLong(o.area)}.`,
        `Talk to the parrot in ${b.areaLong(o.source)} — it repeats whatever it hears.`,
        `The word is ${pair.word}.`,
      ],
      estMinutes: 4,
      wrongPenalty: 10,
    });
    return p.id;
  },
};

export const synchronisedHaul: ModuleSpec = {
  id: 'sync_haul',
  name: 'Synchronised haul',
  bands: ['big'],
  acts: [2, 4],
  minPlayers: 3,
  build(b, o) {
    const needed = Math.max(3, Math.min(5, Math.ceil(b.layout.players / 3)));
    const cue = b.rng.int(2, 5);
    const chant = b.clue({
      kind: 'note',
      title: 'Bosun’s chant',
      area: o.source,
      look: 'A sheet of shanty verses pinned near a lantern.',
      content: {
        text: `HAULING CHANT\nThe drum beats one to five, then starts again.\nAll hands heave together on beat ${cue} — never before, never after.`,
      },
      revealedBy: o.gate,
    });
    const p = b.puzzle({
      module: this.id,
      name: o.act === 4 ? 'Mainsail halyard' : 'Grate capstan',
      act: o.act,
      area: o.area,
      mission: o.mission,
      prop: 'capstan',
      look: `A heavy capstan with ${needed} bars. One sailor can't budge it. A drum thumps a count of five.`,
      interaction: {
        type: 'sync',
        needed,
        windowMs: 1000,
        verb: 'Heave!',
        cycle: 5,
        prompt: `${needed} hands must heave together on the right drum beat.`,
      },
      solution: { type: 'sync', cue },
      requires: { clues: [chant.id], puzzles: o.gate },
      reward: o.reward,
      minPlayers: needed,
      simultaneous: true,
      solvedText: `${needed} crewmates heave as one and it groans into motion. ${o.rewardText}`,
      hints: [
        `The capstan in ${b.areaLong(o.area)} needs ${needed} people heaving at the same moment.`,
        `The bosun's chant in ${b.areaLong(o.source)} names the drum beat to heave on.`,
        `Gather ${needed} crewmates and all heave on beat ${cue}.`,
      ],
      estMinutes: 3,
    });
    return p.id;
  },
};

export const messageRelay: ModuleSpec = {
  id: 'message_relay',
  name: 'Message relay',
  bands: ['big'],
  acts: [2, 3],
  minPlayers: 3,
  build(b, o) {
    const word = b.rng.pick(RELAY_WORDS);
    const positions = b.rng.shuffle(word.split('').map((_, i) => i));
    const parts = 3;
    const groups: number[][] = Array.from({ length: parts }, () => []);
    positions.forEach((pos, i) => groups[i % parts].push(pos));
    const fragAreas = [o.source, o.source2 ?? o.source, o.area];
    const clueIds: string[] = [];
    groups.forEach((g, gi) => {
      const shown = word
        .split('')
        .map((ch, i) => (g.includes(i) ? ch : '_'))
        .join(' ');
      const c = b.clue({
        kind: 'fragment',
        title: `Message fragment ${gi + 1} of ${parts}`,
        area: fragAreas[gi],
        look: 'Painted letters on a beam, half washed away. A lookout could read them from afar.',
        lookoutReadable: true,
        content: { text: `Painted on the beam (fragment ${gi + 1} of ${parts}):\n${shown}` },
        revealedBy: o.gate,
      });
      clueIds.push(c.id);
    });
    const p = b.puzzle({
      module: this.id,
      name: 'Speaking-tube lock',
      act: o.act,
      area: o.area,
      mission: o.mission,
      prop: 'speakingTube',
      look: `A brass speaking tube with a ${word.length}-letter password ring. “Only the full watchword opens the way.”`,
      interaction: { type: 'word', letters: word.length, prompt: `Spell the ${word.length}-letter watchword.` },
      solution: { type: 'word', value: word },
      requires: { clues: clueIds, puzzles: o.gate },
      reward: o.reward,
      minPlayers: 3,
      solvedText: `“${word}!” The speaking tube rattles and a bolt slides back. ${o.rewardText}`,
      hints: [
        `The watchword for the speaking tube is painted in ${parts} pieces around the ship. Relay them.`,
        `Fragments are in ${[...new Set(fragAreas)].map((a) => b.areaLong(a)).join(', ')}. Each shows different letters of the same word.`,
        `The watchword is ${word}.`,
      ],
      estMinutes: 6,
      wrongPenalty: 10,
    });
    return p.id;
  },
};
