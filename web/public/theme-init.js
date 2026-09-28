/*
 * Applies the visitor's saved theme before the page is painted, so it never
 * flashes the wrong colors. Without a saved choice the site follows the
 * system setting (CSS prefers-color-scheme). Loaded as a file, not inline,
 * so the Content Security Policy needs no exception for it.
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
