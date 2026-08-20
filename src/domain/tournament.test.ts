import { describe, expect, it } from "vitest";
import {
  completeTournamentMatch,
  createTournament,
  standingsForGroup,
  type Tournament,
  type TournamentConfig,
} from "./tournament";

const formats = { group: 3, early: 3, semifinal: 5, final: 7 };

const config = (structure: TournamentConfig["structure"], qualifiersPerGroup = 2): TournamentConfig => ({
  id: "tournament_test",
  name: "Friday Night Open",
  date: "2026-08-21",
  startingScore: 501,
  checkIn: "straight",
  structure,
  qualifiersPerGroup,
  formats,
});

const names = (count: number) => Array.from({ length: count }, (_, index) => `Player ${index + 1}`);

const scoredResult = (tournament: Tournament, matchId: string, winner: "one" | "two" = "one") => {
  const match = tournament.matches.find((item) => item.id === matchId)!;
  const winnerId = winner === "one" ? match.playerOneId! : match.playerTwoId!;
  const target = Math.floor(match.bestOf / 2) + 1;
  return {
    winnerId,
    playerOneLegs: winner === "one" ? target : 0,
    playerTwoLegs: winner === "two" ? target : 0,
    source: "scored" as const,
    playerStats: {
      [match.playerOneId!]: { points: 501, darts: 24 },
      [match.playerTwoId!]: { points: 420, darts: 24 },
    },
  };
};

describe("tournament generation", () => {
  it("generates all 21 matches for a seven-player round robin", () => {
    const tournament = createTournament({ config: config("single-group", 4), playerNames: names(7) });
    const groupMatches = tournament.matches.filter((match) => match.stage === "group");
    const appearances = new Map<string, number>();
    groupMatches.forEach((match) => {
      appearances.set(match.playerOneId!, (appearances.get(match.playerOneId!) ?? 0) + 1);
      appearances.set(match.playerTwoId!, (appearances.get(match.playerTwoId!) ?? 0) + 1);
    });

    expect(groupMatches).toHaveLength(21);
    expect(new Set(groupMatches.map((match) => match.round)).size).toBe(7);
    expect([...appearances.values()]).toEqual(Array(7).fill(6));
    expect(groupMatches.every((match) => match.status === "unplayed")).toBe(true);
  });

  it("creates two balanced groups and crossed semifinals", () => {
    const tournament = createTournament({ config: config("two-groups", 2), playerNames: names(8) });
    const groupA = tournament.players.filter((player) => player.groupId === "A");
    const groupB = tournament.players.filter((player) => player.groupId === "B");
    const groupMatches = tournament.matches.filter((match) => match.stage === "group");
    const semifinals = tournament.matches.filter((match) => match.stageLabel === "Semifinal");

    expect(groupA).toHaveLength(4);
    expect(groupB).toHaveLength(4);
    expect(groupMatches).toHaveLength(12);
    expect(semifinals).toHaveLength(2);
    expect(semifinals.every((match) => match.status === "waiting")).toBe(true);
    expect(tournament.matches.find((match) => match.stageLabel === "Final")?.bestOf).toBe(7);
  });

  it("creates automatic byes for a seven-player straight knockout", () => {
    const tournament = createTournament({ config: config("knockout"), playerNames: names(7) });
    const firstRound = tournament.matches.filter((match) => match.round === 1);
    const semifinals = tournament.matches.filter((match) => match.stageLabel === "Semifinal");

    expect(firstRound).toHaveLength(4);
    expect(firstRound.filter((match) => match.status === "bye")).toHaveLength(1);
    expect(firstRound.filter((match) => match.status === "unplayed")).toHaveLength(3);
    expect(semifinals).toHaveLength(2);
  });

  it("advances knockout winners and completes the final", () => {
    let tournament = createTournament({ config: config("knockout"), playerNames: names(4) });
    const semifinals = tournament.matches.filter((match) => match.stageLabel === "Semifinal");
    for (const semifinal of semifinals) {
      tournament = completeTournamentMatch(tournament, semifinal.id, scoredResult(tournament, semifinal.id));
    }
    const final = tournament.matches.find((match) => match.stageLabel === "Final")!;
    expect(final.status).toBe("unplayed");
    expect(final.playerOneId).toBeTruthy();
    expect(final.playerTwoId).toBeTruthy();

    tournament = completeTournamentMatch(tournament, final.id, scoredResult(tournament, final.id));
    expect(tournament.status).toBe("completed");
    expect(tournament.championId).toBe(final.playerOneId);
  });

  it("resolves group qualifiers only after every group match is complete", () => {
    let tournament = createTournament({ config: config("two-groups", 2), playerNames: names(8) });
    const groupMatchIds = tournament.matches.filter((match) => match.stage === "group").map((match) => match.id);

    for (const matchId of groupMatchIds) {
      tournament = completeTournamentMatch(tournament, matchId, scoredResult(tournament, matchId));
    }

    const semifinals = tournament.matches.filter((match) => match.stageLabel === "Semifinal");
    expect(semifinals.every((match) => match.status === "unplayed")).toBe(true);
    expect(semifinals.flatMap((match) => [match.playerOneId, match.playerTwoId]).every(Boolean)).toBe(true);
    expect(standingsForGroup(tournament, "A")[0].wins).toBeGreaterThan(0);
  });

  it("rejects invalid setup and impossible match results", () => {
    expect(() => createTournament({ config: config("single-group", 4), playerNames: names(3) })).toThrow(/Qualifiers/);
    expect(() => createTournament({ config: config("single-group", 1), playerNames: names(4) })).toThrow(/Qualifiers/);
    const tournament = createTournament({ config: config("knockout"), playerNames: names(4) });
    const semifinal = tournament.matches.find((match) => match.status === "unplayed")!;
    expect(() => completeTournamentMatch(tournament, semifinal.id, {
      winnerId: semifinal.playerOneId!,
      playerOneLegs: 1,
      playerTwoLegs: 0,
      source: "manual",
    })).toThrow(/winner reaching/);
  });
});
