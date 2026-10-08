"use client";

import { createContext, useContext } from "react";
import { NFL } from "@/lib/sports/nfl";
import type { SportConfig } from "@/lib/sports/types";

/** The league's sport, for every component under the league screen. */
export const SportContext = createContext<SportConfig>(NFL);

export function useSport(): SportConfig {
  return useContext(SportContext);
}
