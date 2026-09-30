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
        <h1 className={styles.title}>
          <span className={styles.eyebrow}>Fantasy football trade analyzer for Sleeper</span> Trades
          that make both teams better
        </h1>
        <p className={styles.lede}>
          Enter your Sleeper username and pick a league. Trade Huddle builds your best lineup,
          suggests up to three fair NFL trades that improve your starters and your trade
          partner&apos;s, and shows how balanced any deal is.
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

      <About />
    </div>
  );
}

const FEATURES = [
  {
    name: "Trade analyzer",
    text: "Pick players on both sides and see if the trade is fair, with the trade value, points per game and last 3 games each side gains or loses.",
  },
  {
    name: "Trade finder",
    text: "Choose one player to sell or to get and see the three best fair deals around him, from 1-for-1 to 3-for-2.",
  },
  {
    name: "Trade ideas",
    text: "Three fair trades that improve both teams, built around the ideal roster you set: how many QBs, RBs, WRs and TEs you want.",
  },
  {
    name: "Weekly lineup",
    text: "Your best start/sit lineup for this week's NFL games, with each opponent's matchup.",
  },
];

const QUESTIONS = [
  {
    q: "Is it free?",
    a: "Yes. Trade Huddle is free and open source. There is no sign-up and no password: it only needs your Sleeper username.",
  },
  {
    q: "Which leagues does it work with?",
    a: "Sleeper redraft NFL leagues, with your league's own scoring: PPR, half PPR or standard, one-QB or superflex.",
  },
  {
    q: "How is trade value calculated?",
    a: "Each player gets a trade value from 1 to 40 that blends his preseason outlook, the draft market, expected points per game, this season, the last 3 games and his share of his NFL offense's targets and carries. A trade is fair when both sides send about the same value.",
  },
  {
    q: "Where does my data go?",
    a: "Nowhere. Everything runs in your browser, straight against Sleeper's public API. The site only remembers your username and choices in your own browser.",
  },
];

/** What the site does and common questions: plain text that search engines can read. */
function About() {
  return (
    <div className={styles.about}>
      <section aria-labelledby="features-title">
        <h2 id="features-title" className={styles.aboutTitle}>
          What Trade Huddle does
        </h2>
        <ul className={styles.features}>
          {FEATURES.map((f) => (
            <li key={f.name}>
              <h3>{f.name}</h3>
              <p>{f.text}</p>
            </li>
          ))}
        </ul>
      </section>
      <section aria-labelledby="faq-title">
        <h2 id="faq-title" className={styles.aboutTitle}>
          Questions
        </h2>
        <dl className={styles.faq}>
          {QUESTIONS.map(({ q, a }) => (
            <div key={q}>
              <dt>{q}</dt>
              <dd>{a}</dd>
            </div>
          ))}
        </dl>
      </section>
    </div>
  );
}
