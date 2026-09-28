/** Loads the fictional demo league for tests. */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { LeagueSettings, StatsFile } from "@/lib/model";

const read = <T>(path: string): T =>
  JSON.parse(readFileSync(fileURLToPath(new URL(path, import.meta.url)), "utf8")) as T;

export interface DemoLeague {
  league: LeagueSettings & { league_id: string; name: string };
  rosters: { roster_id: number; owner_id: string; players: string[] }[];
  users: { user_id: string; display_name: string; metadata: { team_name: string } }[];
  my_roster_id: number;
}

export const demoStats = () => read<StatsFile>("../public/data/nfl/demo_stats.json");
export const demoLeague = () => read<DemoLeague>("../public/data/nfl/demo_league.json");
export const reference = () => read<Reference>("./reference/demo-reference.json");

interface RefTrade {
  give: string[];
  get: string[];
  dMe: number;
  dThem: number;
  fairness: number;
  verdict: { cls: string; text: string };
}

export interface Reference {
  slots: string[];
  teams: number;
  repl: Record<string, number>;
  players: Record<
    string,
    {
      pos: string;
      g: number;
      seasonAvg: number | null;
      lastAvg: number | null;
      prevG: number;
      prevPpg: number | null;
      weekly: (number | null)[];
      value: number;
      vorp: number;
      startable: boolean;
      weights: { prev: number; season: number; recent: number; repl: number };
    }
  >;
  rosters: {
    rid: number;
    lineup: { slots: (string | null)[]; total: number };
    suggestions: (RefTrade & { partner: number; vGive: number; vGet: number; score: number })[];
  }[];
  manual: (RefTrade & {
    myRid: number;
    partner: number;
    myOpen: number;
    theirOpen: number;
    meAfter: number;
    themAfter: number;
  })[];
}
