/**
 * The only things the site keeps, in the visitor's own browser: their Sleeper
 * username and user ID, their last league and which team they view in each
 * league. Storage can be blocked (private mode), so every access is guarded.
 */
type Key = "user" | "uid" | "league" | `team:${string}`;

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
