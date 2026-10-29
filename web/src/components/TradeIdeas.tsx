import type { Team } from "@/lib/league";
import { isTrueMatch, type TradeIdea } from "@/lib/model";
import { BalanceMeter } from "./BalanceMeter";
import { IdeaChip, IdeaFrame, IdeaHandle, IdeaSide } from "./IdeaFrame";
import { Delta } from "./Player";
import styles from "./TradeIdeas.module.css";

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
  return (
    <IdeaFrame
      titleId={`${idPrefix}-${index}-title`}
      title={
        <>
          {partner?.name ?? "Unknown team"}
          {partner?.handle && <IdeaHandle handle={partner.handle} />}
        </>
      }
      star={star === "match" ? "Best match" : star === "closest" ? "Closest to a match" : null}
      sides={
        <>
          <IdeaSide label="You send" players={idea.give} />
          <IdeaSide label="You get" players={idea.get} />
        </>
      }
      chips={
        <>
          <IdeaChip>
            Your starters <Delta value={idea.dMe} />
          </IdeaChip>
          <IdeaChip>
            Their starters <Delta value={idea.dThem} />
          </IdeaChip>
          {Math.abs(idea.depthMe) >= 0.1 && (
            <IdeaChip title="Change in your best backups (20% of their points)">
              Your bench <Delta value={idea.depthMe} />
            </IdeaChip>
          )}
          {idea.benchShare >= 0.25 && (
            <IdeaChip tone="plus">Sends a player from your bench</IdeaChip>
          )}
        </>
      }
      meter={<BalanceMeter sGive={idea.sGive} sGet={idea.sGet} fairness={idea.fairness} />}
      onOpen={onOpen}
    />
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
