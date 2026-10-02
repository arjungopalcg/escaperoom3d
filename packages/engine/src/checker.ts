import { MIN_PLAYERS } from './layout.ts';
import type { PuzzleDef, Scenario } from './types.ts';

export interface CheckResult {
  ok: boolean;
  errors: string[];
  /** Order in which a perfect crew could solve the puzzles. */
  order: string[];
  estMinutes: number;
}

export const TARGET_MINUTES = { min: 30, max: 60 };

/** Direct puzzle prerequisites of a puzzle: gates, inputs' reveals and area unlocks. */
export function puzzleDeps(s: Scenario, p: PuzzleDef): Set<string> {
  const deps = new Set<string>(p.requires.puzzles);
  const area = (id: string) => s.areas.find((a) => a.id === id)?.unlockedBy ?? [];
  if (!p.auto) area(p.area).forEach((d) => deps.add(d));
  const addItem = (id: string) => {
    const it = s.items.find((i) => i.id === id);
    if (!it) return;
    it.revealedBy.forEach((d) => deps.add(d));
    if (it.combinedFrom) it.combinedFrom.forEach(addItem);
    else area(it.area).forEach((d) => deps.add(d));
  };
  p.requires.items.forEach(addItem);
  for (const cid of p.requires.clues) {
    const c = s.clues.find((x) => x.id === cid);
    if (!c) continue;
    c.revealedBy.forEach((d) => deps.add(d));
    area(c.area).forEach((d) => deps.add(d));
  }
  deps.delete(p.id);
  return deps;
}

/**
 * Simulates the dependency graph to confirm the run can be completed, that no cage starts
 * blocked, that no puzzle hides its own inputs, and that the estimated time is near target.
 */
export function checkScenario(s: Scenario, playersIn?: number): CheckResult {
  const players = Math.max(MIN_PLAYERS, playersIn ?? s.layout.players);
  const errors: string[] = [];
  const byId = new Map(s.puzzles.map((p) => [p.id, p]));

  // 1. References are valid.
  for (const p of s.puzzles) {
    for (const i of p.requires.items) if (!s.items.some((x) => x.id === i)) errors.push(`${p.id} needs missing item ${i}`);
    for (const c of p.requires.clues) if (!s.clues.some((x) => x.id === c)) errors.push(`${p.id} needs missing clue ${c}`);
    for (const q of p.requires.puzzles) if (!byId.has(q)) errors.push(`${p.id} needs missing puzzle ${q}`);
  }

  // 2. No puzzle needs something placed behind itself (no cycles through its own outputs).
  const depsMap = new Map(s.puzzles.map((p) => [p.id, puzzleDeps(s, p)]));
  for (const p of s.puzzles) {
    const seen = new Set<string>();
    const stack = [...depsMap.get(p.id)!];
    while (stack.length) {
      const d = stack.pop()!;
      if (d === p.id) {
        errors.push(`${p.name} (${p.id}) depends on its own output`);
        break;
      }
      if (seen.has(d)) continue;
      seen.add(d);
      stack.push(...(depsMap.get(d) ?? []));
    }
  }

  // 3. Simulate play.
  const solved = new Set<string>();
  const order: string[] = [];
  const areaOpen = (id: string) => (s.areas.find((a) => a.id === id)?.unlockedBy ?? []).every((d) => solved.has(d));
  const itemOk = (id: string): boolean => {
    const it = s.items.find((i) => i.id === id);
    if (!it || !it.revealedBy.every((d) => solved.has(d))) return false;
    if (it.combinedFrom) return it.combinedFrom.every(itemOk);
    return areaOpen(it.area);
  };
  const clueOk = (id: string): boolean => {
    const c = s.clues.find((x) => x.id === id);
    return !!c && c.revealedBy.every((d) => solved.has(d)) && areaOpen(c.area);
  };
  let changed = true;
  while (changed) {
    changed = false;
    for (const p of s.puzzles) {
      if (solved.has(p.id)) continue;
      if (!p.auto && !areaOpen(p.area)) continue;
      if (!p.requires.puzzles.every((d) => solved.has(d))) continue;
      if (!p.requires.items.every(itemOk)) continue;
      if (!p.requires.clues.every(clueOk)) continue;
      if (p.minPlayers > players) continue;
      solved.add(p.id);
      order.push(p.id);
      changed = true;
    }
  }
  for (const p of s.puzzles) if (!solved.has(p.id)) errors.push(`unsolvable: ${p.name} (${p.id}${p.optional ? ', optional' : ''})`);
  if (!solved.has(s.finalPuzzle)) errors.push('the lifeboat can never be lowered');

  // 4. Every cage has something to do and something another cage needs.
  const act1 = s.puzzles.filter((p) => p.act === 1);
  for (const cage of s.cages) {
    const here = act1.filter((p) => p.area === cage.area);
    if (!here.some((p) => p.requires.puzzles.length === 0)) errors.push(`${cage.name} starts with nothing to do`);
    const inputsFrom = (p: PuzzleDef) => [
      ...p.requires.items.map((i) => s.items.find((x) => x.id === i)?.area),
      ...p.requires.clues.map((c) => s.clues.find((x) => x.id === c)?.area),
    ];
    const needsOther = here.some((p) => inputsFrom(p).some((a) => a && a !== cage.area));
    if (!needsOther) errors.push(`${cage.name} can open without help from another cage`);
    const givesOther = act1.some((p) => p.area !== cage.area && inputsFrom(p).includes(cage.area));
    if (!givesOther) errors.push(`${cage.name} holds nothing another cage needs`);
  }

  // 5. Time estimate: longest dependency chain vs. total work spread over the crew.
  const finish = new Map<string, number>();
  const ft = (id: string, guard = 0): number => {
    if (finish.has(id)) return finish.get(id)!;
    if (guard > 200) return 0;
    const p = byId.get(id)!;
    let start = 0;
    for (const d of depsMap.get(id) ?? []) if (byId.has(d)) start = Math.max(start, ft(d, guard + 1));
    const f = start + p.estMinutes;
    finish.set(id, f);
    return f;
  };
  const required = s.puzzles.filter((p) => !p.optional);
  const crit = Math.max(...required.map((p) => ft(p.id)));
  const work = required.reduce((a, p) => a + p.estMinutes, 0);
  const workers = Math.max(1, players / 2.5);
  const factor = { small: 1.2, mid: 1.3, big: 1.45 }[s.layout.style];
  const estMinutes = Math.round(Math.max(crit, work / workers) * factor + 3);
  if (estMinutes < TARGET_MINUTES.min || estMinutes > TARGET_MINUTES.max)
    errors.push(`estimated ${estMinutes} min is far off the 45-minute target`);

  return { ok: errors.length === 0, errors, order, estMinutes };
}
