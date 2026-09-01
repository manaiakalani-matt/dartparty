import { describe, expect, it } from "vitest";
import {
  createMatch,
  currentLeg,
  editCurrentLegVisit,
  getPlayerMatchStats,
  legsNeededToWin,
  MatchRuleError,
  previewVisit,
  submitVisit,
} from "./x01";

const standardMatch = () => createMatch(["Smith", "Jones"], {
  startingScore: 501,
  bestOf: 3,
  checkIn: "straight",
  startingPlayer: 0,
});

describe("X01 match engine", () => {
  it("creates a straight-in match and alternates turns", () => {
    const match = standardMatch();
    const afterSmith = submitVisit(match, { score: 60 });

    expect(afterSmith.remaining).toEqual([441, 501]);
    expect(afterSmith.currentPlayer).toBe(1);
    expect(currentLeg(afterSmith).visits[0]).toMatchObject({
      player: 0,
      enteredScore: 60,
      countedScore: 60,
      remainingAfter: 441,
    });
  });

  it("treats overshoots, leaving one, and unconfirmed zero as busts", () => {
    const match = createMatch(["Smith", "Jones"], {
      startingScore: 40,
      bestOf: 1,
      checkIn: "straight",
      startingPlayer: 0,
    });

    const leavesOne = submitVisit(match, { score: 39 });
    expect(leavesOne.remaining[0]).toBe(40);
    expect(currentLeg(leavesOne).visits[0].bust).toBe(true);

    const jonesMisses = submitVisit(leavesOne, { score: 0 });
    const unconfirmedZero = submitVisit(jonesMisses, { score: 40 });
    expect(unconfirmedZero.remaining[0]).toBe(40);
    expect(currentLeg(unconfirmedZero).visits[2]).toMatchObject({
      bust: true,
      countedScore: 0,
    });
  });

  it("confirms a checkout with the actual darts used", () => {
    const match = createMatch(["Smith", "Jones"], {
      startingScore: 40,
      bestOf: 1,
      checkIn: "straight",
      startingPlayer: 0,
    });
    const completed = submitVisit(match, { score: 40, checkoutDarts: 1 });

    expect(completed.completed).toBe(true);
    expect(completed.winner).toBe(0);
    expect(completed.legsWon).toEqual([1, 0]);
    expect(completed.legs[0].visits[0]).toMatchObject({
      checkout: true,
      dartsUsed: 1,
      remainingAfter: 0,
    });
  });

  it("alternates the starting player after each leg", () => {
    let match = createMatch(["Smith", "Jones"], {
      startingScore: 40,
      bestOf: 3,
      checkIn: "straight",
      startingPlayer: 0,
    });

    match = submitVisit(match, { score: 40, checkoutDarts: 1 });
    expect(match.currentPlayer).toBe(1);
    expect(currentLeg(match).starter).toBe(1);

    match = submitVisit(match, { score: 0 });
    match = submitVisit(match, { score: 40, checkoutDarts: 2 });

    expect(match.completed).toBe(true);
    expect(match.winner).toBe(0);
    expect(match.legsWon).toEqual([2, 0]);
  });

  it("uses the bull winner for odd legs and the other player for even legs", () => {
    let match = createMatch(["Smith", "Jones"], {
      startingScore: 40,
      bestOf: 5,
      checkIn: "straight",
      startingPlayer: 1,
    });

    expect(currentLeg(match).starter).toBe(1);
    match = submitVisit(match, { score: 40, checkoutDarts: 1 });
    expect(currentLeg(match).starter).toBe(0);
    match = submitVisit(match, { score: 40, checkoutDarts: 1 });
    expect(currentLeg(match).starter).toBe(1);
  });

  it("keeps an open-ended session running after completed legs", () => {
    let match = createMatch(["Smith", "Jones"], {
      startingScore: 40,
      bestOf: 1,
      checkIn: "straight",
      startingPlayer: 0,
      openEnded: true,
    });

    match = submitVisit(match, { score: 40, checkoutDarts: 1 });
    expect(match).toMatchObject({ completed: false, winner: null, legsWon: [1, 0] });
    expect(currentLeg(match)).toMatchObject({ number: 2, starter: 1, winner: null });

    match = submitVisit(match, { score: 40, checkoutDarts: 1 });
    expect(match).toMatchObject({ completed: false, winner: null, legsWon: [1, 1] });
    expect(currentLeg(match)).toMatchObject({ number: 3, starter: 0, winner: null });
  });

  it("requires and records a double-in before scoring", () => {
    let match = createMatch(["Smith", "Jones"], {
      startingScore: 301,
      bestOf: 1,
      checkIn: "double",
      startingPlayer: 0,
    });

    expect(previewVisit(match, 60).kind).toBe("double-in-required");
    match = submitVisit(match, { score: 60 });
    expect(match.remaining[0]).toBe(301);
    expect(match.opened[0]).toBe(false);

    match = submitVisit(match, { score: 0 });
    match = submitVisit(match, { score: 40, doubleInHit: true });
    expect(match.remaining[0]).toBe(261);
    expect(match.opened[0]).toBe(true);
  });

  it("edits a current-leg visit inline and recalculates later scores", () => {
    let match = standardMatch();
    match = submitVisit(match, { score: 60 });
    match = submitVisit(match, { score: 45 });
    match = submitVisit(match, { score: 60 });
    const firstVisitId = currentLeg(match).visits[0].id;

    const edited = editCurrentLegVisit(match, firstVisitId, 70);

    expect(edited.remaining).toEqual([371, 456]);
    expect(currentLeg(edited).visits.map((visit) => visit.enteredScore)).toEqual([70, 45, 60]);
    expect(currentLeg(edited).visits[0].id).toBe(firstVisitId);
  });

  it("calculates a three-dart average using checkout darts", () => {
    let match = createMatch(["Smith", "Jones"], {
      startingScore: 100,
      bestOf: 1,
      checkIn: "straight",
      startingPlayer: 0,
    });

    match = submitVisit(match, { score: 60 });
    match = submitVisit(match, { score: 0 });
    match = submitVisit(match, { score: 40, checkoutDarts: 2 });
    const stats = getPlayerMatchStats(match, 0);

    expect(stats).toMatchObject({ points: 100, darts: 5, highestVisit: 60 });
    expect(stats.threeDartAverage).toBe(60);
  });

  it("validates match and visit inputs", () => {
    expect(legsNeededToWin(5)).toBe(3);
    expect(() => createMatch(["Smith", "Smith"], {
      startingScore: 501,
      bestOf: 3,
      checkIn: "straight",
      startingPlayer: 0,
    })).toThrow(MatchRuleError);
    expect(() => submitVisit(standardMatch(), { score: 181 })).toThrow(MatchRuleError);
  });

  it("rejects impossible three-dart visit totals", () => {
    for (const score of [163, 166, 169, 172, 173, 175, 176, 178, 179]) {
      expect(() => previewVisit(standardMatch(), score)).toThrow(`${score} is not possible with three darts.`);
    }

    expect(previewVisit(standardMatch(), 162).kind).toBe("score");
    expect(previewVisit(standardMatch(), 177).kind).toBe("score");
    expect(previewVisit(standardMatch(), 180).kind).toBe("score");
  });
});
