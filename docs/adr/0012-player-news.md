# ADR 0012: Player news from Sleeper, fetched when asked

- Status: accepted
- Date: 2026-10-01

## Context

Each player name in the site's lists gets a newspaper icon that opens the
player's latest news: practice reports, injury updates, how the last game
went. It must be free, work for every player (not only the famous ones) and
work for the NBA as well as the NFL, since the site will support both.

Constraints:

- **No backend.** The browser talks only to Sleeper and to the site itself,
  and the Content Security Policy ([ADR 0009](0009-content-security-policy.md))
  allows only `api.sleeper.app` for requests.
- **News sites block cross-origin requests**, so the browser can't read them
  directly.

Public RSS feeds, matched to players by name in a build step, were tried
first and dropped: a run covered about 40 players, since general feeds carry
few items and rarely name bench players.

## Decision

The dialog asks Sleeper for the player's news when it opens:
`https://api.sleeper.app/players/<sport>/<player_id>/news`, the feed Sleeper's
own app shows (RotoWire, RotoBaller, FantasyPros).

- **Same host as the rest of the site's calls**, with open CORS, so the CSP
  doesn't change and no request goes to a third party.
- **The latest 5, newest first**, each with title, short report, source and
  time. The title links to the article in a new tab when the source gives a
  link (RotoBaller and FantasyPros do, RotoWire doesn't); otherwise it is
  plain text.
- **Untrusted input.** Items are checked one by one, text is rendered as text
  (React escaping), and only `http(s)` links become an `href`, with
  `rel="noopener noreferrer"`. The player ID and sport are checked before they
  go into the URL.
- **Per sport by design.** The sport is part of the URL; the endpoint answers
  the same way for the NBA.
- Answers are kept for 5 minutes in memory, so reopening a player is instant.
- **No icon** for the demo league (fictional players) or for team defenses
  (the endpoint has no news for them).

## Consequences

- News is as fresh as Sleeper's app and covers every player.
- The endpoint is outside Sleeper's documented `/v1` API and could change. If
  it fails, the dialog says the news could not be loaded; nothing else on the
  page depends on it.
- One small request per dialog opened, from the visitor's browser.
