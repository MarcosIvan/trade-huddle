import type { Metadata } from "next";
import Link from "next/link";
import styles from "./not-found.module.css";

export const metadata: Metadata = {
  title: "Page not found | Trade Huddle",
  robots: { index: false },
};

/**
 * GitHub Pages serves this for any unknown address. Our own page, styled from
 * CSS files: Next's default one uses inline styles, which the Content
 * Security Policy blocks.
 */
export default function NotFound() {
  return (
    <main className={`container ${styles.page}`}>
      <p className={styles.code}>404</p>
      <h1 className={styles.title}>Page not found</h1>
      <p className={styles.text}>This address doesn&apos;t exist on Trade Huddle.</p>
      <Link className="btn btn-primary" href="/">
        Go to Trade Huddle
      </Link>
    </main>
  );
}
