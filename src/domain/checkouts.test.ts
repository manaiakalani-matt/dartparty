import { describe, expect, it } from "vitest";
import { checkoutRoute } from "./checkouts";

const segmentValue = (segment: string) => {
  if (segment === "Bull") return 50;
  if (segment === "25") return 25;
  if (segment.startsWith("T")) return Number(segment.slice(1)) * 3;
  if (segment.startsWith("D")) return Number(segment.slice(1)) * 2;
  return Number(segment);
};

describe("checkoutRoute", () => {
  it.each([2, 32, 40, 50, 81, 100, 121, 170])("finds a valid route for %i", (score) => {
    const route = checkoutRoute(score);
    expect(route).not.toBeNull();
    expect(route!.reduce((total, segment) => total + segmentValue(segment), 0)).toBe(score);
    expect(route!.at(-1)).toMatch(/^(D\d+|Bull)$/);
    expect(route!.length).toBeLessThanOrEqual(3);
  });

  it.each([1, 159, 162, 163, 165, 166, 168, 169, 171])("returns no route for %i", (score) => {
    expect(checkoutRoute(score)).toBeNull();
  });
});
