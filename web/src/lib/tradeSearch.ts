/**
 * The trade search, in a form that can cross a Web Worker boundary: players
 * travel as IDs and are looked up again on the other side.
 */
import {
  freeAgentPool,
  rosterPlayers,
  suggestTrades,
  type Model,
  type Player,
  type TradeIdea,
} from "./model";
import { NFL } from "./sports/nfl";

export interface SearchRequest {
  requestId: number;
  model: Model;
  rosters: { rid: number; playerIds: string[] }[];
  myRid: number;
  /** Trade score per player (Player Score without team importance). */
  tradeScores: [string, number][];
}

export type IdeaIds = Omit<TradeIdea, "give" | "get"> & { give: string[]; get: string[] };

export interface SearchResponse {
  requestId: number;
  ideas: IdeaIds[];
}

export function runSearch({
  requestId,
  model,
  rosters,
  myRid,
  tradeScores,
}: SearchRequest): SearchResponse {
  const teams = rosters.map((r) => ({ rid: r.rid, players: rosterPlayers(model, r.playerIds) }));
  const pool = freeAgentPool(model, new Set(rosters.flatMap((r) => r.playerIds)));
  const ideas = suggestTrades(myRid, teams, model, NFL, pool, new Map(tradeScores));
  return {
    requestId,
    ideas: ideas.map((r) => ({ ...r, give: r.give.map((p) => p.id), get: r.get.map((p) => p.id) })),
  };
}

export function hydrateIdeas(ideas: IdeaIds[], model: Model): TradeIdea[] {
  const lookup = (ids: string[]): Player[] => rosterPlayers(model, ids);
  return ideas.map((r) => ({ ...r, give: lookup(r.give), get: lookup(r.get) }));
}
