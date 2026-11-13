/**
 * The league's trade report: every completed trade and who is winning it,
 * two ways. "Value today" is what each side received is worth now (trade
 * value, the same sums as the analyzer's fairness: in an uneven two-team
 * trade the extra players count EXTRA_PLAYER_WEIGHT). "Points since" is what
 * those players scored for their new team since the trade, counting only
 * the weeks they started for it.
 */
import { tradeSides } from "./trades";

/** One team's side of a trade: what it received. */
export interface TradeSideIn {
  rid: number;
  players: string[];
  /** Draft picks received, e.g. "2027 round 2". */
  picks: string[];
  /** FAAB dollars received. */
  faab: number;
}

export interface LeagueTrade {
  id: string;
  /** The week it went through. */
  week: number;
  /** When, in milliseconds since 1970. */
  created: number;
  sides: TradeSideIn[];
}

/** One team's week, as Sleeper's matchups list it. */
export interface StartedWeek {
  rid: number;
  starters: readonly string[];
  playersPoints: Readonly<Record<string, number>>;
}

export interface ReportSide extends TradeSideIn {
  /** What the players received are worth today. */
  value: number;
  /** What they scored as starters for this team since the trade. */
  points: number;
}

export interface ReportTrade {
  id: string;
  week: number;
  created: number;
  sides: ReportSide[];
  /** The side ahead on value today, or null when even. */
  valueLeader: number | null;
  /** The side ahead on points since, or null when even (or no week played yet). */
  pointsLeader: number | null;
}

/** Differences smaller than this are a draw. */
const EVEN = 0.05;

function leader(sides: readonly ReportSide[], measure: (s: ReportSide) => number): number | null {
  const sorted = [...sides].sort((a, b) => measure(b) - measure(a));
  const [first, second] = sorted;
  if (!first || !second || measure(first) - measure(second) < EVEN) return null;
  return first.rid;
}

/**
 * Each trade with what each side received, its value today and its points
 * since: `weeks` holds every week's lineups with final scores, `value`
 * gives a player's trade value today (0 for unknown players).
 */
export function tradeReport(
  trades: readonly LeagueTrade[],
  weeks: ReadonlyMap<number, readonly StartedWeek[]>,
  value: (playerId: string) => number,
): ReportTrade[] {
  return trades.map((t) => {
    const values = t.sides.map((s) => s.players.map(value));
    const totals =
      values.length === 2
        ? tradeSides(values[0]!, values[1]!)
        : values.map((list) => list.reduce((sum, v) => sum + v, 0));
    const sides = t.sides.map((s, i) => {
      let points = 0;
      for (const [week, lineups] of weeks) {
        if (week < t.week) continue;
        const mine = lineups.find((l) => l.rid === s.rid);
        if (!mine) continue;
        for (const id of s.players) {
          if (mine.starters.includes(id)) points += mine.playersPoints[id] ?? 0;
        }
      }
      return { ...s, value: totals[i] ?? 0, points };
    });
    const played = [...weeks.keys()].some((w) => w >= t.week);
    return {
      id: t.id,
      week: t.week,
      created: t.created,
      sides,
      valueLeader: leader(sides, (s) => s.value),
      pointsLeader: played ? leader(sides, (s) => s.points) : null,
    };
  });
}
