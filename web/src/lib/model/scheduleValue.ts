/**
 * Rest-of-season value adjusted for the opponents left, for the positions
 * whose schedule shows up in later points: the NFL's team defenses (ADR 0034).
 * What an offense gives to defenses (sacks, turnovers, few points) holds up
 * through a season; what a defense allows to players does not (ADR 0026), so
 * players keep their value as is.
 */
import type { ModelParams, ScheduleValueRule } from "../sports/types";
import { periodsLeft } from "./schedule";
import type { LeagueSettings, Model, StatsFile } from "./types";
import { defenseFactors, opponents } from "./weekly";

/**
 * One position's values: pulled toward the position's average (`regress`),
 * then scaled by the opponents' average factor (`elasticity`).
 */
export function adjustForSchedule(
  value: number,
  average: number,
  factor: number,
  rule: ScheduleValueRule,
): number {
  return Math.max(0, (average + rule.regress * (value - average)) * factor ** rule.elasticity);
}

/**
 * The new value of every player at a position with a schedule rule. Empty
 * before the season's first games: the rule was fitted on weeks 3 to 12.
 */
export function scheduleValues(
  model: Pick<Model, "players">,
  stats: StatsFile,
  league: LeagueSettings,
  params: Pick<ModelParams, "scheduleValue" | "matchupShrinkGames" | "matchupShrinkByPos">,
): Map<string, number> {
  const out = new Map<string, number>();
  const rules = Object.entries(params.scheduleValue);
  if (!rules.length || !stats.weeks.length) return out;
  const factors = defenseFactors(
    model,
    stats,
    params.matchupShrinkGames,
    params.matchupShrinkByPos,
  );
  const { regular, playoffs } = periodsLeft(stats, league);
  const left = new Map<string, string[]>();
  for (const period of [...regular, ...playoffs]) {
    for (const [team, game] of opponents(stats, period)) {
      left.set(team, [...(left.get(team) ?? []), game.opponent]);
    }
  }
  for (const [pos, rule] of rules) {
    const players = Object.values(model.players).filter((p) => p.pos === pos && !p.noTeam);
    if (!players.length) continue;
    const average = players.reduce((s, p) => s + p.value, 0) / players.length;
    for (const p of players) {
      const opps = left.get(p.team) ?? [];
      const factor = opps.length
        ? opps.reduce((s, o) => s + (factors.get(o)?.get(pos) ?? 1), 0) / opps.length
        : 1;
      out.set(p.id, adjustForSchedule(p.value, average, factor, rule));
    }
  }
  return out;
}
