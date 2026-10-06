import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { cueForVisit, scoreAudioUrl } from "./scoreAudio";

describe("score audio cues", () => {
  it("calls zero no score", () => {
    expect(cueForVisit(0, false, false)).toEqual({ text: "No score", filename: "no-score.mp3" });
  });

  it.each([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11])("puts a score of %i in the book", (score) => {
    expect(cueForVisit(score, false, false)).toEqual({ text: "In the book for you", filename: "in-the-book.mp3" });
  });

  it("encourages a 140 visit", () => {
    expect(cueForVisit(140, false, false)).toEqual({ text: "Have a go lad", filename: "have-a-go-lad.mp3" });
  });

  it("ships a recorded clip for each custom call", () => {
    for (const score of [0, 1, 140]) {
      const { filename } = cueForVisit(score, false, false);
      const clip = readFileSync(new URL(`../../public/audio/caller/${filename}`, import.meta.url));
      expect(clip.byteLength).toBeGreaterThan(1000);
    }
  });

  it("keeps adjacent scores on their normal calls", () => {
    for (const score of [12, 139, 141]) {
      expect(cueForVisit(score, false, false).filename).toBe(`score-${score}.mp3`);
    }
  });

  it.each([0, 1, 11, 140])("keeps bust and checkout priority for %i", (score) => {
    expect(cueForVisit(score, true, false).filename).toBe("bust.mp3");
    expect(cueForVisit(score, false, true).filename).toBe("checkout.mp3");
  });
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
