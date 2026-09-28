import type { SportConfig } from "../sports/types";
import { average } from "./scoring";
import type { ReplacementLevels, Valued } from "./types";

/**
 * Replacement level per position: every team in the league fills its starting
 * slots (fixed positions first, then flex from narrowest to widest), keeps
 * some bench depth, and the average of the best players left over is what a
 * free agent is worth.
 */
export function replacementLevels(
  players: readonly Valued[],
  slots: readonly string[],
  teams: number,
  sport: SportConfig,
): ReplacementLevels {
  const byPos: Record<string, Valued[]> = {};
  for (const pl of players) (byPos[pl.pos] ??= []).push(pl);
  for (const list of Object.values(byPos)) list.sort((a, b) => b.value - a.value);

  const counts: Record<string, number> = {};
  for (const s of slots) counts[s] = (counts[s] ?? 0) + 1;
  const eligible = (slot: string) => sport.slotEligibility[slot] ?? [];
  const order = Object.keys(counts).sort((a, b) => eligible(a).length - eligible(b).length);

  const sorted = [...players].sort((a, b) => b.value - a.value);
  const taken = new Set<string>();
  for (const slot of order) {
    let need = (counts[slot] ?? 0) * teams;
    const el = eligible(slot);
    for (const pl of sorted) {
      if (!need) break;
      if (!taken.has(pl.id) && pl.startable && pl.elig.some((e) => el.includes(e))) {
        taken.add(pl.id);
        need--;
      }
    }
  }

  // Bench depth: the best remaining players at each position are kept on benches.
  for (const pos of sport.positions) {
    let need = Math.round((sport.model.benchDepth[pos] ?? 0) * teams);
    for (const pl of byPos[pos] ?? []) {
      if (!need) break;
      if (!taken.has(pl.id) && pl.startable) {
        taken.add(pl.id);
        need--;
      }
    }
  }

  const repl: Record<string, number> = {};
  for (const pos of sport.positions) {
    const left = (byPos[pos] ?? [])
      .filter((pl) => !taken.has(pl.id) && pl.startable)
      .slice(0, sport.model.replacementPool)
      .map((pl) => pl.value);
    repl[pos] = average(left) ?? 0;
  }
  return repl;
}
