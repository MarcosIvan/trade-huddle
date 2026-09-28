"use client";

import { useEffect, useRef, useState } from "react";
import type { Team } from "@/lib/league";
import type { Model, TradeIdea } from "@/lib/model";
import {
  hydrateIdeas,
  runSearch,
  type SearchRequest,
  type SearchResponse,
} from "@/lib/tradeSearch";

export interface TradeIdeasState {
  ideas: TradeIdea[];
  searching: boolean;
}

/** Trade ideas for a team, computed in a Web Worker (or inline where workers are unavailable). */
export function useTradeIdeas(
  model: Model | null,
  teams: Team[],
  myRid: number | null,
  tradeScores: ReadonlyMap<string, number>,
): TradeIdeasState {
  const [state, setState] = useState<TradeIdeasState>({ ideas: [], searching: false });
  const workerRef = useRef<Worker | null>(null);
  const requestRef = useRef(0);

  useEffect(() => {
    if (typeof Worker === "undefined") return;
    const worker = new Worker(new URL("../workers/trades.worker.ts", import.meta.url), {
      type: "module",
    });
    workerRef.current = worker;
    return () => {
      worker.terminate();
      workerRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!model || myRid === null) return;
    const requestId = ++requestRef.current;
    const request: SearchRequest = {
      requestId,
      model,
      rosters: teams.map((t) => ({ rid: t.rid, playerIds: t.playerIds })),
      myRid,
      tradeScores: [...tradeScores],
    };
    const finish = (response: SearchResponse) => {
      if (response.requestId !== requestRef.current) return; // a newer search replaced this one
      setState({ ideas: hydrateIdeas(response.ideas, model), searching: false });
    };

    // Clear the previous team's ideas while the new search runs.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setState({ ideas: [], searching: true });
    const worker = workerRef.current;
    if (!worker) {
      const timer = setTimeout(() => finish(runSearch(request)), 0);
      return () => clearTimeout(timer);
    }
    const onMessage = (event: MessageEvent<SearchResponse>) => finish(event.data);
    const onError = () => finish(runSearch(request));
    worker.addEventListener("message", onMessage);
    worker.addEventListener("error", onError);
    worker.postMessage(request);
    return () => {
      worker.removeEventListener("message", onMessage);
      worker.removeEventListener("error", onError);
    };
  }, [model, teams, myRid, tradeScores]);

  return state;
}
