/** Lower case without accents or punctuation, for matching typed names. */
export function searchKey(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Items whose name has every typed word at the start of one of its words
 * ("ja ch" finds "Ja'Marr Chase"), in the order given, at most `limit`.
 * Nothing typed finds nothing.
 */
export function searchByName<T>(
  items: readonly T[],
  query: string,
  name: (item: T) => string,
  limit = 8,
): T[] {
  const typed = searchKey(query).split(" ").filter(Boolean);
  if (!typed.length) return [];
  const out: T[] = [];
  for (const item of items) {
    const words = searchKey(name(item)).split(" ");
    if (typed.every((t) => words.some((w) => w.startsWith(t)))) out.push(item);
    if (out.length >= limit) break;
  }
  return out;
}
