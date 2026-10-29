import styles from "./Pagination.module.css";

/** Previous and next buttons around "Page N of M", for a list shown a page at a time. */
export function Pagination({
  label,
  page,
  pages,
  onPage,
}: {
  /** What is paged, for screen readers ("Free agents"). */
  label: string;
  page: number;
  pages: number;
  onPage: (page: number) => void;
}) {
  if (pages <= 1) return null;
  return (
    <nav className={styles.pagination} aria-label={`${label} pages`}>
      <button type="button" className="btn" onClick={() => onPage(page - 1)} disabled={page <= 1}>
        <span aria-hidden="true">‹ </span>Previous
      </button>
      <span className={styles.status} aria-live="polite">
        Page {page} of {pages}
      </span>
      <button
        type="button"
        className="btn"
        onClick={() => onPage(page + 1)}
        disabled={page >= pages}
      >
        Next<span aria-hidden="true"> ›</span>
      </button>
    </nav>
  );
}
