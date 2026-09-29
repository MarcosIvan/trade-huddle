import type { ReactNode } from "react";
import styles from "./Section.module.css";

/** A titled page section (h2) with an optional one-line description or figure beside the title. */
export function Section({
  id,
  title,
  subtitle,
  aside,
  className,
  children,
}: {
  id: string;
  title: string;
  subtitle?: string;
  /** Shown on the title's line, at the right (a total, for example). */
  aside?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section
      className={`${styles.section} ${className ?? ""}`}
      aria-labelledby={`${id}-title`}
      id={id}
    >
      <div className={styles.head}>
        <h2 className={styles.title} id={`${id}-title`}>
          {title}
        </h2>
        {subtitle && <p className={styles.sub}>{subtitle}</p>}
        {aside}
      </div>
      {children}
    </section>
  );
}
