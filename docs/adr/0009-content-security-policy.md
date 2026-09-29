# ADR 0009: Content Security Policy by hash, in a meta tag

- Status: accepted
- Date: 2026-09-29

## Context

The site shows data from Sleeper (team names, usernames, player names) that
anyone can set, so a Content Security Policy is the second line of defence
behind React's escaping: even if markup got in, it must not run.

Two constraints shape it:

- **GitHub Pages can't send headers.** The policy has to be a
  `<meta http-equiv="Content-Security-Policy">` tag. A meta policy ignores
  `frame-ancestors`, `report-uri`/`report-to` and `sandbox`.
- **Next's static export writes inline scripts** into every page (the React
  Server Components payload, `self.__next_f.push(...)`). `script-src 'self'`
  alone would block them and break the site; `'unsafe-inline'` would defeat
  the policy.

## Decision

A post-build step, `web/scripts/csp.mjs`, runs as part of `npm run build`
(`next build && node scripts/csp.mjs out`), so CI and the deploy both apply
it. For every HTML file in `out/` it hashes each inline script (SHA-256) and
injects, right after `<meta charset>` and before any script or stylesheet:

```
default-src 'none';
script-src 'self' 'sha256-…' …;   (this page's inline scripts only)
style-src 'self';
img-src 'self';
font-src 'self';
connect-src 'self' https://api.sleeper.app;
worker-src 'self';
manifest-src 'self';
base-uri 'none';
form-action 'none';
object-src 'none'
```

- **No `'unsafe-inline'` and no `'unsafe-eval'`, for scripts or styles.**
  Styles come from CSS files (CSS Modules, local fonts). The inline `style`
  values React sets at runtime (for example the width of the fairness bar)
  go through the CSSOM, which a policy doesn't block.
- **The build fails** on markup the policy would break silently: a `<style>`
  block, a `style=""` attribute, an inline event handler (`onclick=`) or a
  `javascript:` URL. Next's default 404 page used inline styles, so the site
  has its own (`app/not-found.tsx`) styled from CSS.
- **Stricter than the plan's baseline:** `img-src` has no `data:` because
  nothing uses data URIs, and `worker-src`/`manifest-src` are explicit.
- The JSON-LD block is hashed too. Browsers don't run it, but a hash costs
  nothing and keeps the rule simple: every inline script is listed.
- `npm run build` chains the step instead of using a `postbuild` script,
  because `.npmrc` sets `ignore-scripts=true`, which also skips `post*`
  scripts.

## Accepted limits

- **`'self'` is the whole `github.io` origin** of the owner, so a page from
  another of the owner's repositories could be loaded as a script. The same
  person controls both; a custom domain would remove this.
- **No clickjacking protection.** `frame-ancestors` doesn't work in a meta
  tag and Pages can't send `X-Frame-Options`. The site has no login and no
  actions on anyone's behalf, so framing it gains an attacker little.
- **No violation reports.** A meta policy can't send them. The CSP is
  checked instead by the build guard and by a browser run of the built site.

## Verification

- `scripts/csp.test.mjs` (Vitest) covers:
  - the spec's example hash;
  - inline scripts read exactly, and `src` scripts skipped;
  - the policy's exact directives;
  - injection before any script;
  - rerunning without a second tag;
  - build failures for each kind of blocked markup;
  - nested pages.
- The built site, served like Pages under `/trade-huddle/`, was used end to
  end in Chromium with zero violations:
  - entry, a username search against `api.sleeper.app` and the theme toggle;
  - the demo league, trade ideas and the finder (Web Workers), the ideal
    roster, the analyzer and "Change league";
  - the 404 page.
- Negative control on the same page: an injected inline script did not run,
  and an injected `<style>` and an outside image were blocked. All three
  were reported as violations.
