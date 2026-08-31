import { afterEach, describe, expect, it, vi } from "vitest";
import { completeTournamentMatch, createTournament, type TournamentMatchResult } from "../domain/tournament";
import { hydrateTournament, TournamentApi, type SavedMatch, type TournamentSnapshot } from "./tournamentApi";

const config = {
  id: "api_test",
  name: "API Test",
  date: "21 Aug 2026",
  startingScore: 501,
  checkIn: "straight" as const,
  structure: "knockout" as const,
  qualifiersPerGroup: 2,
  formats: { group: 3, early: 3, semifinal: 3, final: 3 },
};

const resultFor = (playerOneId: string, playerTwoId: string): TournamentMatchResult => ({
  winnerId: playerOneId,
  playerOneLegs: 2,
  playerTwoLegs: 0,
  source: "manual",
  playerStats: undefined,
});

const saved = (matchId: string, result: TournamentMatchResult, version = 1): SavedMatch => ({
  matchId,
  status: "completed",
  version,
  updatedAt: "2026-08-21T00:00:00.000Z",
  result,
  detail: null,
});

describe("tournament API hydration", () => {
  it("replays independent rows in dependency order", () => {
    const initial = createTournament({ config, playerNames: ["One", "Two", "Three", "Four"] });
    const semifinals = initial.matches.filter((match) => match.stageLabel === "Semifinal");
    const firstResult = resultFor(semifinals[0].playerOneId!, semifinals[0].playerTwoId!);
    const secondResult = resultFor(semifinals[1].playerOneId!, semifinals[1].playerTwoId!);
    let progressed = completeTournamentMatch(initial, semifinals[0].id, firstResult);
    progressed = completeTournamentMatch(progressed, semifinals[1].id, secondResult);
    const final = progressed.matches.find((match) => match.stageLabel === "Final")!;
    const finalResult = resultFor(final.playerOneId!, final.playerTwoId!);

    const snapshot: TournamentSnapshot = {
      tournament: { ...initial, status: "completed", championId: final.playerOneId },
      // Deliberately reverse the server rows to prove ordering is reconstructed.
      savedMatches: [saved(final.id, finalResult), saved(semifinals[1].id, secondResult), saved(semifinals[0].id, firstResult)],
    };
    const hydrated = hydrateTournament(snapshot);

    expect(hydrated.status).toBe("completed");
    expect(hydrated.championId).toBe(final.playerOneId);
    expect(hydrated.matches.filter((match) => match.status === "completed")).toHaveLength(3);
  });
});

describe("Just Play session API", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("lists the separate Just Play history", async () => {
    const matches = [{ id: "session_1", startedAt: "2026-08-23T06:00:00.000Z", updatedAt: "2026-08-23T06:10:00.000Z", endedAt: null, players: ["Smith", "Jones"], legsWon: [2, 1], completedLegs: 3, startingScore: 501, checkIn: "straight" }];
    const fetchMock = vi.fn().mockResolvedValue({ json: async () => ({ ok: true, matches }) });
    vi.stubGlobal("fetch", fetchMock);
    const api = new TournamentApi("https://example.com/api");

    await expect(api.listPlaySessions()).resolves.toEqual(matches);
    expect(fetchMock).toHaveBeenCalledWith("https://example.com/api?action=listPlaySessions");
  });

  it("posts an open session snapshot as text/plain", async () => {
    const detail = { completed: false, winner: null } as never;
    const saved = { id: "session_2", detail };
    const fetchMock = vi.fn().mockResolvedValue({ json: async () => ({ ok: true, match: saved }) });
    vi.stubGlobal("fetch", fetchMock);
    const api = new TournamentApi("https://example.com/api");

    await expect(api.savePlaySession({ id: "session_2", startedAt: "2026-08-23T06:00:00.000Z", ended: false, detail })).resolves.toEqual(saved);
    expect(fetchMock).toHaveBeenCalledWith("https://example.com/api", expect.objectContaining({ method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8" }, body: JSON.stringify({ action: "savePlaySession", id: "session_2", startedAt: "2026-08-23T06:00:00.000Z", ended: false, detail }) }));
  });
});

describe("trash API", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("checks the organiser PIN while listing Trash", async () => {
    const trash = { tournaments: [], matches: [] };
    const fetchMock = vi.fn().mockResolvedValue({ json: async () => ({ ok: true, trash }) });
    vi.stubGlobal("fetch", fetchMock);
    const api = new TournamentApi("https://example.com/api");

    await expect(api.listTrash("1234")).resolves.toEqual(trash);
    expect(fetchMock).toHaveBeenCalledWith("https://example.com/api", expect.objectContaining({ body: JSON.stringify({ action: "listTrash", pin: "1234" }) }));
  });

  it("sends PIN-protected Trash changes", async () => {
    const trash = { tournaments: [], matches: [] };
    const fetchMock = vi.fn().mockResolvedValue({ json: async () => ({ ok: true, trash }) });
    vi.stubGlobal("fetch", fetchMock);
    const api = new TournamentApi("https://example.com/api");

    await expect(api.changeTrash("restoreItem", "1234", "tournament", "tournament_1")).resolves.toEqual(trash);
    expect(fetchMock).toHaveBeenCalledWith("https://example.com/api", expect.objectContaining({ body: JSON.stringify({ action: "restoreItem", pin: "1234", kind: "tournament", id: "tournament_1" }) }));
  });
});
