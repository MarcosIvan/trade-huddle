import { useId } from "react";
import styles from "./Segmented.module.css";

/** A row of radio buttons drawn as one segmented control, under a legend. */
export function Segmented<T extends string | number>({
  legend,
  options,
  value,
  onChange,
}: {
  legend: string;
  options: readonly { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
}) {
  const name = useId();
  return (
    <fieldset className={styles.group}>
      <legend className="label">{legend}</legend>
      <div className={styles.segmented}>
        {options.map((o) => (
          <label
            key={o.value}
            className={`${styles.segment} ${value === o.value ? styles.on : ""}`}
          >
            <input
              type="radio"
              name={name}
              value={o.value}
              checked={value === o.value}
              onChange={() => onChange(o.value)}
            />
            <span>{o.label}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
