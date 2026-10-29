# ADR 0029: Free agency tab: free agent list, pick ideas and pick analyzer

- Status: accepted
- Date: 2026-10-29

## Context

Trades are one way to improve a roster; the waiver wire is the other, and
the more frequent one. The site only used free agents behind the scenes (to
fill open spots in uneven trades, ADR 0007) and listed a few of them among
the position leaders (ADR 0025). Managers had to go back to Sleeper to see
who is available, and nothing told them whether a pickup is worth the
player it costs.

## Decision

A third tab on the league screen, **"Free agency"**, beside "Leaders", for
the NFL and the NBA, in three parts:

- **Free agents** (left): every player on no roster in the league who is on
  a team and has something to show (games this season or last, or a
  projection), at one position, 25 per page. Like Sleeper's player list, it
  shows either **season stats** (games, fantasy points, points per game and
  the position's stat columns, the same ones as the player card's game log)
  or the **projection for the week ahead** (the lineup week; in the NBA the
  game days left in it, summed, with the number of games). Both use the
  league's scoring. It ranks by trade value or by fantasy points. Each row has
  an "Analyze" button that opens the player in the pick analyzer. Logic in
  `lib/model/freeAgency.ts`.
- **Pick ideas** (right): up to three one-for-one moves, add a free agent and
  drop one of your players (`lib/model/pickups.ts`).
  - Candidates: the 10 most valuable free agents at each position a team can
    pick up (the trades' free agent pool: healthy enough to start, on a team)
    who are **available to play**: not out for the season, and at least 50%
    likely to play this week by injury status (the sport's
    `weekAvailability`, as in the weekly lineup), so no one out, doubtful,
    suspended or on injured reserve, however much his value says he is worth
    stashing. They are matched against every player you could drop, except
    those in the injured reserve spots (dropping one frees no roster spot).
  - **Value first, as in trades**: only free agents worth more than the
    player dropped. A move is **green** ("Good pickup") when it gains at least
    1 point of trade value and your starters and bench together lose nothing
    (the trades' `benchDepth`); **red** when it loses trade value or leaves
    your lineup short (the trades' starter checks); **yellow** otherwise. Red moves are
    never suggested; yellow ones only fill in when fewer than three are green.
  - **No piling up a position**: an idea never adds a player at a position
    that would then hold more players than a balanced roster carries (the
    ideal roster's count, injured reserve spots left out) while dropping
    someone at another position: no third QB for a receiver. Adding a QB
    for a QB is still fine. The analyzer allows such a move.
  - Ranked green first, then by trade value gained, then by what your team
    gains. Each idea adds a different free agent and drops a different
    player, so all three can be made together. The first green one gets the
    star.
- **Pick analyzer** (below): pick the player to drop (your roster outside
  the injured reserve spots) and the free agent to add, from a list of the 50
  most valuable at the position chosen above it (every position, kickers and
  defenses included, so streaming them can be checked too). The filter
  follows the player opened from a pick idea or the list's "Analyze" button,
  and both lists start on the same line. It shows the same indicators as the trade analyzer: the
  trade value meter (dropped against added) with the pickup verdict, both
  sides' changes in trade value, points per game and the last games, each
  player's bye week and schedule strength (information only, ADR 0026), what
  your starters and bench gain, and lineup warnings. As in the trade
  analyzer (ADR 0024), roster balance is each manager's call: neither the
  analyzer nor the pick ideas show warnings about it. It starts on the first
  pick idea.

Shared UI pieces: `IdeaFrame` (the card around trade and pick ideas, taken
out of `TradeIdeas`), `ValueBar` inside `BalanceMeter` (behind both the
fairness meter and the new `PickMeter`), `Pagination`, and a single-choice
mode for `PickList`.

## Consequences

- Pick ideas run in the main thread: at most about 40 free agents against
  the roster, a few hundred lineup evaluations, fast enough without a worker.
- Free agents' value comes from the same model as everyone's, so a pickup
  the model rates poorly (a player whose role just changed) is only as good
  as the model's view of him; the projection view of the list shows the
  week's outlook beside it.
- Kickers and defenses are listed but never suggested in pick ideas (in the
  NFL a team picks up only QB, RB, WR and TE in trades, and trade value
  rates kickers and defenses on a fixed small scale).
- The projection view needs a lineup week; after the season only season
  stats are offered.
