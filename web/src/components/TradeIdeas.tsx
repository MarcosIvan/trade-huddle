import { fmt } from "@/lib/format";
import type { Team } from "@/lib/league";
import {
  isTrueMatch,
  type Player,
  type TradeIdea,
  type TradeResult,
  type Valued,
} from "@/lib/model";
import { BalanceMeter } from "./BalanceMeter";
import { Delta, PosBadge, TRADE_VALUE_HINT } from "./Player";
import styles from "./TradeIdeas.module.css";

function pickupText(p: Valued): string {
  if ("freeAgent" in p) return `a free agent at ${p.pos}`;
  const team = "team" in p && typeof p.team === "string" && p.team ? `, ${p.team}` : "";
  return `${p.name} (${p.pos}${team}, ${fmt(p.value)} pts/g)`;
}

const list = (players: Valued[]) => players.map(pickupText).join(" and ");

/** What happens to roster spots in an uneven trade, naming the free agents to add. */
export function rosterNotes(r: TradeResult, partnerName: string): string[] {
  const notes: string[] = [];
  if (r.myOpen) {
    notes.push(
      `You open ${r.myOpen} roster spot${r.myOpen > 1 ? "s" : ""}. Best free agent to add: ${list(r.myPickups)}. The numbers include him.`,
    );
  }
  if (r.theirOpen) {
    notes.push(
      `You get more players than you send, so you'll need to drop ${r.theirOpen}. ${partnerName} opens ${r.theirOpen} spot${r.theirOpen > 1 ? "s" : ""} and would add ${list(r.theirPickups)}.`,
    );
  }
  return notes;
}

function Side({ label, players }: { label: string; players: Player[] }) {
  return (
    <div className={styles.side}>
      <span className="label">{label}</span>
      <ul>
        {players.map((p) => (
          <li key={p.id}>
            <span className={styles.playerName}>
              <PosBadge pos={p.pos} />
              {p.name}
            </span>
            <span className={styles.tradeValue} title={TRADE_VALUE_HINT}>
              {fmt(p.vorp)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function IdeaCard({
  idea,
  index,
  partner,
  star,
  onOpen,
}: {
  idea: TradeIdea;
  index: number;
  partner: Team | undefined;
  /** "match" for a true match, "closest" for the nearest one when none is. */
  star: "match" | "closest" | null;
  onOpen: () => void;
}) {
  const name = partner?.name ?? "Unknown team";
  const notes = rosterNotes(idea, name);
  const titleId = `idea-${index}-title`;
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
          With {name}
        </h3>
        <span className={styles.tag}>
          Idea {index + 1}
          {partner?.record ? ` · ${partner.record}` : ""}
        </span>
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
        <span className="hint">pts per game</span>
        {idea.benchShare >= 0.25 && (
          <span className={`${styles.chip} ${styles.plus}`}>Sends a player from your bench</span>
        )}
      </div>
      <BalanceMeter sGive={idea.sGive} sGet={idea.sGet} fairness={idea.fairness} />
      {notes.length > 0 && <p className="hint">{notes.join(" ")}</p>}
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
                isTrueMatch(idea) ? "match" : i === 0 && !ideas.some(isTrueMatch) ? "closest" : null
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
