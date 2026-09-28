# Security

## Reporting a problem

Please report security issues privately through GitHub:
**Security → Report a vulnerability** on this repository.
Do not open a public issue for security problems.

## How this project is built to be safe

- **No secrets in the project.** The site only reads Sleeper's public, read-only
  API, so it needs no API keys. The optional Google Sheets export reads its
  credentials from a local, git-ignored file and from environment variables.
- **Static site.** GitHub Pages serves plain HTML, CSS and JavaScript. There is
  no server, database or login that could be attacked.
- **Content Security Policy.** The page only runs its own script, only talks to
  `api.sleeper.app`, and only loads fonts from Google Fonts.
- **Escaped output.** Team, league and player names come from other users, so
  every one of them is escaped before it is shown.
- **Validated input.** Usernames and league IDs are checked before they are used
  in API requests.
- **Least-privilege automation.** The GitHub Actions workflow uses a read-only
  token; only the deploy step can publish to Pages. It never runs for pull
  requests from forks.
- **Dependency updates.** Dependabot opens pull requests for outdated actions
  and Python packages.

## What the site stores

Only your Sleeper username, your user ID and your last league, in your own
browser's local storage, so you don't have to type them again. Nothing is sent
anywhere except Sleeper's API.
