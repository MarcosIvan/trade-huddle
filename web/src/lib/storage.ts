/**
 * The only things the site keeps, in the visitor's own browser: their Sleeper
 * username and user ID, their last league, which team they view in each
 * league, the ideal roster set for each team and their light/dark choice.
 * Storage can be blocked (private mode), so every access is guarded.
 * public/theme-init.js reads "th:theme" too.
 */
type Key = "user" | "uid" | "league" | "theme" | `team:${string}` | `ideal:${string}`;

const PREFIX = "th:";

export const storage = {
  get(key: Key): string | null {
    try {
      return window.localStorage.getItem(PREFIX + key);
    } catch {
      return null;
    }
  },
  set(key: Key, value: string): void {
    try {
      window.localStorage.setItem(PREFIX + key, value);
    } catch {
      // Storage unavailable: the site still works, it just won't remember.
    }
  },
  remove(key: Key): void {
    try {
      window.localStorage.removeItem(PREFIX + key);
    } catch {
      // Storage unavailable.
    }
  },
};
