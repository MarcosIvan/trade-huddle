"use client";

import { useEffect, useRef, type ReactNode } from "react";
import styles from "./Modal.module.css";

/**
 * A modal dialog: opens when `open` turns true, closes on Escape, on a click
 * on the backdrop or with the header's close button, and then calls `onClose`.
 */
export function Modal({
  open,
  labelledBy,
  size = "narrow",
  onClose,
  children,
}: {
  open: boolean;
  /** Id of the dialog's title (ModalHeader's `id`). */
  labelledBy: string;
  /** narrow (560 px) for text, wide (760 px) for tables. */
  size?: "narrow" | "wide";
  onClose: () => void;
  children: ReactNode;
}) {
  const dialog = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    if (open && !dialog.current?.open) dialog.current?.showModal();
  }, [open]);

  return (
    <dialog
      ref={dialog}
      className={`${styles.dialog} ${styles[size]}`}
      aria-labelledby={labelledBy}
      onClose={onClose}
      onClick={(e) => {
        // A click on the backdrop (outside the panel) closes it.
        if (e.target === e.currentTarget) e.currentTarget.close();
      }}
    >
      {open && <div className={styles.panel}>{children}</div>}
    </dialog>
  );
}

/** The dialog's title (a small kicker above it) and the close button, which takes the focus. */
export function ModalHeader({
  id,
  kicker,
  children,
}: {
  id: string;
  kicker: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className={styles.head}>
      <h2 id={id} className={styles.title}>
        <span className={styles.kicker}>{kicker}</span>
        {children}
      </h2>
      <button
        type="button"
        className={`btn ${styles.close}`}
        aria-label="Close"
        autoFocus
        onClick={(e) => e.currentTarget.closest("dialog")?.close()}
      >
        <span aria-hidden="true">✕</span>
      </button>
    </div>
  );
}
