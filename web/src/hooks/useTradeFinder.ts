"use client";

import { useEffect, useRef, useState } from "react";
import type { Team } from "@/lib/league";
import type { FinderMode, IdealRoster, Model, TradeIdea } from "@/lib/model";
import {
  hydrateIdeas,
  runFinder,
  type FinderRequest,
  type FinderResponse,
} from "@/lib/tradeSearch";

export interface TradeFinderState {
  /** Three deals, best first; the closest ones carry what they miss (`problems`). */
  ideas: TradeIdea[];
  searching: boolean;
}

const IDLE: TradeFinderState = { ideas: [], searching: false };

/**
 * Deals around one chosen player, computed in their own Web Worker (or inline
 * where workers are unavailable), so they never wait for the trade ideas.
 */
export function useTradeFinder(
  model: Model,
  teams: Team[],
  myRid: number,
  tradeScores: ReadonlyMap<string, number>,
  ideal: IdealRoster,
  mode: FinderMode,
  playerId: string | null,
): TradeFinderState {
  const [state, setState] = useState<TradeFinderState>(IDLE);
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
    const requestId = ++requestRef.current;
    if (!playerId) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setState(IDLE);
      return;
    }
    const request: FinderRequest = {
      requestId,
      model,
      rosters: teams.map((t) => ({ rid: t.rid, playerIds: t.playerIds, reserveIds: t.reserveIds })),
      myRid,
      tradeScores: [...tradeScores],
      ideal,
      finder: { mode, playerId },
    };
    const finish = (response: FinderResponse) => {
      if (response.requestId !== requestRef.current) return; // a newer search replaced this one
      setState({ ideas: hydrateIdeas(response.ideas, model), searching: false });
    };

    setState({ ...IDLE, searching: true });
    const worker = workerRef.current;
    if (!worker) {
      const timer = setTimeout(() => finish(runFinder(request)), 0);
      return () => clearTimeout(timer);
    }
    const onMessage = (event: MessageEvent<FinderResponse>) => finish(event.data);
    const onError = () => finish(runFinder(request));
    worker.addEventListener("message", onMessage);
    worker.addEventListener("error", onError);
    worker.postMessage(request);
    return () => {
      worker.removeEventListener("message", onMessage);
      worker.removeEventListener("error", onError);
    };
  }, [model, teams, myRid, tradeScores, ideal, mode, playerId]);

  return state;
}
