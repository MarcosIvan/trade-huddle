import { useId, useMemo, useState, type KeyboardEvent } from "react";
import { fmt } from "@/lib/format";
import type { Player } from "@/lib/model";
import { searchByName } from "@/lib/playerSearch";
import { PosBadges } from "./Player";
import styles from "./PlayerSearch.module.css";

export interface SearchablePlayer {
  player: Player;
  /** Where he is, shown under his name (his fantasy team). */
  where: string;
  value: number;
}

/**
 * A text field that lists the players whose names match what is typed (an
 * ARIA combobox): arrow keys move through them, Enter picks one, Escape closes.
 */
export function PlayerSearch({
  label,
  players,
  selectedId,
  onSelect,
}: {
  label: string;
  players: readonly SearchablePlayer[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
}) {
  const id = useId();
  const listId = `${id}-list`;
  const selected = players.find((s) => s.player.id === selectedId);
  // What is typed; null shows the chosen player's name.
  const [typed, setTyped] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const text = typed ?? selected?.player.name ?? "";
  const matches = useMemo(
    () => (typed === null ? [] : searchByName(players, typed, (s) => s.player.name)),
    [players, typed],
  );
  const shown = open && typed !== null && typed.trim() !== "";

  const pick = (s: SearchablePlayer) => {
    onSelect(s.player.id);
    setTyped(null);
    setOpen(false);
  };
  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      setOpen(true);
      if (matches.length) {
        const step = e.key === "ArrowDown" ? 1 : -1;
        setActive((active + step + matches.length) % matches.length);
      }
    } else if (e.key === "Enter" && shown && matches[active]) {
      e.preventDefault();
      pick(matches[active]);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  };

  return (
    <div className={`field ${styles.search}`}>
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        className="input"
        type="text"
        role="combobox"
        autoComplete="off"
        spellCheck={false}
        placeholder="Type a player's name…"
        aria-autocomplete="list"
        aria-expanded={shown}
        aria-controls={listId}
        aria-activedescendant={shown && matches[active] ? `${id}-${active}` : undefined}
        value={text}
        onChange={(e) => {
          setTyped(e.target.value);
          setActive(0);
          setOpen(true);
          if (selectedId) onSelect(null);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onKeyDown={onKey}
      />
      <ul id={listId} role="listbox" aria-label={label} className={styles.list} hidden={!shown}>
        {matches.map((s, i) => (
          <li
            key={s.player.id}
            id={`${id}-${i}`}
            role="option"
            aria-selected={i === active}
            className={`${styles.option} ${i === active ? styles.active : ""}`}
            // Picks before the input's blur closes the list.
            onMouseDown={(e) => {
              e.preventDefault();
              pick(s);
            }}
            onMouseEnter={() => setActive(i)}
          >
            <span className={styles.name}>{s.player.name}</span>
            <span className={styles.value}>{fmt(s.value)}</span>
            <span className={styles.sub}>
              <PosBadges player={s.player} />
              <span>{s.where}</span>
            </span>
          </li>
        ))}
        {shown && !matches.length && (
          <li role="presentation" className={styles.none}>
            No player on another team matches “{typed}”.
          </li>
        )}
      </ul>
    </div>
  );
}
