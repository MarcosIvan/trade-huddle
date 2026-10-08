/**
 * What the trade analyzer says about a trade beyond the fairness meter: what
 * each side gains or loses, and what happens to roster spots in an uneven
 * trade (the free agents to add).
 */
import { fmt } from "../format";
import type { TradeResult } from "./trades";
import type { Player, Valued } from "./types";

/** What one side gains or loses: what it receives minus what it sends. */
export interface SideChange {
  trade: number;
  ppg: number;
  last: number;
}

/** Received minus sent, in trade value (with the side discount), points per game and last games. */
export function sideChange(
  sGet: number,
  sGive: number,
  get: readonly Player[],
  give: readonly Player[],
): SideChange {
  const sum = (list: readonly Player[], f: (p: Player) => number) =>
    list.reduce((s, p) => s + f(p), 0);
  return {
    trade: sGet - sGive,
    ppg: sum(get, (p) => p.value) - sum(give, (p) => p.value),
    last: sum(get, (p) => p.lastAvg ?? 0) - sum(give, (p) => p.lastAvg ?? 0),
  };
}

function pickupText(p: Valued): string {
  if ("freeAgent" in p) return `a free agent at ${p.pos}`;
  const team = "team" in p && typeof p.team === "string" && p.team ? `, ${p.team}` : "";
  return `${p.name} (${p.pos}${team}, ${fmt(p.value)} pts/g)`;
}

const list = (players: readonly Valued[]) => players.map(pickupText).join(" and ");

/**
 * What happens to roster spots in an uneven trade, naming the free agents to
 * add. Only the analyzer builds such trades: ideas are always even.
 */
export function rosterNotes(r: TradeResult, partnerName: string): string[] {
  const notes: string[] = [];
  if (r.myOpen) {
    notes.push(
      `You open ${r.myOpen} roster spot${r.myOpen > 1 ? "s" : ""}. Best free agent to add: ${list(r.myPickups)}. The numbers include him.`,
    );
  }
  if (r.theirOpen) {
    notes.push(
      `You get more players than you send, so you'll need to drop ${r.theirOpen}. ${partnerName} opens ${r.theirOpen} spot${r.theirOpen > 1 ? "s" : ""} and would add ${list(r.theirPickups)}.`,
    );
  }
  if (r.myBackups.length) {
    notes.push(
      `To keep your depth, add ${list(r.myBackups)} from free agency (drop your weakest bench player).`,
    );
  }
  if (r.theirBackups.length) {
    notes.push(`${partnerName} would add ${list(r.theirBackups)} from free agency for depth.`);
  }
  return notes;
}
