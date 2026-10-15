/**
 * The trade search, in a form that can cross a Web Worker boundary: players
 * travel as IDs and are looked up again on the other side.
 */
import {
  findTargetTrades,
  findTrades,
  type FinderMode,
  type FinderTarget,
  type FinderResult,
  rosterPlayers,
  suggestTrades,
  type IdealRoster,
  type Model,
  type Player,
  type TradeIdea,
} from "./model";
import { sportOf } from "./sports";

export interface SearchRequest {
  requestId: number;
  model: Model;
  rosters: { rid: number; playerIds: string[]; reserveIds: string[] | null }[];
  myRid: number;
  /** The league's sport id (nfl, nba): its positions and trade rules. */
  sport: string;
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
  sport,
  tradeScores,
  ideal,
}: SearchRequest): SearchResponse {
  const teams = rosters.map((r) => ({
    rid: r.rid,
    players: rosterPlayers(model, r.playerIds, r.reserveIds),
  }));
  const ideas = suggestTrades(myRid, teams, model, sportOf(sport), new Map(tradeScores), ideal);
  return {
    requestId,
    ideas: ideas.map((r) => ({ ...r, give: r.give.map((p) => p.id), get: r.get.map((p) => p.id) })),
  };
}

export function hydrateIdeas(ideas: IdeaIds[], model: Model): TradeIdea[] {
  const lookup = (ids: string[]): Player[] => rosterPlayers(model, ids);
  return ideas.map((r) => ({ ...r, give: lookup(r.give), get: lookup(r.get) }));
}

/**
 * What the trade finder searches: deals around one player you want to sell or
 * get, or deals that bring you a top player at a position.
 */
export type FinderQuery =
  { mode: FinderMode; playerId: string } | { mode: "target"; target: FinderTarget };

/** A trade finder search. */
export interface FinderRequest extends SearchRequest {
  finder: FinderQuery;
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
  sport,
  tradeScores,
  ideal,
  finder,
}: FinderRequest): FinderResponse {
  const teams = rosters.map((r) => ({
    rid: r.rid,
    players: rosterPlayers(model, r.playerIds, r.reserveIds),
  }));
  const config = sportOf(sport);
  const scores = new Map(tradeScores);
  const { ideas }: FinderResult =
    finder.mode === "target"
      ? findTargetTrades(finder.target, myRid, teams, model, config, scores, ideal)
      : findTrades(finder.mode, finder.playerId, myRid, teams, model, config, scores, ideal);
  return { requestId, ideas: ideas.map(toIds) };
}
