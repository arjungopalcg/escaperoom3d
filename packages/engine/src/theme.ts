// Pirate theme skin: wording, glyphs and story details. Puzzle logic lives in modules.
import type { Role, SymbolId } from './types.ts';

export interface Glyph {
  id: SymbolId;
  char: string;
  name: string;
  color: string;
  colorName: string;
}

// Every glyph pairs a colour with a distinct shape so colour is never the only cue.
export const GLYPHS: Record<SymbolId, Glyph> = {
  anchor: { id: 'anchor', char: '⚓', name: 'Anchor', color: '#4f8fe8', colorName: 'blue' },
  skull: { id: 'skull', char: '☠', name: 'Skull', color: '#e8e2d0', colorName: 'bone-white' },
  star: { id: 'star', char: '★', name: 'Star', color: '#f2c94c', colorName: 'gold' },
  moon: { id: 'moon', char: '☾', name: 'Moon', color: '#b9c3d6', colorName: 'silver' },
  trident: { id: 'trident', char: '♆', name: 'Trident', color: '#2bb3a3', colorName: 'teal' },
  swords: { id: 'swords', char: '⚔', name: 'Crossed swords', color: '#e05a47', colorName: 'red' },
  sun: { id: 'sun', char: '☀', name: 'Sun', color: '#f2994a', colorName: 'orange' },
  crown: { id: 'crown', char: '♛', name: 'Crown', color: '#a879e0', colorName: 'purple' },
};
export const SYMBOL_IDS = Object.keys(GLYPHS) as SymbolId[];

export function glyphLabel(id: SymbolId): string {
  const g = GLYPHS[id];
  return `${g.char} ${g.name}`;
}

export const CAGE_SKINS: { name: string; colorName: string; color: string; emblem: SymbolId }[] = [
  { name: 'Bilge Cage', colorName: 'green lantern', color: '#4caf50', emblem: 'anchor' },
  { name: 'Powder Cage', colorName: 'red lantern', color: '#e0503c', emblem: 'swords' },
  { name: 'Rat Cage', colorName: 'amber lantern', color: '#f0a020', emblem: 'sun' },
  { name: 'Chain Cage', colorName: 'blue lantern', color: '#3d7fe0', emblem: 'trident' },
  { name: 'Bow Cage', colorName: 'violet lantern', color: '#9c5fe0', emblem: 'crown' },
];

export const AREA_NAMES: Record<string, string> = {
  hold: 'the Hold',
  quarters: "the Captain's Quarters",
  deck: 'the Main Deck',
};

export const MISSION_NAMES: Record<string, string> = {
  pump: 'Pump out the hold',
  rigging: 'Repair the rigging',
  lifeboat: 'Fix the lifeboat',
  map: 'Decode the map',
};

export const KNOTS = ['Bowline', 'Clove hitch', 'Figure-eight', 'Reef knot', 'Sheet bend', 'Sheepshank'] as const;

export const ROLE_INFO: Record<Role, { name: string; blurb: string }> = {
  captain: { name: 'Captain', blurb: 'Ring the ship’s bell (hold B) to broadcast your voice to the whole crew.' },
  navigator: { name: 'Navigator', blurb: 'Only you can make sense of tidal charts and sea charts.' },
  quartermaster: { name: 'Quartermaster', blurb: 'You carry six items instead of three and throw twice as far.' },
  bosun: { name: 'Bosun', blurb: 'Your strength counts double on ropes, capstans and davits.' },
  lookout: { name: 'Lookout', blurb: 'Your spyglass reads distant markings and spots glints others miss.' },
  deckhand: { name: 'Deckhand', blurb: 'An honest mutineer. Talk, pass, solve.' },
};

export const TREASURE_SPOTS: { id: string; name: string; riddles: string[] }[] = [
  {
    id: 'figurehead',
    name: 'Behind the figurehead',
    riddles: [
      'She looks forever ahead and never blinks; my gold sleeps behind her wooden heart.',
      'The lady at the prow keeps my secret closer than any wife.',
    ],
  },
  {
    id: 'mainmast',
    name: 'At the foot of the mainmast',
    riddles: [
      'The tallest tree aboard has roots of gold.',
      'Where every sail begins, my fortune ends — dig at the timber’s foot.',
    ],
  },
  {
    id: 'anchor',
    name: 'Inside the anchor locker',
    riddles: [
      'What holds the ship still holds my riches too.',
      'Iron sleeps coiled in its locker; beneath the chain, the shine.',
    ],
  },
  {
    id: 'cannon',
    name: 'In the bow-chaser cannon',
    riddles: [
      'My loudest friend at the bow swallows coin instead of shot.',
      'The gun that speaks first in battle has a belly full of doubloons.',
    ],
  },
  {
    id: 'barrel',
    name: 'In the false-bottomed rum barrel',
    riddles: [
      'Drink deep, but the bottom of the barrel is not where you think.',
      'The crew never noticed the rum cask is a hand shorter inside than out.',
    ],
  },
];

export const ALLIES: { id: string; name: string; tell: string; sign: string }[] = [
  { id: 'cook', name: 'Old Saltpan the cook', tell: 'The note smells of onions and burnt fat.', sign: '— a friend in the galley' },
  { id: 'cabinboy', name: 'Pip the cabin boy', tell: 'The handwriting is round and childish.', sign: '— P.' },
  { id: 'firstmate', name: 'Mr. Grimes, the first mate', tell: 'The note is sealed with tar from the quarterdeck.', sign: '— one who stands near the wheel' },
  { id: 'carpenter', name: 'Chips the carpenter', tell: 'Sawdust falls out of the folded note.', sign: '— someone who mends what the captain breaks' },
];

export const PARROT_CHATTER = [
  'Rrrawk! Blackwater’s a cheat! A cheat!',
  'Pretty bird! Pretty bird wants a biscuit!',
  'Water’s rising! Rising! Squawk!',
  'Who’s a mutineer? You’s a mutineer!',
  'Fifteen men on a dead man’s chest! Rrrawk!',
  'Abandon ship! Abandon… just kidding! Squawk!',
  'The cook stole the cheese! The cheese!',
  'Isle of Bones! Bones! Bones!',
];

export const PARROT_PAIRS: { question: string; phrase: string; word: string }[] = [
  { question: 'What does the captain fear most?', phrase: 'Squawk! Blackwater fears the KRAKEN! Fears the KRAKEN!', word: 'KRAKEN' },
  { question: 'What is the captain’s ship-cat called?', phrase: 'Here, MOGGY! Here, MOGGY! Rrrawk! Where’s the cat?', word: 'MOGGY' },
  { question: 'Where does the captain hide his rum?', phrase: 'Rum in the BILGE! Rum in the BILGE! Don’t tell! Squawk!', word: 'BILGE' },
  { question: 'Who does the captain toast every night?', phrase: 'To MOTHER! To MOTHER! Hic! Rrrawk!', word: 'MOTHER' },
  { question: 'What did the captain name his sword?', phrase: 'Fetch me MERCY, boy! MERCY! Squawk!', word: 'MERCY' },
  { question: 'What is the captain’s favourite food?', phrase: 'Pass the TURNIP! TURNIP! Rrrawk! Lovely turnip!', word: 'TURNIP' },
  { question: 'What did the captain lose overboard?', phrase: 'Lost his WIG! Lost his WIG! Ha ha! Squawk!', word: 'WIG' },
];

export const RELAY_WORDS = ['GALLEON', 'CUTLASS', 'BOWLINE', 'MAROON', 'SEAGULL', 'TEMPEST', 'HARBOUR', 'PLUNDER', 'LANTERN'];

export const HEADINGS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'] as const;
export const HEADING_NAMES: Record<string, string> = {
  N: 'North',
  NE: 'North-east',
  E: 'East',
  SE: 'South-east',
  S: 'South',
  SW: 'South-west',
  W: 'West',
  NW: 'North-west',
};

export const CAPTAIN_LINES = {
  start:
    'BLACKWATER (from above deck): Enjoy your cages, mutineers! By dawn you’ll be marooned on the Isle of Bones — if the sea doesn’t take you first!',
  act2: 'BLACKWATER: What’s that racket below? Bosun! Check the hold! …Bosun? Blast this storm!',
  act3: 'BLACKWATER: Stay out of my quarters, you bilge rats! My logbook is none of your business!',
  act4: 'BLACKWATER: Mutiny! On deck, all hands! Stop them before they reach the boat!',
  lowWater: 'BLACKWATER: Hear that? The sea wants you. I can wait.',
  lost: 'BLACKWATER: Down you go. Pity — you’d have fetched a fine price on the Isle.',
};

/** Opening narration, one line per intro video shot (~8 s each). Keys name the optional voice files. */
export const PROLOGUE: { key: string; who: 'narrator' | 'captain'; text: string }[] = [
  { key: 'intro-1', who: 'narrator', text: 'The Crimson Gull. Fastest ship on the Saltmarsh Sea — and the cruellest captain ever to sail her: Elias Blackwater.' },
  { key: 'intro-2', who: 'narrator', text: 'Three nights ago, you and your shipmates rose against him. You had the numbers. He had the keys.' },
  { key: 'intro-3', who: 'narrator', text: 'Now you wake in iron cages in his hold, bound for the Isle of Bones, where mutineers are left for the crabs.' },
  { key: 'intro-4', who: 'captain', text: 'Enjoy your cages, mutineers! By dawn you’ll be marooned on the Isle of Bones — if the sea doesn’t take you first!' },
  { key: 'intro-5', who: 'narrator', text: 'Then the storm struck. A reef tore open the hull, and the sea came in. The water is rising.' },
  { key: 'intro-6', who: 'narrator', text: 'But someone aboard is on your side. A note slides through the floorboards: “Trust each other. Every lock has its key in another cage.”' },
  { key: 'intro-7', who: 'narrator', text: 'Break out together. Take back the ship. Nobody escapes alone.' },
];

/** Closing narration for each ending. */
export const EPILOGUES: Record<'escape' | 'treasure' | 'lost', string> = {
  escape: 'The lifeboat pulls away as the Crimson Gull rolls beneath the waves, Blackwater still shaking his fist at the rail. Every one of you made it.',
  treasure: 'You row for Port Haven with every soul aboard — and Blackwater’s gold at your feet. Somewhere behind you, a captain howls at the storm.',
  lost: 'The lanterns gutter out one by one as the sea fills the hold. The Isle of Bones will never see you. Neither will anyone else.',
};

/** Which recorded voice file (media/voice/<key>.mp3) speaks a given line, if any. */
export function voiceKeyFor(text: string): string | undefined {
  const clean = text.replace(/^BLACKWATER( \([^)]*\))?:\s*/, '').trim();
  for (const [k, v] of Object.entries(CAPTAIN_LINES)) if (v.replace(/^BLACKWATER( \([^)]*\))?:\s*/, '') === clean) return `captain-${k}`;
  for (const p of PROLOGUE) if (p.text === clean) return p.key;
  for (const [k, v] of Object.entries(EPILOGUES)) if (v === clean) return `ending-${k}`;
  for (const p of PARROT_PAIRS) if (p.phrase === clean) return `parrot-${p.word.toLowerCase()}`;
  const i = PARROT_CHATTER.indexOf(clean);
  if (i >= 0) return `parrot-chatter-${i + 1}`;
  return undefined;
}
