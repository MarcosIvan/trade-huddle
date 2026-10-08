/**
 * This week's outlook: how many points each player should score in one
 * specific game. It starts from the player's value (points per game from here
 * on), then adjusts for the opponent (what that defense allows to the
 * position), for how the player has done against similar defenses, and blends
 * in Sleeper's own weekly projection. Byes and injuries are applied last.
 * Where a week holds several games (the NBA's game days), each game left to
 * play is rated that way and the week counts his best one (`bestGame`).
 */
import type { ModelParams } from "../sports/types";
import { weekPeriods } from "./periods";
import { makeScorer } from "./scoring";
import type { LeagueSettings, Model, Player, StatsFile } from "./types";

/** One game of the week: its period (week or game day), opponent and expected points. */
export interface GameOutlook {
  period: number;
  opponent: string;
  home: boolean;
  /** Opponent's points-allowed factor for the position (1 = average defense). */
  matchup: number;
  /** Expected points in this game, availability included. */
  pts: number;
}

export interface WeeklyOutlook {
  /**
   * Expected points this week (0 on a bye or when out): the game's, or with
   * several games the best one's (bestGame).
   */
  pts: number;
  /** The first game's opponent (team code), or null on a bye. */
  opponent: string | null;
  home: boolean;
  /** The first game's matchup factor (1 = average defense). */
  matchup: number;
  bye: boolean;
  /** Chance of playing each game, from the injury report. */
  availability: number;
  /** Every game left this week, in order: one in the NFL, two to four in the NBA. */
  games: GameOutlook[];
}

/** Opponent of each team in a week, and whether the team is at home. */
export function opponents(
  stats: StatsFile,
  week: number,
): Map<string, { opponent: string; home: boolean }> {
  const out = new Map<string, { opponent: string; home: boolean }>();
  for (const game of stats.schedule?.[String(week)] ?? []) {
    const [away, home] = game;
    if (!away || !home) continue;
    out.set(away, { opponent: home, home: false });
    out.set(home, { opponent: away, home: true });
  }
  return out;
}

/**
 * How many points each defense allows to each position, relative to the
 * league average (1 = average), from the games played so far. Few games mean
 * a noisy number, so each factor is pulled toward 1 by `shrink` games.
 */
export function defenseFactors(
  model: Model,
  stats: StatsFile,
  shrink: number,
): Map<string, Map<string, number>> {
  const allowed = new Map<string, Map<string, number>>();
  const games = new Map<string, number>();
  for (const week of stats.weeks) {
    const opp = opponents(stats, week);
    // A defense "played" a week when players of its opponent have games that week.
    const playedThisWeek = new Set<string>();
    for (const p of Object.values(model.players)) {
      const w = p.weekly.find((x) => x.week === week);
      const team = stats.players[p.id]?.tw?.[String(week)];
      if (!w || w.pts === null || !team) continue;
      const defense = opp.get(team)?.opponent;
      if (!defense) continue;
      playedThisWeek.add(defense);
      const byPos = allowed.get(defense) ?? new Map<string, number>();
      byPos.set(p.pos, (byPos.get(p.pos) ?? 0) + w.pts);
      allowed.set(defense, byPos);
    }
    for (const d of playedThisWeek) games.set(d, (games.get(d) ?? 0) + 1);
  }

  // League average points allowed per game, by position.
  const leagueAvg = new Map<string, number>();
  const positions = new Set([...allowed.values()].flatMap((m) => [...m.keys()]));
  for (const pos of positions) {
    let sum = 0;
    let n = 0;
    for (const [defense, byPos] of allowed) {
      sum += byPos.get(pos) ?? 0;
      n += games.get(defense) ?? 0;
    }
    if (n) leagueAvg.set(pos, sum / n);
  }

  const factors = new Map<string, Map<string, number>>();
  for (const [defense, byPos] of allowed) {
    const g = games.get(defense) ?? 0;
    const f = new Map<string, number>();
    for (const [pos, avg] of leagueAvg) {
      if (avg <= 0 || !g) continue;
      const raw = (byPos.get(pos) ?? 0) / g / avg;
      f.set(pos, (g * raw + shrink) / (g + shrink));
    }
    factors.set(defense, f);
  }
  return factors;
}

/** Games of "neutral" result mixed into the similar-defense factor. */
const SIMILAR_SHRINK = 3;
/** Defenses within this factor distance count as similar. */
const SIMILAR_RANGE = 0.15;

/**
 * How the player did, relative to his usual output, in past games against
 * defenses that allow about as much to his position as this week's opponent.
 */
function similarDefenseFactor(
  player: Player,
  base: number,
  stats: StatsFile,
  oppByWeek: ReadonlyMap<number, Map<string, { opponent: string; home: boolean }>>,
  factors: Map<string, Map<string, number>>,
  target: number,
): number {
  if (base <= 0) return 1;
  const ratios: number[] = [];
  for (const w of player.weekly) {
    if (w.pts === null) continue;
    const team = stats.players[player.id]?.tw?.[String(w.week)];
    const defense = team ? oppByWeek.get(w.week)?.get(team)?.opponent : undefined;
    const f = defense ? factors.get(defense)?.get(player.pos) : undefined;
    if (f === undefined || Math.abs(f - target) > SIMILAR_RANGE) continue;
    ratios.push(Math.max(0, w.pts) / base);
  }
  const sum = ratios.reduce((s, r) => s + r, 0);
  return (sum + SIMILAR_SHRINK) / (ratios.length + SIMILAR_SHRINK);
}

/** Expected points for every player in one week. */
export function weeklyOutlook(
  model: Model,
  stats: StatsFile,
  league: LeagueSettings,
  week: number,
  params: ModelParams,
  /** Several games a week count only the best one (the NBA), not their sum. */
  bestGame = false,
): Map<string, WeeklyOutlook> {
  const score = makeScorer(stats.keys, league.scoring_settings);
  // Game days already played this week are done; only the games left count.
  const lastPlayed = Math.max(0, ...stats.weeks);
  const periods =
    stats.period === "day"
      ? weekPeriods(stats, week).filter((d) => d > lastPlayed)
      : weekPeriods(stats, week);
  const oppByPeriod = new Map(periods.map((d) => [d, opponents(stats, d)] as const));
  const factors = defenseFactors(model, stats, params.matchupShrinkGames);
  const oppByWeek = new Map(stats.weeks.map((w) => [w, opponents(stats, w)] as const));
  const out = new Map<string, WeeklyOutlook>();
  for (const p of Object.values(model.players)) {
    const availability = p.noTeam ? 0 : p.inj ? (params.weekAvailability[p.inj] ?? 1) : 1;
    // Value without the season-long injury discount: this week's availability replaces it.
    const base = p.injMult > 0 ? p.value / p.injMult : p.value;
    const games: GameOutlook[] = [];
    for (const period of periods) {
      const game = p.team ? oppByPeriod.get(period)?.get(p.team) : undefined;
      if (!game) continue;
      const matchup = factors.get(game.opponent)?.get(p.pos) ?? 1;
      let pts = base * matchup ** params.matchupWeight;
      if (params.similarWeight > 0) {
        const similar = similarDefenseFactor(p, base, stats, oppByWeek, factors, matchup);
        pts *= similar ** params.similarWeight;
      }
      const projected = stats.players[p.id]?.wp?.[String(period)];
      if (projected && params.weekProjWeight > 0) {
        pts = (1 - params.weekProjWeight) * pts + params.weekProjWeight * score(projected);
      }
      games.push({
        period,
        opponent: game.opponent,
        home: game.home,
        matchup,
        pts: Math.max(0, pts * availability),
      });
    }
    const first = games[0];
    out.set(p.id, {
      pts: bestGame
        ? Math.max(0, ...games.map((g) => g.pts))
        : games.reduce((sum, g) => sum + g.pts, 0),
      opponent: first?.opponent ?? null,
      home: first?.home ?? false,
      matchup: first?.matchup ?? 1,
      bye: !first,
      availability,
      games,
    });
  }
  return out;
}
