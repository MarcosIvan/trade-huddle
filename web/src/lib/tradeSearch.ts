/**
 * The trade search, in a form that can cross a Web Worker boundary: players
 * travel as IDs and are looked up again on the other side.
 */
import {
  findTrades,
  type FinderMode,
  type FinderResult,
  freeAgentPool,
  rosterPlayers,
  suggestTrades,
  type IdealRoster,
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
  /** Your ideal roster (total players per position); empty keeps the default rules. */
  ideal: IdealRoster;
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
  ideal,
}: SearchRequest): SearchResponse {
  const teams = rosters.map((r) => ({ rid: r.rid, players: rosterPlayers(model, r.playerIds) }));
  const pool = freeAgentPool(model, new Set(rosters.flatMap((r) => r.playerIds)));
  const ideas = suggestTrades(myRid, teams, model, NFL, pool, new Map(tradeScores), ideal);
  return {
    requestId,
    ideas: ideas.map((r) => ({ ...r, give: r.give.map((p) => p.id), get: r.get.map((p) => p.id) })),
  };
}

export function hydrateIdeas(ideas: IdeaIds[], model: Model): TradeIdea[] {
  const lookup = (ids: string[]): Player[] => rosterPlayers(model, ids);
  return ideas.map((r) => ({ ...r, give: lookup(r.give), get: lookup(r.get) }));
}

/** A trade finder search: deals around one player you want to sell or get. */
export interface FinderRequest extends SearchRequest {
  finder: { mode: FinderMode; playerId: string };
}

export interface FinderResponse {
  requestId: number;
  /** Three deals, best first; the closest ones carry what they miss (`problems`). */
  ideas: IdeaIds[];
}

const toIds = <T extends { give: Player[]; get: Player[] }>(r: T) => ({
  ...r,
  give: r.give.map((p) => p.id),
  get: r.get.map((p) => p.id),
});

export function runFinder({
  requestId,
  model,
  rosters,
  myRid,
  tradeScores,
  ideal,
  finder,
}: FinderRequest): FinderResponse {
  const teams = rosters.map((r) => ({ rid: r.rid, players: rosterPlayers(model, r.playerIds) }));
  const pool = freeAgentPool(model, new Set(rosters.flatMap((r) => r.playerIds)));
  const { ideas }: FinderResult = findTrades(
    finder.mode,
    finder.playerId,
    myRid,
    teams,
    model,
    NFL,
    pool,
    new Map(tradeScores),
    ideal,
  );
  return { requestId, ideas: ideas.map(toIds) };
}
