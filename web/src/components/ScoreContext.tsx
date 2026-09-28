"use client";

import { createContext, useContext } from "react";
import type { PlayerScore } from "@/lib/model";

/** Player Scores for the league on screen, so any player cell can show them. */
export const ScoreContext = createContext<ReadonlyMap<string, PlayerScore>>(new Map());

export const usePlayerScore = (id: string) => useContext(ScoreContext).get(id);
