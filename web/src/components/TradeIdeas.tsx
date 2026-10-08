import type { Team } from "@/lib/league";
import { isTrueMatch, type Player, type TradeIdea } from "@/lib/model";
import { BalanceMeter } from "./BalanceMeter";
import { NewsButton } from "./News";
import { PlayerName } from "./PlayerCard";
import { Delta, PosBadge, TRADE_VALUE_HINT, TradeValue } from "./Player";
import styles from "./TradeIdeas.module.css";

function Side({ label, players }: { label: string; players: Player[] }) {
  return (
    <div className={styles.side}>
      <span className="label">{label}</span>
      <ul>
        {players.map((p) => (
          <li key={p.id}>
            <span className={styles.playerName}>
              <PosBadge pos={p.pos} />
              <span>
                <PlayerName player={p} />
                <NewsButton id={p.id} name={p.name} pos={p.pos} />
              </span>
            </span>
            <span className={styles.tradeValue} title={TRADE_VALUE_HINT}>
              <TradeValue player={p} />
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function IdeaCard({
  idea,
  index,
  partner,
  star,
  idPrefix = "idea",
  onOpen,
}: {
  idea: TradeIdea;
  index: number;
  partner: Team | undefined;
  /** "match" for a true match, "closest" for the nearest one when none is. */
  star: "match" | "closest" | null;
  /** Keeps heading ids unique when several lists of cards share the page. */
  idPrefix?: string;
  onOpen: () => void;
}) {
  const name = partner?.name ?? "Unknown team";
  const titleId = `${idPrefix}-${index}-title`;
  return (
    <article
      className={`card ${styles.card} ${star ? styles.starred : ""}`}
      aria-labelledby={titleId}
    >
      {star && (
        <p className={styles.star}>
          <span aria-hidden="true">★</span> {star === "match" ? "Best match" : "Closest to a match"}
        </p>
      )}
      <div className={styles.head}>
        <h3 className={styles.title} id={titleId}>
          {name}
          {partner?.handle && <span className={styles.handle}>@{partner.handle}</span>}
        </h3>
      </div>
      <div className={styles.swap}>
        <Side label="You send" players={idea.give} />
        <Side label="You get" players={idea.get} />
      </div>
      <div className={styles.impacts}>
        <span className={styles.chip}>
          Your starters <Delta value={idea.dMe} />
        </span>
        <span className={styles.chip}>
          Their starters <Delta value={idea.dThem} />
        </span>
        {Math.abs(idea.depthMe) >= 0.1 && (
          <span className={styles.chip} title="Change in your best backups (20% of their points)">
            Your bench <Delta value={idea.depthMe} />
          </span>
        )}
        {idea.benchShare >= 0.25 && (
          <span className={`${styles.chip} ${styles.plus}`}>Sends a player from your bench</span>
        )}
      </div>
      <BalanceMeter sGive={idea.sGive} sGet={idea.sGet} fairness={idea.fairness} />
      <div className={styles.foot}>
        <button type="button" className={`btn ${styles.openBtn}`} onClick={onOpen}>
          Open in analyzer
        </button>
      </div>
    </article>
  );
}

export function TradeIdeas({
  ideas,
  searching,
  teams,
  onOpen,
}: {
  ideas: TradeIdea[];
  searching: boolean;
  teams: Team[];
  onOpen: (idea: TradeIdea) => void;
}) {
  return (
    <div aria-live="polite" aria-busy={searching}>
      {searching ? (
        <p className={`card ${styles.searching}`}>Searching every team for trades…</p>
      ) : ideas.length === 0 ? (
        <div className={`card ${styles.empty}`}>
          <p>
            <b>No fair trade improves both teams right now.</b>
          </p>
          <p className="hint">
            This happens when rosters don&apos;t complement each other, or when your starters are
            already the best options available. Build an offer in the analyzer below, or check back
            after the next round of games.
          </p>
        </div>
      ) : (
        <div className={styles.list}>
          {ideas.map((idea, i) => (
            <IdeaCard
              star={
                !idea.problems && isTrueMatch(idea)
                  ? "match"
                  : i === 0 && !ideas.some((r) => !r.problems && isTrueMatch(r))
                    ? "closest"
                    : null
              }
              key={`${idea.partner}-${idea.give.map((p) => p.id).join()}-${idea.get.map((p) => p.id).join()}`}
              idea={idea}
              index={i}
              partner={teams.find((t) => t.rid === idea.partner)}
              onOpen={() => onOpen(idea)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
