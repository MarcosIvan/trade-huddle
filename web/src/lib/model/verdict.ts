import type { ModelParams } from "../sports/types";

export type VerdictClass = "fair" | "lean" | "skew";

export interface Verdict {
  cls: VerdictClass;
  text: string;
}

/** How balanced a trade is, comparing value above replacement on each side. */
export function verdict(
  { vGive, vGet }: { vGive: number; vGet: number },
  params: Pick<ModelParams, "balancedDiff" | "slightDiff">,
): Verdict {
  if (vGive + vGet <= 0) return { cls: "fair", text: "Balanced" };
  const diff = (vGet - vGive) / Math.max(vGive, vGet);
  const size = Math.abs(diff);
  const who = diff > 0 ? "you" : "them";
  if (size <= params.balancedDiff) return { cls: "fair", text: "Balanced" };
  if (size <= params.slightDiff) return { cls: "lean", text: `Slightly favors ${who}` };
  return { cls: "skew", text: `Clearly favors ${who}` };
}
