# ADR 0018: Shared front components, logic in the model

- Status: accepted
- Date: 2026-10-08

## Context

The front already kept the model (`lib/model`), Sleeper access
(`lib/sleeper`) and per-component CSS Modules apart. As features piled up,
some pieces were copied instead of shared, and some calculations lived in
components:

- the player card and the news repeated the same `<dialog>` (open, close on
  the backdrop, title with a kicker, close button) and its CSS;
- the weekly lineup and the player card each had their own Good / Neutral /
  Tough badge, with the same logic, wording and CSS;
- `PlayerCard.tsx`, `TradeAnalyzer.tsx` and `LeagueScreen.tsx` held several
  components each;
- `weekLineup` (in `WeeklyLineup.tsx`) and `rosterNotes` (in
  `TradeIdeas.tsx`, used by the analyzer) were calculations inside
  components, and `weekLineup` used the NFL config directly.

The owner asked for reusable components before the NBA version, so NBA
screens reuse these pieces instead of copying them.

## Decision

- **`Modal` + `ModalHeader`** (`components/Modal.tsx`): one dialog with two
  widths (`narrow` for text, `wide` for tables). The player card and the news
  use it.
- **`MatchupBadge`** (`components/MatchupBadge.tsx`) with its logic in
  `lib/model/matchup.ts`: `matchupLevel` (moved from `playerCard.ts`) and
  `matchupNote`, the tooltip's sentence.
- **Calculations out of components:** `weekLineup` → `lib/model/weekLineup.ts`
  (now takes the sport config); `rosterNotes` and the analyzer's
  `sideChange` → `lib/model/analyzer.ts`. All three have unit tests.
- **Big files split by part:** `PlayerCard` (provider and name),
  `PlayerCardPanel` (totals and rank) and `GameLog` (the season table);
  `TradeAnalyzer` with `PickList` and `TradeSide`; `LeaguePicker` on its own.
  Each one has its own CSS Module.
- **Component tests without new dependencies:** shared components are
  rendered to HTML with `react-dom/server` in Vitest. Interaction is still
  covered by the Playwright end-to-end tests. We chose not to add Testing
  Library and jsdom for a handful of tests.
- **No visual change.** Screenshots of the demo league, a mocked real
  league, the player card, the news and the analyzer, in both themes and at
  desktop and phone widths, are pixel-identical before and after.

## Consequences

- A new dialog or matchup label is one import, and the NBA screens can reuse
  the same pieces.
- `TradeSide` still reads the recent-games count from the NFL config, as the
  analyzer did. Passing the sport through is part of the NBA work.
