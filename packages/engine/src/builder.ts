import type { Rng } from './rng.ts';
import type {
  Act,
  AreaDef,
  AreaId,
  ClueDef,
  ItemDef,
  Layout,
  PuzzleDef,
  Reward,
  Secret,
  StyleBand,
} from './types.ts';
import { AREA_NAMES, CAGE_SKINS } from './theme.ts';

export interface BuildOpts {
  act: Act;
  /** Where the lock / interactive prop sits. */
  area: AreaId;
  /** Where the information or object it needs is placed. */
  source: AreaId;
  /** A third area for modules that split inputs further (falls back to source). */
  source2?: AreaId;
  /** Puzzles that must be solved first; this module's inputs appear once they are. */
  gate: string[];
  mission?: string;
  reward: Reward;
  /** Story text appended when the final puzzle of the module is solved. */
  rewardText: string;
}

export interface ModuleSpec {
  id: string;
  name: string;
  bands: StyleBand[];
  acts: Act[];
  minPlayers: number;
  /** Build into the scenario; return the id of the module's final puzzle. */
  build(b: Builder, o: BuildOpts): string;
}

export class Builder {
  items: ItemDef[] = [];
  clues: ClueDef[] = [];
  puzzles: PuzzleDef[] = [];
  private counter = 0;
  private used = new Map<AreaId, Set<number>>();

  constructor(
    public rng: Rng,
    public layout: Layout,
    public secret: Secret,
    public areas: AreaDef[],
    public connectedMin = layout.players,
  ) {}

  get style(): StyleBand {
    return this.layout.style;
  }

  id(prefix: string): string {
    return `${prefix}${++this.counter}`;
  }

  /** Reserve a random free placement slot in an area. */
  slot(area: AreaId): number {
    const def = this.areas.find((a) => a.id === area);
    if (!def) throw new Error(`unknown area ${area}`);
    let set = this.used.get(area);
    if (!set) this.used.set(area, (set = new Set()));
    const free: number[] = [];
    for (let i = 0; i < def.slots; i++) if (!set.has(i)) free.push(i);
    if (!free.length) throw new Error(`no free slot in ${area}`);
    const s = this.rng.pick(free);
    set.add(s);
    return s;
  }

  areaName(area: AreaId): string {
    if (area.startsWith('cage')) return `the ${CAGE_SKINS[Number(area.slice(4))].name}`;
    return AREA_NAMES[area] ?? area;
  }

  /** Long form used in hints, e.g. "the Bilge Cage (green lantern)". */
  areaLong(area: AreaId): string {
    if (area.startsWith('cage')) {
      const c = CAGE_SKINS[Number(area.slice(4))];
      return `the ${c.name} (${c.colorName})`;
    }
    return this.areaName(area);
  }

  item(d: Omit<ItemDef, 'id' | 'slot' | 'revealedBy'> & { revealedBy?: string[]; slot?: number }): ItemDef {
    const it: ItemDef = { ...d, id: this.id('i'), slot: d.slot ?? this.slot(d.area), revealedBy: d.revealedBy ?? [] };
    this.items.push(it);
    return it;
  }

  clue(d: Omit<ClueDef, 'id' | 'slot' | 'revealedBy'> & { revealedBy?: string[]; slot?: number }): ClueDef {
    const c: ClueDef = { ...d, id: this.id('c'), slot: d.slot ?? (d.attachedTo ? -1 : this.slot(d.area)), revealedBy: d.revealedBy ?? [] };
    this.clues.push(c);
    return c;
  }

  puzzle(
    d: Omit<PuzzleDef, 'id' | 'slot' | 'requires' | 'reward' | 'minPlayers' | 'simultaneous' | 'optional' | 'auto' | 'wrongPenalty'> & {
      requires?: Partial<PuzzleDef['requires']>;
      reward?: Reward;
      minPlayers?: number;
      simultaneous?: boolean;
      optional?: boolean;
      auto?: boolean;
      wrongPenalty?: number;
      slot?: number;
    },
  ): PuzzleDef {
    const p: PuzzleDef = {
      ...d,
      id: this.id('p'),
      slot: d.slot ?? (d.prop === 'gate' ? -1 : this.slot(d.area)),
      requires: { items: d.requires?.items ?? [], clues: d.requires?.clues ?? [], puzzles: d.requires?.puzzles ?? [] },
      reward: d.reward ?? {},
      minPlayers: d.minPlayers ?? 1,
      simultaneous: d.simultaneous ?? false,
      optional: d.optional ?? false,
      auto: d.auto ?? false,
      wrongPenalty: d.wrongPenalty ?? 0,
    };
    this.puzzles.push(p);
    return p;
  }
}
