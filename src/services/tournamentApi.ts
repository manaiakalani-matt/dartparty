import { completeTournamentMatch, type Tournament, type TournamentMatchResult } from "../domain/tournament";
import { clonePlainData } from "../utils/compat";
import type { MatchState } from "../domain/x01";

export const DART_PARTY_API_URL = "https://script.google.com/macros/s/AKfycbzRrf8wicmEjvywMfRYsxyWAbBC2NkusEF2h-i6Y0Ozm2REn78CEJou0V9L1co88bpOtw/exec";

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

export interface SingleMatchSummary {
  id: string;
  playedAt: string;
  players: readonly [string, string];
  winner: 0 | 1;
  legsWon: readonly [number, number];
  startingScore: number;
  checkIn: "straight" | "double";
  bestOf: number;
}

export interface SavedSingleMatch extends SingleMatchSummary {
  detail: MatchState;
}

export type TrashItemKind = "tournament" | "single";
export interface TrashedTournament extends TournamentSummary { deletedAt: string }
export interface TrashedSingleMatch extends SingleMatchSummary { deletedAt: string }
export interface TrashData { tournaments: TrashedTournament[]; matches: TrashedSingleMatch[] }

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

  async listSingleMatches(): Promise<SingleMatchSummary[]> {
    const response = await fetch(`${this.endpoint}?action=listSingleMatches`);
    const payload = await parseResponse<{ ok: true; matches: SingleMatchSummary[] }>(response);
    return payload.matches;
  }

  async getSingleMatch(id: string): Promise<SavedSingleMatch> {
    const url = new URL(this.endpoint);
    url.searchParams.set("action", "getSingleMatch");
    url.searchParams.set("id", id);
    const response = await fetch(url);
    const payload = await parseResponse<{ ok: true; match: SavedSingleMatch }>(response);
    return payload.match;
  }

  async saveSingleMatch(input: { id: string; playedAt: string; detail: MatchState }): Promise<SavedSingleMatch> {
    const payload = await this.post<{ ok: true; match: SavedSingleMatch }>({ action: "saveSingleMatch", ...input });
    return payload.match;
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

  async listTrash(pin: string): Promise<TrashData> {
    const payload = await this.post<{ ok: true; trash: TrashData }>({ action: "listTrash", pin });
    return payload.trash;
  }

  async changeTrash(action: "trashItem" | "restoreItem" | "purgeItem", pin: string, kind: TrashItemKind, id: string): Promise<TrashData> {
    const payload = await this.post<{ ok: true; trash: TrashData }>({ action, pin, kind, id });
    return payload.trash;
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
  let tournament = clonePlainData(snapshot.tournament);
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
