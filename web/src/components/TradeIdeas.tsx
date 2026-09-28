import { fmt } from "@/lib/format";
import type { Team } from "@/lib/league";
import type { Player, TradeIdea, TradeResult } from "@/lib/model";
import { BalanceMeter } from "./BalanceMeter";
import { Delta, PosBadge, TRADE_VALUE_HINT } from "./Player";
import styles from "./TradeIdeas.module.css";

export function rosterNotes(r: TradeResult, partnerName: string): string[] {
  const notes: string[] = [];
  if (r.myOpen) {
    notes.push(
      `You open ${r.myOpen} roster spot(s); the numbers assume you add the best available free agent.`,
    );
  }
  if (r.theirOpen) {
    notes.push(
      `You get more players than you send, so you'll need to drop ${r.theirOpen}. ${partnerName} opens ${r.theirOpen} spot(s) for a free agent.`,
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
  onOpen,
}: {
  idea: TradeIdea;
  index: number;
  partner: Team | undefined;
  onOpen: () => void;
}) {
  const name = partner?.name ?? "Unknown team";
  const notes = rosterNotes(idea, name);
  const titleId = `idea-${index}-title`;
  return (
    <article className={`card ${styles.card}`} aria-labelledby={titleId}>
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
      </div>
      <BalanceMeter vGive={idea.vGive} vGet={idea.vGet} />
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
            <b>No trade improves both teams right now.</b>
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
