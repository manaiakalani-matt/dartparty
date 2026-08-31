import { completeTournamentMatch, type Tournament, type TournamentMatchResult } from "../domain/tournament";
import { clonePlainData } from "../utils/compat";
import type { MatchState } from "../domain/x01";

export const DART_PARTY_API_URL = import.meta.env.VITE_DART_PARTY_API_URL
  ?? "https://darty-party-api.mattsdarts.workers.dev";

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

export interface PlaySessionSummary {
  id: string;
  startedAt: string;
  updatedAt: string;
  endedAt: string | null;
  players: readonly [string, string];
  legsWon: readonly [number, number];
  completedLegs: number;
  startingScore: number;
  checkIn: "straight" | "double";
}

export interface SavedPlaySession extends PlaySessionSummary {
  detail: MatchState;
}

export type TrashItemKind = "tournament" | "single";
export interface TrashedTournament extends TournamentSummary { deletedAt: string }
export interface TrashedPlaySession extends PlaySessionSummary { deletedAt: string }
export interface TrashData { tournaments: TrashedTournament[]; matches: TrashedPlaySession[] }

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

  async listPlaySessions(): Promise<PlaySessionSummary[]> {
    const response = await fetch(`${this.endpoint}?action=listPlaySessions`);
    const payload = await parseResponse<{ ok: true; matches: PlaySessionSummary[] }>(response);
    return payload.matches;
  }

  async getPlaySession(id: string): Promise<SavedPlaySession> {
    const url = new URL(this.endpoint);
    url.searchParams.set("action", "getPlaySession");
    url.searchParams.set("id", id);
    const response = await fetch(url);
    const payload = await parseResponse<{ ok: true; match: SavedPlaySession }>(response);
    return payload.match;
  }

  async savePlaySession(input: { id: string; startedAt: string; ended: boolean; detail: MatchState }): Promise<SavedPlaySession> {
    const payload = await this.post<{ ok: true; match: SavedPlaySession }>({ action: "savePlaySession", ...input });
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
