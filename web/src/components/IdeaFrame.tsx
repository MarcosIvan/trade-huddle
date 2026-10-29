import type { ReactNode } from "react";
import type { Player } from "@/lib/model";
import { NewsButton } from "./News";
import { PlayerName } from "./PlayerCard";
import { PosBadges, TradeValue, useTradeValueHint } from "./Player";
import styles from "./IdeaFrame.module.css";

/** One side of an idea: a label and its players, each with positions and trade value. */
export function IdeaSide({ label, players }: { label: string; players: readonly Player[] }) {
  const TRADE_VALUE_HINT = useTradeValueHint();
  return (
    <div className={styles.side}>
      <span className="label">{label}</span>
      <ul>
        {players.map((p) => (
          <li key={p.id}>
            <span className={styles.playerName}>
              <PlayerName player={p} />
              {/* A word joiner keeps the news icon on the name's last line. */}
              {"⁠"}
              <span className={styles.nowrap}>
                <NewsButton id={p.id} name={p.name} pos={p.pos} />
              </span>
            </span>
            <span className={styles.positions}>
              <PosBadges player={p} />
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

/** A small rounded label under an idea; "plus" marks something in its favor. */
export function IdeaChip({
  tone,
  title,
  children,
}: {
  tone?: "plus";
  title?: string;
  children: ReactNode;
}) {
  return (
    <span className={`${styles.chip} ${tone === "plus" ? styles.plus : ""}`} title={title}>
      {children}
    </span>
  );
}

/**
 * The card around a trade or pick idea: an optional star, a title, the two
 * sides, chips with what changes, a meter and the button that opens it in the
 * analyzer.
 */
export function IdeaFrame({
  titleId,
  title,
  star,
  sides,
  chips,
  meter,
  onOpen,
}: {
  titleId: string;
  title: ReactNode;
  /** The star's words ("Best match"); none without a star. */
  star: string | null;
  sides: ReactNode;
  chips: ReactNode;
  meter: ReactNode;
  onOpen: () => void;
}) {
  return (
    <article
      className={`card ${styles.card} ${star ? styles.starred : ""}`}
      aria-labelledby={titleId}
    >
      {star && (
        <p className={styles.star}>
          <span aria-hidden="true">★</span> {star}
        </p>
      )}
      <div className={styles.head}>
        <h3 className={styles.title} id={titleId}>
          {title}
        </h3>
      </div>
      <div className={styles.swap}>{sides}</div>
      <div className={styles.impacts}>{chips}</div>
      {meter}
      <div className={styles.foot}>
        <button type="button" className={`btn ${styles.openBtn}`} onClick={onOpen}>
          Open in analyzer
        </button>
      </div>
    </article>
  );
}

/** A team's handle beside its name in an idea's title. */
export function IdeaHandle({ handle }: { handle: string }) {
  return <span className={styles.handle}>@{handle}</span>;
}
