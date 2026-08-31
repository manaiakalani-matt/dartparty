import { describe, expect, it } from "vitest";
import { cueForVisit } from "./scoreAudio";

describe("score audio cues", () => {
  it("announces an ordinary accepted visit", () => {
    expect(cueForVisit(85, false, false).text).toBe("85 scored");
  });

  it("uses the special elongated 180 call", () => {
    expect(cueForVisit(180, false, false).text).toBe("Oooone huuundred and eeeighty!");
  });

  it("uses the checkout call instead of the entered score", () => {
    expect(cueForVisit(41, false, true).text).toBe("Bwaaaaaaaah!");
  });

  it("gives bust priority over every other call", () => {
    expect(cueForVisit(180, true, true).text).toBe("Bust");
  });
});
