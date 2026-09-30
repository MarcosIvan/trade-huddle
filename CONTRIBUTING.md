# Contributing

Thanks for your interest in Trade Huddle. Bug reports, ideas and pull
requests are welcome.

## Before you start

- **Found a bug or have an idea?** Open an
  [issue](https://github.com/MarcosIvan/trade-huddle/issues/new/choose) first,
  so we can agree on the approach before you write code.
- **Found a security problem?** Do not open an issue. Follow
  [SECURITY.md](SECURITY.md).
- **Never share private data.** No Sleeper league IDs, usernames, e-mails,
  keys or screenshots of real leagues in issues, commits or pull requests.
  Use the [demo league](https://marcosivan.github.io/trade-huddle/?demo) to
  show a problem whenever you can.

## Setting up

Requirements: Python 3.12 and Node 22. The steps are in the README, under
[Run it locally](README.md#run-it-locally). How the code is organized is in
[docs/architecture.md](docs/architecture.md).

## Making a change

1. Fork the repository and create a branch with a descriptive name, such as
   `fix/lineup-flex-order` or `feat/idp-values`.
2. Keep the change focused on one thing.
3. Add or update tests: Vitest for the model and site logic, Playwright for
   what the visitor sees, pytest for the pipeline.
4. Run the checks before opening the pull request:

   ```bash
   # from web/
   npm run lint && npm run typecheck && npm test && npm run format:check
   NEXT_PUBLIC_BASE_PATH=/trade-huddle npm run build
   NEXT_PUBLIC_BASE_PATH=/trade-huddle npm run test:e2e

   # from pipeline/ (with the virtualenv active)
   ruff check . && ruff format --check . && mypy src tests && pytest
   ```

5. Open a pull request and fill in the template. CI must pass before merge.

## Changes to the value model

Numbers in the model (weights, blends, thresholds) are product decisions.
When you change one:

- explain why, with evidence (a backtest, a comparison with the market, or
  a set of cases that were wrong before and right after);
- run the relevant backtest (`npm run backtest` and friends, see the README);
- record the decision as a new [ADR](docs/adr/README.md) when it changes how
  value is computed.

## Style

- Formatting is automatic: Prettier for the site, ruff for the pipeline.
- Write code and comments in plain English, and match the surrounding code.
- User-facing text should be short and friendly and use no jargon.
- No inline scripts or styles that would break the
  [Content Security Policy](docs/adr/0009-content-security-policy.md).

## License

By contributing, you agree that your contributions are licensed under the
[MIT License](LICENSE).
