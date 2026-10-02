"use client";

import { useEffect } from "react";
import { useLeague } from "@/hooks/useLeague";
import { EntryScreen } from "./EntryScreen";
import { LeagueScreen } from "./LeagueScreen";
import { SiteFooter, SiteHeader } from "./SiteChrome";
import styles from "./App.module.css";

export function App() {
  const league = useLeague();
  const { status } = league;

  // Once the app knows where to go, the boot hint from theme-init.js is no longer needed.
  useEffect(() => {
    if (status.kind !== "starting") document.documentElement.removeAttribute("data-boot");
  }, [status.kind]);

  return (
    <>
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <SiteHeader onHome={status.kind === "ready" ? league.leave : undefined} />
      <main id="main" tabIndex={-1}>
        {(status.kind === "starting" || status.kind === "loading") && (
          <div
            className={`container ${styles.loading} ${status.kind === "starting" ? styles.boot : ""}`}
            role="status"
            aria-live="polite"
          >
            <span className={styles.spinner} aria-hidden="true" />
            {status.kind === "loading" ? "Loading your league…" : "Loading…"}
          </div>
        )}
        {/* Prerendered, so search engines and first-time visitors see it without JavaScript;
            hidden while a visit that goes straight to a league starts. */}
        {(status.kind === "starting" || status.kind === "entry") && (
          <div className={status.kind === "starting" ? styles.entryBoot : undefined}>
            <EntryScreen
              key={status.kind === "entry" ? (status.error ?? "") : ""}
              error={status.kind === "entry" ? status.error : null}
              onOpenLeague={league.openLeague}
              onLeagues={league.setLeagues}
              onOpenDemo={league.openDemo}
            />
          </div>
        )}
        {status.kind === "ready" && league.myRid !== null && (
          <LeagueScreen
            view={status.view}
            myRid={league.myRid}
            leagues={league.leagues}
            refreshing={league.refreshing}
            onLeague={league.openLeague}
            onRefresh={league.refresh}
          />
        )}
      </main>
      <SiteFooter />
    </>
  );
}
