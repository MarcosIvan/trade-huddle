import { useRef, type KeyboardEvent } from "react";
import styles from "./Tabs.module.css";

/**
 * A row of tabs (ARIA tablist) for panels the caller renders with
 * `tabPanelProps`. Arrow keys, Home and End move between tabs.
 */
export function Tabs<T extends string>({
  id,
  label,
  tabs,
  value,
  onChange,
}: {
  id: string;
  label: string;
  tabs: readonly { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
}) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const onKey = (e: KeyboardEvent, i: number) => {
    const last = tabs.length - 1;
    const next =
      e.key === "ArrowRight"
        ? (i + 1) % tabs.length
        : e.key === "ArrowLeft"
          ? (i + last) % tabs.length
          : e.key === "Home"
            ? 0
            : e.key === "End"
              ? last
              : null;
    if (next === null) return;
    e.preventDefault();
    onChange(tabs[next]!.value);
    refs.current[next]?.focus();
  };
  return (
    <div role="tablist" aria-label={label} className={styles.tabs}>
      {tabs.map((t, i) => {
        const on = t.value === value;
        return (
          <button
            key={t.value}
            ref={(el) => {
              refs.current[i] = el;
            }}
            type="button"
            role="tab"
            id={`${id}-tab-${t.value}`}
            aria-selected={on}
            aria-controls={`${id}-panel-${t.value}`}
            tabIndex={on ? 0 : -1}
            className={`${styles.tab} ${on ? styles.on : ""}`}
            onClick={() => onChange(t.value)}
            onKeyDown={(e) => onKey(e, i)}
          >
            {t.label}
          </button>
        );
      })}
    </div>
  );
}

/** Props for the panel of a tab of `Tabs` with the same `id`. */
export function tabPanelProps(id: string, value: string) {
  return {
    role: "tabpanel",
    id: `${id}-panel-${value}`,
    "aria-labelledby": `${id}-tab-${value}`,
    tabIndex: 0,
  } as const;
}
