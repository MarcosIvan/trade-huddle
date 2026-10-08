import { useId, useState } from "react";
import { SUPPORTED_SPORTS, type UserLeague } from "@/lib/sleeper/client";
import styles from "./LeaguePicker.module.css";

/**
 * The visitor's leagues, grouped by sport. Sports the site doesn't support yet
 * are listed but can't be picked.
 */
export function LeaguePicker({
  current,
  leagues,
  onLeague,
}: {
  current: { league_id: string; name: string };
  leagues: UserLeague[];
  onLeague: (leagueId: string) => void;
}) {
  const fieldId = useId();
  // The focus ring is for the keyboard: a mouse click that opens and closes the menu leaves none.
  const [pointer, setPointer] = useState(false);
  // A league opened from a shared link may not be one of the visitor's.
  const list = leagues.some((l) => l.league_id === current.league_id)
    ? leagues
    : [{ ...current, total_rosters: undefined, sport: "nfl" as const, season: "" }, ...leagues];
  const sports = [...new Set(list.map((l) => l.sport))];
  return (
    <div className={`field ${styles.picker}`}>
      <label htmlFor={fieldId}>League</label>
      <select
        id={fieldId}
        className={`select ${pointer ? styles.pointer : ""}`}
        value={current.league_id}
        onMouseDown={() => setPointer(true)}
        onKeyDown={() => setPointer(false)}
        onChange={(e) => onLeague(e.target.value)}
      >
        {sports.map((sport) => {
          const supported = SUPPORTED_SPORTS.has(sport);
          return (
            <optgroup
              key={sport}
              label={`${sport.toUpperCase()}${supported ? "" : " (coming soon)"}`}
            >
              {list
                .filter((l) => l.sport === sport)
                .map((l) => (
                  <option key={l.league_id} value={l.league_id} disabled={!supported}>
                    {l.name}
                  </option>
                ))}
            </optgroup>
          );
        })}
      </select>
    </div>
  );
}
