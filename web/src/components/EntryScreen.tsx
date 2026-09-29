"use client";

import { useEffect, useId, useState, type FormEvent } from "react";
import { friendlyError } from "@/hooks/useLeague";
import { currentSeason, findUser, userLeagues } from "@/lib/sleeper/client";
import type { LeagueSummary } from "@/lib/sleeper/validate";
import { storage } from "@/lib/storage";
import styles from "./EntryScreen.module.css";

export function EntryScreen({
  error,
  onOpenLeague,
  onOpenDemo,
}: {
  error: string | null;
  onOpenLeague: (leagueId: string) => void;
  onOpenDemo: () => void;
}) {
  const userFieldId = useId();
  const [username, setUsername] = useState("");
  const [searching, setSearching] = useState(false);
  const [message, setMessage] = useState<string | null>(error);
  const [leagues, setLeagues] = useState<{
    owner: string;
    season: string;
    list: LeagueSummary[];
  } | null>(null);

  // Remember the last username typed on this device.
  useEffect(() => {
    const saved = storage.get("user");
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (saved) setUsername(saved);
  }, []);

  async function findLeagues(e: FormEvent) {
    e.preventDefault();
    setMessage(null);
    setLeagues(null);
    setSearching(true);
    try {
      const name = username.trim();
      const user = await findUser(name);
      storage.set("user", name);
      storage.set("uid", user.user_id);
      const season = await currentSeason();
      const list = await userLeagues(user.user_id, season);
      if (!list.length) {
        setMessage(`${user.display_name || name} has no NFL leagues in ${season}.`);
      } else if (list.length === 1) {
        onOpenLeague(list[0]!.league_id);
      } else {
        setLeagues({ owner: user.display_name || name, season, list });
      }
    } catch (err) {
      setMessage(friendlyError(err));
    } finally {
      setSearching(false);
    }
  }

  return (
    <div className={`container ${styles.entry}`}>
      <div className={styles.hero}>
        <h1 className={styles.title}>Trades that make both teams better</h1>
        <p className={styles.lede}>
          Enter your Sleeper username and pick a league. Trade Huddle builds your best lineup,
          suggests up to three fair trades that improve your starters and your trade partner&apos;s,
          and shows how balanced any deal is.
        </p>
      </div>

      <div className={`card ${styles.panel}`}>
        <form className={styles.form} onSubmit={findLeagues}>
          <div className="field">
            <label htmlFor={userFieldId}>Sleeper username</label>
            <div className={styles.inline}>
              <input
                id={userFieldId}
                className="input"
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                autoComplete="username"
                autoCapitalize="off"
                spellCheck={false}
                maxLength={40}
                required
                aria-describedby={`${userFieldId}-hint`}
              />
              <button className="btn btn-primary" type="submit" disabled={searching}>
                {searching ? "Searching…" : "Find my leagues"}
              </button>
            </div>
            <p className="hint" id={`${userFieldId}-hint`}>
              Your profile username, not your team name.
            </p>
          </div>
        </form>

        <p className={`hint ${styles.demo}`}>
          Just looking?{" "}
          <button className="btn btn-link" type="button" onClick={onOpenDemo}>
            Try the demo league
          </button>
        </p>

        <div role="alert" className={styles.alertSlot}>
          {message && <p className={styles.error}>{message}</p>}
        </div>

        {leagues && (
          <section aria-labelledby="league-list-title" className={styles.leagues}>
            <h2 id="league-list-title" className={styles.leaguesTitle}>
              {leagues.owner}&apos;s leagues in {leagues.season}
            </h2>
            <ul>
              {leagues.list.map((l) => (
                <li key={l.league_id}>
                  <button
                    type="button"
                    className={`btn ${styles.league}`}
                    onClick={() => onOpenLeague(l.league_id)}
                  >
                    <span>{l.name}</span>
                    {l.total_rosters !== undefined && (
                      <span className="muted">{l.total_rosters} teams</span>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </div>
  );
}
