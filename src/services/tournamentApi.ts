import { completeTournamentMatch, type Tournament, type TournamentMatchResult } from "../domain/tournament";
import type { MatchState } from "../domain/x01";

export interface TournamentSummary {
  id: string;
  name: string;
  status: "active" | "completed";
  date: string;
  createdAt: string;
  updatedAt: string;
}

export interface SavedMatch {
  matchId: string;
  status: "completed";
  version: number;
  updatedAt: string;
  result: TournamentMatchResult & { playerOneId?: string; playerTwoId?: string };
  detail: MatchState | null;
}

export interface TournamentSnapshot {
  tournament: Tournament;
  savedMatches: SavedMatch[];
}

export interface MatchConflict {
  ok: false;
  code: "MATCH_CONFLICT" | "STALE_REPLACEMENT" | "RESULT_LOCKED";
  message: string;
  saved?: Pick<SavedMatch, "result" | "detail" | "version">;
}

export interface MatchSaved {
  ok: true;
  saved: Pick<SavedMatch, "result" | "detail" | "version">;
}

interface ApiErrorPayload { ok: false; code: string; message: string }

const parseResponse = async <T>(response: Response): Promise<T> => {
  const payload = await response.json() as T | ApiErrorPayload;
  if ((payload as ApiErrorPayload).ok === false && !["MATCH_CONFLICT", "STALE_REPLACEMENT", "RESULT_LOCKED"].includes((payload as ApiErrorPayload).code)) {
    throw new Error((payload as ApiErrorPayload).message);
  }
  return payload as T;
};

export class TournamentApi {
  constructor(private readonly endpoint: string) {
    if (!endpoint.startsWith("https://")) throw new Error("Apps Script endpoint must use HTTPS.");
  }

  async listTournaments(): Promise<TournamentSummary[]> {
    const response = await fetch(`${this.endpoint}?action=listTournaments`);
    const payload = await parseResponse<{ ok: true; tournaments: TournamentSummary[] }>(response);
    return payload.tournaments;
  }

  async getTournament(tournamentId: string): Promise<TournamentSnapshot> {
    const url = new URL(this.endpoint);
    url.searchParams.set("action", "getTournament");
    url.searchParams.set("tournamentId", tournamentId);
    const response = await fetch(url);
    const payload = await parseResponse<{ ok: true; tournament: TournamentSnapshot }>(response);
    return payload.tournament;
  }

  async createTournament(tournament: Tournament): Promise<TournamentSnapshot> {
    const payload = await this.post<{ ok: true; tournament: TournamentSnapshot }>({ action: "createTournament", tournament });
    return payload.tournament;
  }

  saveMatch(input: {
    tournamentId: string;
    matchId: string;
    playerIds: readonly [string, string];
    result: TournamentMatchResult;
    detail: MatchState | null;
    replace?: boolean;
    expectedVersion?: number;
  }): Promise<MatchSaved | MatchConflict> {
    return this.post({ action: "saveMatch", ...input });
  }

  private async post<T>(body: unknown): Promise<T> {
    const response = await fetch(this.endpoint, {
      method: "POST",
      // text/plain keeps this a CORS-simple request; Apps Script still receives JSON text.
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify(body),
    });
    return parseResponse<T>(response);
  }
}

/** Replays independent saved rows through the shared tournament rules. */
export function hydrateTournament(snapshot: TournamentSnapshot): Tournament {
  let tournament = structuredClone(snapshot.tournament);
  tournament.matches = tournament.matches.map((match) => ({
    ...match,
    status: match.status === "bye" ? "bye" : match.stage === "group" || (match.playerOneId && match.playerTwoId) ? "unplayed" : "waiting",
    result: match.status === "bye" ? match.result : null,
  }));
  tournament.status = "active";
  tournament.championId = null;

  const pending = [...snapshot.savedMatches].sort((a, b) => {
    const first = tournament.matches.find((match) => match.id === a.matchId)!;
    const second = tournament.matches.find((match) => match.id === b.matchId)!;
    return Number(first.stage === "knockout") - Number(second.stage === "knockout") || first.round - second.round;
  });
  pending.forEach((saved) => { tournament = completeTournamentMatch(tournament, saved.matchId, saved.result); });
  return tournament;
}
