import type { ReactNode } from "react";
import styles from "./Section.module.css";

/** A titled page section (h2) with an optional one-line description. */
export function Section({
  id,
  title,
  subtitle,
  className,
  children,
}: {
  id: string;
  title: string;
  subtitle?: string;
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
      </div>
      {children}
    </section>
  );
}
