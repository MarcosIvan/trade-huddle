# ADR 0016: npm audit blocks on production dependencies only

- Status: accepted
- Date: 2026-10-08

## Context

CI ran `npm audit --audit-level=high` on every dependency and failed the
build on any high or critical advisory. In October 2026 an advisory against
`braces` (stack exhaustion through deeply nested patterns, GHSA-vfj7-8cjw-p6xm)
had no fixed version at all. It reaches us only through the lint config
(`eslint-config-next` → `@next/eslint-plugin-next` → `fast-glob` →
`micromatch` → `braces`), which runs on our own lint patterns and never
reaches the browser. No update could clear it, so every pull request,
including dependency updates that fixed real advisories in `next`, failed CI.

## Decision

- **Blocking:** `npm audit --omit=dev --audit-level=high`: what ships in
  the static site (`next`, `react`, and what they pull in).
- **Warning only:** the full `npm audit --audit-level=high` still runs in a
  separate step. When it finds something, it adds a warning annotation to the
  run instead of failing it.
- Dependabot keeps opening update pull requests for dev tools as before.

The other option was to keep the full audit blocking and ignore that one
advisory with an exception script. The owner preferred the split above.

## Consequences

- A dev-tool advisory with no fix no longer blocks unrelated work. It stays
  visible as a warning on every run until a fix comes out.
- A dev-tool advisory with a fix is no longer forced by CI. It is picked up
  through Dependabot's updates or `npm audit fix`.
- Build tools that run in CI (Next's compiler, PostCSS) are production
  dependencies of `next`, so they stay under the blocking audit.
