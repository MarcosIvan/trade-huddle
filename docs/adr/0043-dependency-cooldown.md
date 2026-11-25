# ADR 0043: Dependency updates wait 14 days after release

- Status: accepted
- Date: 2026-11-25

## Context

Dependabot proposed a version as soon as it was published (ADR 0017). A new
release is when a package is most likely to be broken or, in a supply chain
attack, compromised: such releases are usually found and pulled within days.
The site should stay up on versions that have had time to settle.

## Decision

Every Dependabot entry (GitHub Actions, pip, npm) sets
`cooldown: default-days: 14`: a routine update only proposes versions
released at least 14 days earlier.

Security updates are not affected: Dependabot does not apply the cooldown to
them, so a fix for a published advisory still comes right away.

## Consequences

- Routine updates lag the newest release by two weeks or more.
- Versions added or bumped by hand are not covered; when adding a dependency,
  pick a version that is at least 14 days old.
- The blocking `npm audit` (ADR 0016) still catches advisories in what the
  site ships.
