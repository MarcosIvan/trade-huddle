import styles from "./SiteChrome.module.css";

/** Link to the source code, set at build time (e.g. https://github.com/<owner>/<repo>). */
const REPO_URL = process.env.NEXT_PUBLIC_REPO_URL ?? "";
const SAFE_REPO_URL = /^https:\/\/github\.com\/[\w.-]+\/[\w.-]+$/.test(REPO_URL) ? REPO_URL : "";

function Logo() {
  return (
    <svg className={styles.logo} width="30" height="30" viewBox="0 0 32 32" aria-hidden="true">
      <rect className={styles.logoBg} width="32" height="32" rx="7" />
      <path
        d="M8 12h13l-3-3M24 20H11l3 3"
        className={styles.logoArrows}
        strokeWidth="2.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function SiteHeader({ onHome }: { onHome?: () => void }) {
  return (
    <header className={styles.band}>
      <div className={`container ${styles.bandInner}`}>
        <a
          className={styles.brand}
          href="./"
          onClick={(e) => {
            if (onHome) {
              e.preventDefault();
              onHome();
            }
          }}
        >
          <Logo />
          Trade Huddle
        </a>
        <span className={styles.tagline}>Fair trades for Sleeper leagues</span>
      </div>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className={styles.footer}>
      <div className={`container ${styles.footerInner}`}>
        <span>
          Independent open-source project, not affiliated with Sleeper. Data comes from
          Sleeper&apos;s public API.
        </span>
        {SAFE_REPO_URL && (
          <a href={SAFE_REPO_URL} rel="noopener noreferrer">
            Source code
          </a>
        )}
      </div>
    </footer>
  );
}
