import type { ReactNode } from "react";
import type { NoticeKind } from "@/lib/league";
import styles from "./Notices.module.css";

const TEXT: Record<NoticeKind, ReactNode> = {
  demo: (
    <>
      <b>Demo league.</b> Players, teams and numbers are fictional. To use your own league, choose
      Trade Huddle at the top and enter your Sleeper username.
    </>
  ),
  dynasty: (
    <>
      <b>Dynasty league.</b> Values only consider this season (redraft logic). Age, future outlook
      and draft picks are not included.
    </>
  ),
  keeper: (
    <>
      <b>Keeper league.</b> Values only consider this season. Keeper costs and future seasons are
      not included.
    </>
  ),
  idp: (
    <>
      <b>IDP slots.</b> Individual defensive players are not valued yet, so IDP slots are left out
      of the lineup.
    </>
  ),
};

export function Notices({ kinds }: { kinds: NoticeKind[] }) {
  if (!kinds.length) return null;
  return (
    <div className={styles.list}>
      {kinds.map((k) => (
        <p key={k} className={styles.notice} role="note">
          <span className={styles.icon} aria-hidden="true">
            i
          </span>
          <span>{TEXT[k]}</span>
        </p>
      ))}
    </div>
  );
}
