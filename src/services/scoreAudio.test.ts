import { describe, expect, it } from "vitest";
import { cueForVisit } from "./scoreAudio";

describe("score audio cues", () => {
  it("announces an ordinary accepted visit", () => {
    expect(cueForVisit(85, false, false).text).toBe("85 scored");
    expect(cueForVisit(85, false, false).filename).toBe("score-85.mp3");
  });

  it("announces 180 like any other accepted visit", () => {
    expect(cueForVisit(180, false, false).text).toBe("180 scored");
  });

  it("uses the checkout call instead of the entered score", () => {
    expect(cueForVisit(41, false, true).text).toBe("Baaaaaaaah!");
  });

  it("gives bust priority over every other call", () => {
    expect(cueForVisit(180, true, true).text).toBe("Bust");
    expect(cueForVisit(180, true, true).filename).toBe("bust.mp3");
  });
});
