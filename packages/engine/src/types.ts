// Theme-independent data model for a generated run.
// The 3D client maps areas/slots/props to geometry; the server enforces rules.

export type AreaId = string; // 'cage0'..'cage4' | 'hold' | 'quarters' | 'deck'
export type StyleBand = 'small' | 'mid' | 'big';
export type Act2Structure = 'chain' | 'split' | 'parallel';
export type Act = 1 | 2 | 3 | 4;

export interface Layout {
  players: number;
  cages: number;
  /** Crew-size label from the cage layout table. */
  crewLabel: 'Small' | 'Small to mid' | 'Mid to big' | 'Big';
  act2: Act2Structure;
  /** Puzzle style band (small 4-6, mid 7-10, big 11-15). */
  style: StyleBand;
  /** Number of players placed in each cage. */
  perCage: number[];
}

export type SymbolId = 'anchor' | 'skull' | 'star' | 'moon' | 'trident' | 'swords' | 'sun' | 'crown';

export type Role = 'captain' | 'navigator' | 'quartermaster' | 'bosun' | 'lookout' | 'deckhand';

export type ItemKind = 'rope' | 'needle' | 'lantern' | 'tinderbox' | 'litLantern' | 'key' | 'brassKey' | 'weight';

export type ClueKind =
  | 'carving' // scratched into a wall
  | 'note' // paper note
  | 'chart' // tidal / sea chart (navigator)
  | 'logbook'
  | 'letter'
  | 'parrot' // spoken by the parrot
  | 'slate'
  | 'fragment' // message relay fragment (lookout)
  | 'map'
  | 'reveal'; // text revealed by solving a puzzle (e.g. compass bearing)

export type PropKind =
  | 'symbolLock'
  | 'hook'
  | 'knotPost'
  | 'compass'
  | 'codeLock'
  | 'wordLock'
  | 'parchment'
  | 'scale'
  | 'valves'
  | 'speakingTube'
  | 'chest'
  | 'wheel'
  | 'cannons'
  | 'navTable'
  | 'capstan'
  | 'davit'
  | 'stash'
  | 'gate';

export interface ClueContent {
  text: string;
  glyphs?: SymbolId[];
  table?: string[][];
}

export interface ItemDef {
  id: string;
  kind: ItemKind;
  name: string;
  desc: string;
  area: AreaId;
  slot: number;
  /** Puzzles that must be solved before the item appears in the world. */
  revealedBy: string[];
  /** Two items that combine into this one: [a, b] ids. */
  combinedFrom?: [string, string];
}

export interface ClueDef {
  id: string;
  kind: ClueKind;
  title: string;
  area: AreaId;
  slot: number;
  revealedBy: string[];
  content: ClueContent;
  /** A short in-world description of the prop holding the clue. */
  look: string;
  /** Clue is read from a distance by the Lookout (spyglass). */
  lookoutReadable?: boolean;
  /** Clue can only be read by the Navigator while one is connected. */
  navigatorOnly?: boolean;
  /** For reveal clues: shown where the source puzzle sits (no prop). */
  attachedTo?: string;
}

export type Interaction =
  | { type: 'code'; digits: number; prompt: string }
  | { type: 'word'; letters: number; prompt: string }
  | { type: 'symbols'; slots: number; symbols: SymbolId[]; prompt: string }
  | { type: 'choice'; options: { id: string; label: string; icon?: string }[]; prompt: string }
  | { type: 'subset'; options: { id: string; label: string; marks: number }[]; prompt: string }
  | { type: 'sequence'; buttons: { id: string; label: string; symbol: SymbolId }[]; length: number; prompt: string }
  | { type: 'dial'; count: number; step: number; prompt: string }
  | { type: 'useItem'; accepts: ItemKind; prompt: string }
  | { type: 'sync'; needed: number; windowMs: number; verb: string; prompt: string; cycle?: number }
  | { type: 'stations'; stations: { id: string; label: string; symbol: SymbolId }[]; prompt: string }
  | { type: 'vote'; options: { id: string; label: string }[]; prompt: string }
  | { type: 'gate' };

export type Solution =
  | { type: 'code'; value: string }
  | { type: 'word'; value: string }
  | { type: 'symbols'; value: SymbolId[] }
  | { type: 'choice'; value: string }
  | { type: 'subset'; value: string[] }
  | { type: 'sequence'; value: string[] }
  | { type: 'dial'; value: number[] }
  | { type: 'useItem'; value: string }
  | { type: 'sync'; cue?: number }
  | { type: 'stations'; value: string[] }
  | { type: 'vote'; value: string }
  | { type: 'gate' };

export interface Reward {
  openCage?: number;
  unlockArea?: AreaId;
}

export interface PuzzleDef {
  id: string;
  module: string;
  name: string;
  act: Act;
  area: AreaId;
  slot: number;
  mission?: string;
  prop: PropKind;
  /** In-world description shown when looking at the prop. */
  look: string;
  interaction: Interaction;
  solution: Solution;
  requires: { items: string[]; clues: string[]; puzzles: string[] };
  reward: Reward;
  /** Story text shown to everyone when solved. */
  solvedText: string;
  /** Tiered hints: nudge, stronger clue, answer. */
  hints: [string, string, string];
  minPlayers: number;
  simultaneous: boolean;
  estMinutes: number;
  optional: boolean;
  /** Gate nodes are solved automatically once their requirements are met. */
  auto: boolean;
  /** Penalty in seconds for a wrong answer (water surges). */
  wrongPenalty: number;
}

export interface AreaDef {
  id: AreaId;
  name: string;
  /** Puzzles that unlock interaction in this area for everyone. Empty = open from the start for occupants. */
  unlockedBy: string[];
  slots: number;
}

export interface CageInfo {
  index: number;
  area: AreaId;
  name: string;
  colorName: string;
  color: string;
  emblem: SymbolId;
  lockPuzzle: string;
}

export interface MissionInfo {
  id: string;
  name: string;
  puzzles: string[];
}

export interface Secret {
  treasureSpot: string;
  treasureSpotName: string;
  ally: string;
  allyName: string;
  allyTell: string;
  summary: string;
}

export interface Scenario {
  seed: number;
  layout: Layout;
  secret: Secret;
  areas: AreaDef[];
  cages: CageInfo[];
  missions: MissionInfo[];
  items: ItemDef[];
  clues: ClueDef[];
  puzzles: PuzzleDef[];
  /** Puzzle that lowers the lifeboat; when solved, players may board. */
  finalPuzzle: string;
  treasurePuzzle: string;
  /** Gate puzzles in act order: act2, act3, act4. */
  gates: { act2: string; act3: string; act4: string };
  parrotChatter: string[];
  captainLines: { start: string; act2: string; act3: string; act4: string; lowWater: string; lost: string };
  estMinutes: number;
  durationMinutes: number;
  attempts: number;
}

/** Client-safe view of a puzzle (no solution). */
export type PublicPuzzle = Omit<PuzzleDef, 'solution' | 'hints'> & { hintCount: number };
export type PublicClue = Omit<ClueDef, 'content'>;
