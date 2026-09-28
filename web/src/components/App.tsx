"use client";

import { useLeague } from "@/hooks/useLeague";
import { EntryScreen } from "./EntryScreen";
import { LeagueScreen } from "./LeagueScreen";
import { SiteFooter, SiteHeader } from "./SiteChrome";
import styles from "./App.module.css";

export function App() {
  const league = useLeague();
  const { status } = league;

  return (
    <>
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <SiteHeader onHome={status.kind === "ready" ? league.leave : undefined} />
      <main id="main" tabIndex={-1}>
        {(status.kind === "starting" || status.kind === "loading") && (
          <div className={`container ${styles.loading}`} role="status" aria-live="polite">
            <span className={styles.spinner} aria-hidden="true" />
            {status.kind === "loading" ? "Loading your league…" : "Loading…"}
          </div>
        )}
        {status.kind === "entry" && (
          <EntryScreen
            key={status.error ?? ""}
            error={status.error}
            onOpenLeague={league.openLeague}
            onOpenDemo={league.openDemo}
          />
        )}
        {status.kind === "ready" && league.myRid !== null && (
          <LeagueScreen
            view={status.view}
            myRid={league.myRid}
            refreshing={league.refreshing}
            onTeam={league.setMyRid}
            onRefresh={league.refresh}
            onLeave={league.leave}
          />
        )}
      </main>
      <SiteFooter />
    </>
  );
}
