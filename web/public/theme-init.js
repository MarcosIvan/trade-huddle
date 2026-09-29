/*
 * Runs before the page is painted, so nothing flashes:
 * - applies the visitor's saved theme (without one, the site follows the
 *   system setting through CSS prefers-color-scheme);
 * - marks visits that go straight to a league (?demo, ?league=<id> or a saved
 *   league) with data-boot="league", so the prerendered entry screen stays
 *   hidden behind a loading message until the app takes over.
 * Loaded as a file, not inline, so the Content Security Policy needs no
 * exception for it.
 */
(function () {
  try {
    var theme = window.localStorage.getItem("th:theme");
    if (theme === "light" || theme === "dark") {
      document.documentElement.setAttribute("data-theme", theme);
    }
  } catch (e) {
    // Storage unavailable: follow the system setting.
  }
})();
(function () {
  try {
    var query = new URLSearchParams(window.location.search);
    if (query.has("demo") || query.get("league") || window.localStorage.getItem("th:league")) {
      document.documentElement.setAttribute("data-boot", "league");
    }
  } catch (e) {
    // Storage unavailable: show the entry screen as usual.
  }
})();
