"use client";

import { useSyncExternalStore } from "react";
import { storage } from "@/lib/storage";
import styles from "./ThemeToggle.module.css";

type Theme = "light" | "dark";

const DARK_QUERY = "(prefers-color-scheme: dark)";

/** The theme on screen: the visitor's choice (data-theme on <html>), else the system's. */
function currentTheme(): Theme {
  const chosen = document.documentElement.dataset.theme;
  if (chosen === "light" || chosen === "dark") return chosen;
  return window.matchMedia(DARK_QUERY).matches ? "dark" : "light";
}

function subscribe(onChange: () => void): () => void {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  const media = window.matchMedia(DARK_QUERY);
  media.addEventListener("change", onChange);
  return () => {
    observer.disconnect();
    media.removeEventListener("change", onChange);
  };
}

/** A sliding switch between light mode and dark mode. The choice is remembered. */
export function ThemeToggle() {
  // Unknown while prerendering: the static HTML cannot know the visitor's theme.
  const theme = useSyncExternalStore<Theme | null>(subscribe, currentTheme, () => null);
  const dark = theme === "dark";

  function toggle() {
    const next: Theme = dark ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    storage.set("theme", next);
  }

  return (
    <button
      type="button"
      role="switch"
      aria-checked={dark}
      aria-label="Dark mode"
      className={styles.toggle}
      onClick={toggle}
      data-ready={theme !== null}
    >
      <span className={`${styles.label} ${styles.light}`} aria-hidden="true">
        Light mode
      </span>
      <span className={styles.track} aria-hidden="true">
        <span className={styles.thumb} />
      </span>
      <span className={`${styles.label} ${styles.dark}`} aria-hidden="true">
        Dark mode
      </span>
    </button>
  );
}
