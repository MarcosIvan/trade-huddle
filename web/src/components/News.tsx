"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { timeAgo, type NewsItem } from "@/lib/news";
import { playerNews } from "@/lib/sleeper/client";
import { Modal, ModalHeader } from "./Modal";
import styles from "./News.module.css";

interface NewsTarget {
  id: string;
  name: string;
  /** When the dialog opened: the "3 h ago" times are counted from it. */
  now: number;
}

interface NewsState {
  enabled: boolean;
  open: (id: string, name: string) => void;
}

const TITLE_ID = "news-title";

const NewsContext = createContext<NewsState>({ enabled: false, open: () => {} });

/** Answers already fetched, so reopening a player is instant. */
const fetched = new Map<string, { at: number; items: NewsItem[] }>();
const FRESH_MS = 5 * 60_000;

function loadNews(sport: string, id: string, now: number, signal: AbortSignal) {
  const key = `${sport}/${id}`;
  const hit = fetched.get(key);
  if (hit && now - hit.at < FRESH_MS) return Promise.resolve(hit.items);
  return playerNews(sport, id, signal).then((items) => {
    fetched.set(key, { at: now, items });
    return items;
  });
}

/**
 * Holds the one news dialog every player name opens. Off for the demo
 * league, whose players are fictional.
 */
export function NewsProvider({
  sport,
  enabled,
  children,
}: {
  sport: string;
  enabled: boolean;
  children: ReactNode;
}) {
  const [target, setTarget] = useState<NewsTarget | null>(null);

  return (
    <NewsContext.Provider
      value={{ enabled, open: (id, name) => setTarget({ id, name, now: Date.now() }) }}
    >
      {children}
      <Modal open={target !== null} labelledBy={TITLE_ID} onClose={() => setTarget(null)}>
        {target && <NewsPanel key={`${target.id}-${target.now}`} sport={sport} target={target} />}
      </Modal>
    </NewsContext.Provider>
  );
}

type Load = { kind: "loading" } | { kind: "ready"; items: NewsItem[] } | { kind: "error" };

function NewsPanel({ sport, target }: { sport: string; target: NewsTarget }) {
  const [load, setLoad] = useState<Load>({ kind: "loading" });
  const { id, name, now } = target;

  useEffect(() => {
    const abort = new AbortController();
    loadNews(sport, id, now, abort.signal).then(
      (items) => setLoad({ kind: "ready", items }),
      () => {
        if (!abort.signal.aborted) setLoad({ kind: "error" });
      },
    );
    return () => abort.abort();
  }, [sport, id, now]);

  return (
    <>
      <ModalHeader id={TITLE_ID} kicker="Latest news">
        {name}
      </ModalHeader>
      <div aria-live="polite" aria-busy={load.kind === "loading"}>
        {load.kind === "loading" && <p className={styles.status}>Loading news…</p>}
        {load.kind === "error" && (
          <p className={styles.status}>Could not load the news from Sleeper. Try again later.</p>
        )}
        {load.kind === "ready" &&
          (load.items.length ? (
            <ol className={styles.list}>
              {load.items.map((n) => (
                <li key={`${n.time}-${n.title}`}>
                  {n.url ? (
                    <a
                      href={n.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={styles.headline}
                    >
                      {n.title}
                      <span className="visually-hidden"> (opens in a new tab)</span>
                    </a>
                  ) : (
                    <span className={styles.headline}>{n.title}</span>
                  )}
                  {n.summary && <p className={styles.summary}>{n.summary}</p>}
                  <span className={styles.meta}>
                    {n.source} ·{" "}
                    <time dateTime={new Date(n.time).toISOString()}>{timeAgo(n.time, now)}</time>
                  </span>
                </li>
              ))}
            </ol>
          ) : (
            <p className={styles.status}>No recent news about {name}.</p>
          ))}
      </div>
    </>
  );
}

function NewspaperIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" focusable="false">
      <path
        d="M4 5h13v13a2 2 0 0 0 2 2H6a2 2 0 0 1-2-2V5Zm13 4h3v9a2 2 0 0 1-4 0M7 8h7M7 11h7M7 14h4"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** The newspaper button next to a player's name. Defenses have no player news. */
export function NewsButton({ id, name, pos }: { id: string; name: string; pos: string }) {
  const { enabled, open } = useContext(NewsContext);
  if (!enabled || pos === "DEF") return null;
  const label = `News about ${name}`;
  return (
    <button
      type="button"
      className={styles.icon}
      aria-label={label}
      title={label}
      aria-haspopup="dialog"
      onClick={(e) => {
        // Inside a pick list the name sits in a <label>: don't toggle its checkbox.
        e.preventDefault();
        e.stopPropagation();
        open(id, name);
      }}
    >
      <NewspaperIcon />
    </button>
  );
}
