# Security

## Reporting a problem

Please report security issues privately through GitHub:
**Security → Report a vulnerability** on this repository.
Do not open a public issue for security problems.

## How this project is built to be safe

- **No secrets in the project.** The site only reads Sleeper's public, read-only
  API, so it needs no API keys. The optional Google Sheets export reads its
  credentials from a local, git-ignored file and from environment variables.
- **Static site.** GitHub Pages serves a static export of the Next.js site:
  plain HTML, CSS and JavaScript. There is no server, database or login that
  could be attacked.
- **Escaped output.** Team, league and player names come from other users.
  React escapes every one of them, and `dangerouslySetInnerHTML` is banned by
  the lint rule `react/no-danger`.
- **Validated input.** Usernames and league IDs are checked before they are used
  in API requests, and Sleeper's responses are validated before use.
- **No third parties.** The site only talks to `api.sleeper.app`; its fonts are
  self-hosted.
- **Content Security Policy (planned).** A hash-based CSP for the Next.js
  export is on the roadmap; the site does not ship one yet.
- **Least-privilege automation.** The GitHub Actions workflow uses a read-only
  token; only the deploy step can publish to Pages. It never runs for pull
  requests from forks.
- **Dependency updates.** Dependabot opens pull requests for outdated GitHub
  Actions, Python packages (pipeline and tools) and npm packages (the site).
  Major npm versions are updated by hand once the tooling supports them;
  a vulnerability fixed only in a new major still raises a Dependabot alert.

## What the site stores

Only your Sleeper username, your user ID, your last league, which team you
view in each league, the ideal roster you set for each team and your
light/dark choice, in your own browser's local storage, so you don't have to
pick them again. Nothing is sent
anywhere except Sleeper's API.
