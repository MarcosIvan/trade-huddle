# Security

## Reporting a vulnerability

Please report security vulnerabilities privately, through GitHub's private
vulnerability reporting:
**[Report a vulnerability](https://github.com/MarcosIvan/trade-huddle/security/advisories/new)**
(the **Security** tab → **Report a vulnerability**). Do not open a public
issue for security problems.

Please include what is affected (a page, a workflow, a file), how to
reproduce it, and what an attacker could do with it.

What to expect (coordinated disclosure):

- An acknowledgement within **7 days**.
- An assessment, and for a confirmed vulnerability, a fix within **30
  days** when possible, followed by a published
  [security advisory](https://github.com/MarcosIvan/trade-huddle/security/advisories)
  that credits you if you want.
- Please keep the details private until the fix is released or 90 days have
  passed, whichever comes first.

**Scope:** this repository and the site it deploys
(https://marcosivan.github.io/trade-huddle/). Problems in Sleeper's own API
or apps belong to Sleeper.

## How this project is built to be safe

- **No secrets in the project.** The site only reads Sleeper's public, read-only
  API, so it needs no API keys. The optional Google Sheets export reads its
  credentials from a local, git-ignored file and from environment variables.
- **Static site.** GitHub Pages serves a static export of the Next.js site:
  plain HTML, CSS and JavaScript. There is no server, database or login that
  could be attacked.
- **Escaped output.** Team, league and player names come from other users.
  React escapes every one of them, and `dangerouslySetInnerHTML` is banned by
  the lint rule `react/no-danger`. The one exception is the site's own
  structured data (a constant, never Sleeper data, with `<` escaped).
- **Validated input.** Usernames and league IDs are checked before they are used
  in API requests, and Sleeper's responses are validated before use.
- **No third parties.** The site only talks to `api.sleeper.app`; its fonts are
  self-hosted.
- **Content Security Policy.** Every page carries a strict CSP in a meta tag
  (GitHub Pages can't send headers): scripts only from the site itself plus
  the exact inline scripts Next writes, allowed by SHA-256 hash; no
  `'unsafe-inline'` or `'unsafe-eval'`; styles, images and fonts only from
  the site; network requests only to the site and `api.sleeper.app`. The
  build fails if a page gains inline styles or event handlers. Limits of a
  meta policy (no `frame-ancestors`, no reports) are in
  [ADR 0009](docs/adr/0009-content-security-policy.md).
- **Least-privilege automation.** Workflows use a read-only token; only the
  deploy step can publish to Pages, and the deploy never runs for pull
  requests. The CI workflow checks every pull request (lint, types, tests,
  build, `npm audit`, ruff, mypy, pytest, secrets) with `pull_request`, never
  `pull_request_target`, so code from forks gets no write access or secrets.
  Only GitHub's own actions plus the OpenSSF Scorecard action may run, each
  pinned to a full commit SHA.
- **Automated scanning.**
  - **Secrets:** gitleaks scans the whole git history on every pull request
    (the official release, checked by SHA-256), and can run as a local
    pre-commit hook. GitHub secret scanning and push protection are on.
  - **Code:** CodeQL (`security-extended` queries) analyzes the TypeScript,
    the Python pipeline and the workflows on every pull request, on `main`
    and weekly.
  - **Practices:** OpenSSF Scorecard rates the repository weekly and on
    every change to `main`.
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
