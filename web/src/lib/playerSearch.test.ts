import { describe, expect, it } from "vitest";
import { searchByName, searchKey } from "./playerSearch";

describe("player search", () => {
  const names = ["Ja'Marr Chase", "Chase Brown", "Joaquín Ortiz", "Amon-Ra St. Brown"];
  const find = (q: string, limit?: number) => searchByName(names, q, (n) => n, limit);

  it("ignores case, accents and punctuation", () => {
    expect(searchKey("  Joaquín  O'Neil ")).toBe("joaquin oneil");
    expect(find("joaquin")).toEqual(["Joaquín Ortiz"]);
    expect(find("JAMARR")).toEqual(["Ja'Marr Chase"]);
  });

  it("matches every typed word at the start of a name's word, in the given order", () => {
    expect(find("chase")).toEqual(["Ja'Marr Chase", "Chase Brown"]);
    expect(find("br ch")).toEqual(["Chase Brown"]);
    expect(find("hase")).toEqual([]);
  });

  it("finds nothing until something is typed, and at most the limit", () => {
    expect(find("  ")).toEqual([]);
    expect(find("b", 1)).toEqual(["Chase Brown"]);
  });
});
