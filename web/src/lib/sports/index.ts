import { NBA } from "./nba";
import { NFL } from "./nfl";
import type { SportConfig } from "./types";

/** Every sport the site supports, by Sleeper's sport id. */
export const SPORTS: Readonly<Record<string, SportConfig>> = { nfl: NFL, nba: NBA };

/** A league's sport (the NFL when Sleeper does not say, as older leagues do). */
export function sportOf(id: string | undefined): SportConfig {
  return SPORTS[id ?? "nfl"] ?? NFL;
}
