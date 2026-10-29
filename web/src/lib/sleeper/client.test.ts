import { afterEach, describe, expect, it, vi } from "vitest";
import { findUser, SLEEPER_API, UserError } from "./client";

/** Answers each Sleeper request with the next body in the list. */
function sleeper(...bodies: unknown[]) {
  const fetch = vi.fn(async () => Response.json(bodies.shift() ?? null));
  vi.stubGlobal("fetch", fetch);
  return fetch;
}

const urls = (fetch: ReturnType<typeof sleeper>) =>
  fetch.mock.calls.map((call: unknown[]) => String(call[0]).replace(SLEEPER_API, ""));

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("findUser", () => {
  it.each(["@Coach_01", "Coach_01", "coach_01", " coach_01 "])(
    "looks up %j as the lowercase username",
    async (typed) => {
      const fetch = sleeper({ user_id: "42", display_name: "Coach_01" });
      await expect(findUser(typed)).resolves.toEqual({ user_id: "42", display_name: "Coach_01" });
      expect(urls(fetch)).toEqual(["/user/coach_01"]);
    },
  );

  it("asks again past Sleeper's cache before saying the user does not exist", async () => {
    const fetch = sleeper(null, { user_id: "42", display_name: "Coach_01" });
    await expect(findUser("coach_01")).resolves.toEqual({
      user_id: "42",
      display_name: "Coach_01",
    });
    expect(urls(fetch)).toHaveLength(2);
    expect(urls(fetch)[1]).toMatch(/^\/user\/coach_01\?fresh=\d+$/);
  });

  it("says the user does not exist when both answers are empty", async () => {
    sleeper(null, null);
    await expect(findUser("@nobody_here")).rejects.toThrow('No Sleeper user named "nobody_here"');
  });

  it("refuses what cannot be a username without calling Sleeper", async () => {
    const fetch = sleeper();
    await expect(findUser("big coach")).rejects.toBeInstanceOf(UserError);
    expect(fetch).not.toHaveBeenCalled();
  });
});
