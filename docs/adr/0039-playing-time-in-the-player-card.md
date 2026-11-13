# ADR 0039: Playing time in the player card

- Status: accepted
- Date: 2026-11-13
- Amends: ADR 0015 (player card)

## Context

The player card's game log shows each game's fantasy points and stat line.
How much a player was on the field says as much about his role as his stats:
a receiver on 90% of the snaps with a quiet game is not one on 40%.

## Decision

The game log shows the player's playing time right after the fantasy points,
colored against the position like every other stat (`playingTime` in the
sport config, `cardColumns` and `columnValue` in `model/playerCard.ts`):

- **NFL: snap share (Snap%)**, the player's offensive snaps over his team's
  (`off_snp` / `tm_off_snp`), as a percentage. The total row shows the
  season's share. A game with no snap counts yet (Sleeper fills them a day
  or two after the game) shows a dash and no color.
- **NBA: minutes (Min)**, from the seconds on court (`sp` / 60): last
  season's totals carry seconds, not minutes, and the position's average
  needs both seasons.

The pipeline keeps `off_snp` and `tm_off_snp`, which its exclusions dropped
(`keep_exact` in `sports.py`). The NFL file grows about 8% (20 KB gzipped).

A column can now be a share of another stat (`per`), scaled (`scale`) or
whole (`whole`); the position's average of a share is the share of the
averages.

## Alternatives considered

- **Snap counts and share** (two columns): the share alone says the role;
  the count makes the table wider on a phone.
- **NBA `min`**: present in this season's games, missing from last season's
  totals, so the position's average came out far too low.

## Consequences

- Positions without a game log (kickers, defenses) show no playing time.
- Nothing in the model changes: playing time is information.
