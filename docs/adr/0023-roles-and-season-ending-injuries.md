# ADR 0023: Roles from the depth chart, and season-ending injuries

- Status: accepted
- Date: 2026-10-15
- Amends: ADR 0010 (trade value), ADR 0013 (injury discount)

## Context

Before week 6 of the 2026 season, while weighing real trade offers, the
product owner found trade values that did not match what was happening on
the field:

- **A season-ending injury kept most of the value.** Every player on IR keeps
  70% of his trade value (ADR 0013), since most come back. A starter who tore
  his ACL in week 3 was still valued like a starting running back.
- **A player who took over a starting job stayed tied to his preseason
  prior.** A deep backup whose starter went down, now playing nearly every
  snap, was valued like a backup: his prior (about 1 point per game) still
  weighed 8 / (8 + games), and the measures built from it (base, scarcity)
  sat near zero. The trade analyzer called a third-string back on IR for him
  a fair 1-for-1.
- **Backups were valued like starters.** Fourth-string quarterbacks and deep
  backups on IR kept values of 12 to 18 of 40 from last season and their
  draft position, while real trade values from real leagues did not list
  them at all. The model had no idea of a player's place on his team.

The trade values of a real 12-team PPR league were compared, offline, with
current redraft trade values from real leagues (196 players), as in ADR 0010
and ADR 0013. Rank correlation was 0.920 (QB 0.906, RB 0.950, WR 0.937, TE
0.880), and the gaps did **not** follow usage: a player's share of his
team's targets and carries, and its trend, were uncorrelated with the gap
(|r| ≤ 0.16 at every position). Weighting usage more overall would not help.
The gaps were the three cases above.

Sleeper's player directory has what was missing: each player's spot on his
team's depth chart (slot and order) and, with an injury status, the injured
body part ("Knee - ACL").

## Decision

The data pipeline keeps two more fields for the current season: `ib`, the
injured body part, and `dc`, the depth chart `[slot, order]`. The model
(`model/role.ts`) reads them, NFL only (the NBA keeps both rules off):

**Season over.** On IR with a torn ACL or Achilles (`seasonEnding`), and hurt
this season (he has played): his value and trade value go to their floor (0
points, trade value 1), and he is never started. An old tear he is coming
back from (no games yet, often on PUP) is left to his injury status.

**Lead.** First on the depth chart, at least 2 games played, usage over his
last 2 games at least half a lead player's (`leadUsage` 0.5 of the trade
value's `leadShare`; for a quarterback, he played his team's last game), and
a prior at most 40% of his recent form (`formJump`). He took the job this
season, so:

- the prior fades as 2 / (2 + games) instead of 8 / (8 + games)
  (`reliabilityGames`), in both his points and his trade value;
- the trade value's base measure uses his expected points instead of the prior.

**Backup.** Behind the starters on the depth chart (QB past the 1st, RB past
the 2nd, WR past the 1st at his slot, TE past the 1st) with usage over his
last 2 games below 35% of a lead player's, and not injured (an injured player
drops down the depth chart while out; his injury status already discounts
him). He keeps 60% of his trade value (`backupValue`). His points per game
do not change: they say what he scores when he plays.

## Results

On the same league and market: rank correlation 0.921 (QB 0.918, RB 0.957,
WR 0.927, TE 0.892). Players who took over a job moved 8 to 14 places up
their position, to within 2-3 places of the market; season-ending injuries
and backups the market does not list lost most of their value. WR dipped
slightly: a few receivers listed deep on the depth chart with little usage
lost value the market still gives them on name.

## Alternatives considered

- **Discount IR players by the games their team has played without them.**
  Tested and dropped: it cut players the market expects back soon (a few
  games out with a sprain), and missed a fresh season-ending tear (only two
  games out).
- **Read the injury from player news.** More precise in principle, but free
  text is fragile; the body part is a structured field.
- **A larger usage weight in trade value.** The gaps did not follow usage.
- **Usage over 4 games and a 60% bar for a lead.** Missed backs who took the
  job two games ago; a 60% form bar also caught established stars on a hot
  streak.

## Consequences

- Depth charts lag and are sometimes odd; usage guards both calls (a lead
  needs lead usage, a backup needs low usage), and injured players are never
  called backups.
- The new fields appear after the next data build; until then the rules do
  nothing.
- Weights, the scale and the reputation lift are unchanged.
