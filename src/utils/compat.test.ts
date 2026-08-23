import { describe, expect, it } from "vitest";
import { clonePlainData, formatDateForDisplay, formatDateTimeForDisplay, recordFromPairs } from "./compat";

describe("iOS 12 compatibility helpers", () => {
  it("clones saved plain data without retaining references", () => {
    const original = { players: ["Smith", "Jones"], result: { legs: 3 } };
    const copy = clonePlainData(original);
    copy.result.legs = 1;
    expect(original.result.legs).toBe(3);
  });

  it("creates records without Object.fromEntries", () => {
    expect(recordFromPairs([["match-1", 2], ["match-2", 4]])).toEqual({ "match-1": 2, "match-2": 4 });
  });

  it("formats dates without modern Intl options", () => {
    const date = new Date(2026, 7, 23, 19, 5);
    expect(formatDateForDisplay(date)).toBe("23 Aug 2026");
    expect(formatDateTimeForDisplay(date)).toBe("23 Aug 2026, 7:05 pm");
  });
});
