import { describe, expect, it } from "vitest";
import { cueForVisit, scoreAudioUrl } from "./scoreAudio";

describe("score audio cues", () => {
  it("announces an ordinary accepted visit", () => {
    expect(cueForVisit(85, false, false).text).toBe("85 scored");
    expect(cueForVisit(85, false, false).filename).toBe("score-85.mp3");
  });

  it("gives 180 its traditional call", () => {
    expect(cueForVisit(180, false, false).text).toBe("One hundred and eighty");
  });

  it("uses the checkout call instead of the entered score", () => {
    expect(cueForVisit(41, false, true).text).toBe("Got him!");
  });

  it("gives bust priority over every other call", () => {
    expect(cueForVisit(180, true, true).text).toBe("Bust");
    expect(cueForVisit(180, true, true).filename).toBe("bust.mp3");
  });

  it("versions caller files so corrected recordings bypass browser caches", () => {
    expect(scoreAudioUrl(cueForVisit(180, false, false))).toContain("score-180.mp3?v=");
  });
});
