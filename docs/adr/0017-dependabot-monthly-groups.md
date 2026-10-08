# ADR 0017: Dependabot updates monthly and grouped, security fixes right away

- Status: accepted
- Date: 2026-10-08

## Context

Dependabot checked every week and opened one pull request per package for
Python and for the site's runtime (`next`, `react`). In one week of October
2026 that came to eight pull requests, each needing its own CI run and
review. They also edited shared lock files, so every merge forced the others
to rebase. The owner found this hard to follow.

The Sheets export's lock (`tools/requirements-sheets.txt`) is constrained by
the pipeline's (`-c ../pipeline/requirements.txt`). Because of that, one
`/tools` update edited the pipeline's lock instead of the tools' own and
duplicated a pipeline pull request.

## Decision

- **Monthly schedule** for every ecosystem (GitHub Actions, pip, npm).
- **One group per entry** (`patterns: ["*"]`). The site's runtime and its
  tools come in one npm pull request, and all Actions in one. For pip, the
  group spans the pipeline and the tools; Dependabot may still open one
  pull request per directory.
- **Security fixes are unchanged.** Dependabot security updates stay on, are
  not grouped (groups apply to version updates by default) and come as
  soon as an advisory is published.
- Major npm versions are still ignored and updated by hand.

## Consequences

- At most about three or four routine pull requests a month, plus security
  fixes when they happen.
- A routine update can wait up to a month. Anything urgent arrives as a
  security update, and the blocking `npm audit` (ADR 0016) still catches
  advisories in what the site ships.
- A grouped pull request can break the build because of a single package.
  When that happens, the package is pinned or added to `ignore` and the rest
  goes in.
