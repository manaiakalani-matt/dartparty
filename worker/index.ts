type JsonObject = Record<string, unknown>;

type ApiCode =
  | "ALREADY_EXISTS"
  | "INVALID_JSON"
  | "INVALID_PIN"
  | "INVALID_REQUEST"
  | "INVALID_RESULT"
  | "INVALID_TOURNAMENT"
  | "MATCH_CONFLICT"
  | "NOT_FOUND"
  | "NOT_TRASHED"
  | "PIN_NOT_CONFIGURED"
  | "RESULT_LOCKED"
  | "SERVER_ERROR"
  | "STALE_REPLACEMENT"
  | "UNKNOWN_ACTION";

type TournamentMatchDefinition = {
  id: string;
  stage: "group" | "knockout";
  stageLabel: string;
  bestOf: number;
  playerOneId: string | null;
  playerTwoId: string | null;
  sourceOne: MatchSource | null;
  sourceTwo: MatchSource | null;
};

type MatchSource = {
  kind: "match" | "group";
  matchId?: string;
};

type TournamentPlayer = { id: string; name: string };

type TournamentDefinition = {
  config: { id: string; name: string; date: string };
  players: TournamentPlayer[];
  matches: TournamentMatchDefinition[];
  status: "active" | "completed";
  championId: string | null;
};

type MatchResult = {
  winnerId: string;
  playerOneLegs: number;
  playerTwoLegs: number;
  source: string;
  playerOneId?: string;
  playerTwoId?: string;
  [key: string]: unknown;
};

type SavedMatchRow = {
  match_id: string;
  status: string;
  version: number;
  updated_at: string;
  result_json: string | null;
  detail_json: string | null;
};

type StoredMatchRow = SavedMatchRow & {
  stage: "group" | "knockout";
};

type TournamentRow = {
  id: string;
  name: string;
  status: "active" | "completed";
  date: string;
  created_at: string;
  updated_at: string;
  tournament_json: string;
  deleted_at: string | null;
};

type SingleMatchRow = {
  id: string;
  played_at: string;
  player_one: string;
  player_two: string;
  winner: number;
  starting_score: number;
  check_in: "straight" | "double";
  best_of: number;
  result_json: string;
  detail_json: string;
  deleted_at: string | null;
};

class ApiError extends Error {
  constructor(readonly code: ApiCode, message: string) {
    super(message);
    this.name = "ApiError";
  }
}

const corsHeaders = {
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Origin": "*",
  "Cache-Control": "no-store",
};

const isRecord = (value: unknown): value is JsonObject =>
  Boolean(value && typeof value === "object" && !Array.isArray(value));

const requiredString = (value: unknown, code: ApiCode, message: string): string => {
  if (typeof value !== "string" || !value.trim()) throw new ApiError(code, message);
  return value;
};

const optionalString = (value: unknown): string | null =>
  typeof value === "string" && value ? value : null;

const parseJson = <T>(value: string | null): T | null => {
  if (!value) return null;
  return JSON.parse(value) as T;
};

const json = (payload: unknown, status = 200): Response =>
  Response.json(payload, { status, headers: corsHeaders });

const errorResponse = (error: unknown, path: string): Response => {
  const apiError = error instanceof ApiError
    ? error
    : new ApiError("SERVER_ERROR", error instanceof Error ? error.message : "Unexpected server error.");
  console.error(JSON.stringify({ message: "Darty Party API request failed", code: apiError.code, error: apiError.message, path }));
  return json({ ok: false, code: apiError.code, message: apiError.message });
};

const parseBody = async (request: Request): Promise<JsonObject> => {
  const declaredLength = Number(request.headers.get("content-length") ?? 0);
  if (declaredLength > 2_000_000) throw new ApiError("INVALID_REQUEST", "Request body is too large.");
  const text = await request.text();
  if (!text || text.length > 2_000_000) throw new ApiError("INVALID_REQUEST", "JSON request body is required.");
  try {
    const value: unknown = JSON.parse(text);
    if (!isRecord(value)) throw new Error("not an object");
    return value;
  } catch {
    throw new ApiError("INVALID_JSON", "Request body must be valid JSON.");
  }
};

const isTournament = (value: unknown): value is TournamentDefinition => {
  if (!isRecord(value) || !isRecord(value.config)) return false;
  return typeof value.config.id === "string"
    && Boolean(value.config.id)
    && typeof value.config.name === "string"
    && Boolean(value.config.name)
    && typeof value.config.date === "string"
    && Array.isArray(value.players)
    && value.players.length >= 2
    && value.players.every((player) => isRecord(player) && typeof player.id === "string" && typeof player.name === "string")
    && Array.isArray(value.matches)
    && value.matches.length >= 1
    && value.matches.every((match) => isRecord(match)
      && typeof match.id === "string"
      && (match.stage === "group" || match.stage === "knockout")
      && typeof match.stageLabel === "string"
      && Number.isInteger(match.bestOf));
};

const isMatchResult = (value: unknown): value is MatchResult => isRecord(value)
  && typeof value.winnerId === "string"
  && Number.isInteger(value.playerOneLegs)
  && Number.isInteger(value.playerTwoLegs)
  && typeof value.source === "string";

const tournamentDependencies = (tournament: TournamentDefinition) => {
  const byId = new Map(tournament.matches.map((match) => [match.id, match]));
  const dependencies = new Set<string>();

  const ancestors = (match: TournamentMatchDefinition, seen = new Set<string>()): Set<string> => {
    for (const source of [match.sourceOne, match.sourceTwo]) {
      if (source?.kind !== "match" || !source.matchId || seen.has(source.matchId)) continue;
      seen.add(source.matchId);
      const parent = byId.get(source.matchId);
      if (parent) ancestors(parent, seen);
    }
    return seen;
  };

  for (const match of tournament.matches.filter((item) => item.stage === "knockout")) {
    for (const ancestorId of ancestors(match)) {
      dependencies.add(`${ancestorId}\u0000${match.id}`);
    }
  }

  return [...dependencies].map((item) => {
    const [ancestorMatchId, descendantMatchId] = item.split("\u0000");
    return { tournamentId: tournament.config.id, ancestorMatchId, descendantMatchId };
  });
};

const createTournament = async (db: D1Database, value: unknown) => {
  if (!isTournament(value)) throw new ApiError("INVALID_TOURNAMENT", "Tournament ID, name, players, and matches are required.");
  const tournament = value;
  const now = new Date().toISOString();
  const matches = tournament.matches.map((match) => ({
    tournamentId: tournament.config.id,
    matchId: match.id,
    stage: match.stage,
    isFinal: Number(match.stage === "knockout" && match.stageLabel === "Final"),
    status: "status" in match && typeof match.status === "string" ? match.status : "unplayed",
    updatedAt: now,
  }));
  const dependencies = tournamentDependencies(tournament);

  try {
    await db.batch([
      db.prepare(`
        INSERT INTO tournaments (
          id, name, status, date, created_at, updated_at, schema_version, tournament_json
        ) VALUES (?, ?, ?, ?, ?, ?, 1, ?)
      `).bind(
        tournament.config.id,
        tournament.config.name,
        tournament.status,
        tournament.config.date,
        now,
        now,
        JSON.stringify(tournament),
      ),
      db.prepare(`
        INSERT INTO matches (
          tournament_id, match_id, stage, is_final, status, version, updated_at
        )
        SELECT
          json_extract(value, '$.tournamentId'),
          json_extract(value, '$.matchId'),
          json_extract(value, '$.stage'),
          json_extract(value, '$.isFinal'),
          json_extract(value, '$.status'),
          0,
          json_extract(value, '$.updatedAt')
        FROM json_each(?)
      `).bind(JSON.stringify(matches)),
      db.prepare(`
        INSERT INTO match_dependencies (
          tournament_id, ancestor_match_id, descendant_match_id
        )
        SELECT
          json_extract(value, '$.tournamentId'),
          json_extract(value, '$.ancestorMatchId'),
          json_extract(value, '$.descendantMatchId')
        FROM json_each(?)
      `).bind(JSON.stringify(dependencies)),
    ]);
  } catch (error) {
    if (error instanceof Error && /UNIQUE constraint failed/.test(error.message)) {
      throw new ApiError("ALREADY_EXISTS", "A tournament with that ID already exists.");
    }
    throw error;
  }

  return getTournament(db, tournament.config.id);
};

const listTournaments = async (db: D1Database) => {
  const rows = await db.prepare(`
    SELECT id, name, status, date, created_at, updated_at
    FROM tournaments
    WHERE deleted_at IS NULL
    ORDER BY updated_at DESC
  `).all<Omit<TournamentRow, "tournament_json" | "deleted_at">>();
  return rows.results.map((row) => ({
    id: row.id,
    name: row.name,
    status: row.status,
    date: row.date,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }));
};

const getTournament = async (db: D1Database, tournamentId: string) => {
  const tournament = await db.prepare(`
    SELECT tournament_json
    FROM tournaments
    WHERE id = ? AND deleted_at IS NULL
  `).bind(tournamentId).first<{ tournament_json: string }>();
  if (!tournament) throw new ApiError("NOT_FOUND", "Tournament not found.");

  const matches = await db.prepare(`
    SELECT match_id, status, version, updated_at, result_json, detail_json
    FROM matches
    WHERE tournament_id = ? AND result_json IS NOT NULL
  `).bind(tournamentId).all<SavedMatchRow>();

  return {
    tournament: parseJson<TournamentDefinition>(tournament.tournament_json),
    savedMatches: matches.results.map((row) => ({
      matchId: row.match_id,
      status: "completed",
      version: row.version,
      updatedAt: row.updated_at,
      result: parseJson<MatchResult>(row.result_json),
      detail: parseJson<unknown>(row.detail_json),
    })),
  };
};

const validateResult = (
  tournament: TournamentDefinition,
  match: TournamentMatchDefinition,
  playerIds: unknown,
  result: unknown,
): { playerIds: [string, string]; result: MatchResult } => {
  if (!Array.isArray(playerIds)
    || playerIds.length !== 2
    || typeof playerIds[0] !== "string"
    || typeof playerIds[1] !== "string"
    || playerIds[0] === playerIds[1]) {
    throw new ApiError("INVALID_RESULT", "Two different match players are required.");
  }
  if (!isMatchResult(result)) throw new ApiError("INVALID_RESULT", "A valid match result is required.");

  const tournamentPlayerIds = new Set(tournament.players.map((player) => player.id));
  if (!tournamentPlayerIds.has(playerIds[0]) || !tournamentPlayerIds.has(playerIds[1])) {
    throw new ApiError("INVALID_RESULT", "Both players must belong to this tournament.");
  }
  if (match.playerOneId && match.playerOneId !== playerIds[0]) {
    throw new ApiError("INVALID_RESULT", "Player one does not match the draw.");
  }
  if (match.playerTwoId && match.playerTwoId !== playerIds[1]) {
    throw new ApiError("INVALID_RESULT", "Player two does not match the draw.");
  }
  if (!playerIds.includes(result.winnerId)) throw new ApiError("INVALID_RESULT", "Winner is not in this match.");

  const target = Math.floor(match.bestOf / 2) + 1;
  const winnerLegs = result.winnerId === playerIds[0] ? result.playerOneLegs : result.playerTwoLegs;
  const loserLegs = result.winnerId === playerIds[0] ? result.playerTwoLegs : result.playerOneLegs;
  if (winnerLegs !== target || loserLegs < 0 || loserLegs >= target) {
    throw new ApiError("INVALID_RESULT", "The leg score does not match this match format.");
  }

  return { playerIds: [playerIds[0], playerIds[1]], result };
};

const conflictMessage = (
  tournament: TournamentDefinition,
  match: TournamentMatchDefinition,
  result: MatchResult,
) => {
  const names = new Map(tournament.players.map((player) => [player.id, player.name]));
  const playerOneId = result.playerOneId ?? match.playerOneId;
  const playerTwoId = result.playerTwoId ?? match.playerTwoId;
  const loserId = result.winnerId === playerOneId ? playerTwoId : playerOneId;
  const winnerLegs = result.winnerId === playerOneId ? result.playerOneLegs : result.playerTwoLegs;
  const loserLegs = result.winnerId === playerOneId ? result.playerTwoLegs : result.playerOneLegs;
  return `${names.get(result.winnerId) ?? "The winner"} defeated ${names.get(loserId ?? "") ?? "their opponent"} ${winnerLegs}–${loserLegs}. Your local result has not been saved.`;
};

const savedMatchPayload = (row: SavedMatchRow) => ({
  result: parseJson<MatchResult>(row.result_json),
  detail: parseJson<unknown>(row.detail_json),
  version: row.version,
});

const saveMatch = async (db: D1Database, request: JsonObject) => {
  const tournamentId = requiredString(request.tournamentId, "INVALID_REQUEST", "Tournament, match, and result are required.");
  const matchId = requiredString(request.matchId, "INVALID_REQUEST", "Tournament, match, and result are required.");
  const tournamentRow = await db.prepare(`
    SELECT tournament_json
    FROM tournaments
    WHERE id = ? AND deleted_at IS NULL
  `).bind(tournamentId).first<{ tournament_json: string }>();
  if (!tournamentRow) throw new ApiError("NOT_FOUND", "Tournament not found.");

  const tournament = parseJson<TournamentDefinition>(tournamentRow.tournament_json);
  if (!tournament) throw new ApiError("SERVER_ERROR", "Tournament data is invalid.");
  const definition = tournament.matches.find((match) => match.id === matchId);
  if (!definition) throw new ApiError("NOT_FOUND", "Match not found.");
  const checked = validateResult(
    tournament,
    definition,
    request.playerIds ?? [definition.playerOneId, definition.playerTwoId],
    request.result,
  );
  checked.result.playerOneId = checked.playerIds[0];
  checked.result.playerTwoId = checked.playerIds[1];

  const before = await db.prepare(`
    SELECT match_id, stage, status, version, updated_at, result_json, detail_json
    FROM matches
    WHERE tournament_id = ? AND match_id = ?
  `).bind(tournamentId, matchId).first<StoredMatchRow>();
  if (!before) throw new ApiError("NOT_FOUND", "Match storage row not found.");

  const replacing = request.replace === true;
  if (before.result_json && !replacing) {
    const existing = parseJson<MatchResult>(before.result_json);
    if (!existing) throw new ApiError("SERVER_ERROR", "Saved result data is invalid.");
    return {
      ok: false,
      code: "MATCH_CONFLICT",
      message: conflictMessage(tournament, definition, existing),
      saved: savedMatchPayload(before),
    };
  }
  if (before.result_json && Number(request.expectedVersion) !== before.version) {
    return {
      ok: false,
      code: "STALE_REPLACEMENT",
      message: "The saved result changed again. Reload before replacing it.",
      saved: savedMatchPayload(before),
    };
  }

  const now = new Date().toISOString();
  const expectedVersion = replacing ? Number(request.expectedVersion) : before.version;
  const update = await db.prepare(`
    UPDATE matches
    SET
      status = 'completed',
      version = version + 1,
      updated_at = ?,
      winner_id = ?,
      result_json = ?,
      detail_json = ?
    WHERE tournament_id = ?
      AND match_id = ?
      AND version = ?
      AND ((? = 0 AND result_json IS NULL) OR (? = 1 AND result_json IS NOT NULL))
      AND NOT EXISTS (
        SELECT 1
        FROM match_dependencies dependency
        JOIN matches descendant
          ON descendant.tournament_id = dependency.tournament_id
          AND descendant.match_id = dependency.descendant_match_id
        WHERE dependency.tournament_id = matches.tournament_id
          AND dependency.ancestor_match_id = matches.match_id
          AND descendant.result_json IS NOT NULL
      )
      AND NOT (
        stage = 'group'
        AND EXISTS (
          SELECT 1
          FROM matches knockout
          WHERE knockout.tournament_id = matches.tournament_id
            AND knockout.stage = 'knockout'
            AND knockout.result_json IS NOT NULL
        )
      )
  `).bind(
    now,
    checked.result.winnerId,
    JSON.stringify(checked.result),
    request.detail === null || request.detail === undefined ? null : JSON.stringify(request.detail),
    tournamentId,
    matchId,
    expectedVersion,
    Number(replacing),
    Number(replacing),
  ).run();

  if (update.meta.changes === 0) {
    const current = await db.prepare(`
      SELECT match_id, status, version, updated_at, result_json, detail_json
      FROM matches
      WHERE tournament_id = ? AND match_id = ?
    `).bind(tournamentId, matchId).first<SavedMatchRow>();
    if (!current) throw new ApiError("NOT_FOUND", "Match storage row not found.");

    const dependent = await db.prepare(`
      SELECT 1 AS locked
      FROM matches target
      WHERE target.tournament_id = ?
        AND target.match_id = ?
        AND (
          EXISTS (
            SELECT 1
            FROM match_dependencies dependency
            JOIN matches descendant
              ON descendant.tournament_id = dependency.tournament_id
              AND descendant.match_id = dependency.descendant_match_id
            WHERE dependency.tournament_id = target.tournament_id
              AND dependency.ancestor_match_id = target.match_id
              AND descendant.result_json IS NOT NULL
          )
          OR (
            target.stage = 'group'
            AND EXISTS (
              SELECT 1 FROM matches knockout
              WHERE knockout.tournament_id = target.tournament_id
                AND knockout.stage = 'knockout'
                AND knockout.result_json IS NOT NULL
            )
          )
        )
    `).bind(tournamentId, matchId).first<{ locked: number }>();
    if (dependent) {
      return { ok: false, code: "RESULT_LOCKED", message: "A later match depending on this result is already complete, so it cannot be replaced." };
    }

    const existing = parseJson<MatchResult>(current.result_json);
    if (existing && !replacing) {
      return {
        ok: false,
        code: "MATCH_CONFLICT",
        message: conflictMessage(tournament, definition, existing),
        saved: savedMatchPayload(current),
      };
    }
    return {
      ok: false,
      code: "STALE_REPLACEMENT",
      message: "The saved result changed again. Reload before replacing it.",
      saved: current.result_json ? savedMatchPayload(current) : undefined,
    };
  }

  const saved = await db.prepare(`
    SELECT match_id, status, version, updated_at, result_json, detail_json
    FROM matches
    WHERE tournament_id = ? AND match_id = ?
  `).bind(tournamentId, matchId).first<SavedMatchRow>();
  if (!saved) throw new ApiError("SERVER_ERROR", "Saved match could not be reloaded.");
  return { ok: true, saved: savedMatchPayload(saved) };
};

const singleSummary = (row: SingleMatchRow) => parseJson<JsonObject>(row.result_json);

const listSingleMatches = async (db: D1Database) => {
  const rows = await db.prepare(`
    SELECT * FROM single_matches
    WHERE deleted_at IS NULL
    ORDER BY played_at DESC
  `).all<SingleMatchRow>();
  return rows.results.map(singleSummary).filter((value): value is JsonObject => Boolean(value));
};

const getSingleMatch = async (db: D1Database, id: string) => {
  const row = await db.prepare(`
    SELECT * FROM single_matches
    WHERE id = ? AND deleted_at IS NULL
  `).bind(id).first<SingleMatchRow>();
  if (!row) throw new ApiError("NOT_FOUND", "Match not found.");
  return { ...singleSummary(row), detail: parseJson<unknown>(row.detail_json) };
};

const saveSingleMatch = async (db: D1Database, request: JsonObject) => {
  const id = requiredString(request.id, "INVALID_REQUEST", "Match ID, date, and detail are required.");
  const playedAt = requiredString(request.playedAt, "INVALID_REQUEST", "Match ID, date, and detail are required.");
  if (!isRecord(request.detail)) throw new ApiError("INVALID_REQUEST", "Match ID, date, and detail are required.");
  const detail = request.detail;
  if (detail.completed !== true || (detail.winner !== 0 && detail.winner !== 1)) {
    throw new ApiError("INVALID_RESULT", "Only a completed match can be saved.");
  }
  if (!Array.isArray(detail.players)
    || detail.players.length !== 2
    || detail.players.some((player) => typeof player !== "string" || !player.trim())) {
    throw new ApiError("INVALID_RESULT", "Two named players are required.");
  }
  if (!isRecord(detail.config)
    || !Number.isInteger(detail.config.startingScore)
    || Number(detail.config.startingScore) < 2
    || !Number.isInteger(detail.config.bestOf)
    || Number(detail.config.bestOf) < 1
    || Number(detail.config.bestOf) % 2 === 0
    || (detail.config.checkIn !== "straight" && detail.config.checkIn !== "double")) {
    throw new ApiError("INVALID_RESULT", "The match format is invalid.");
  }
  const winner = detail.winner;
  const target = Math.floor(Number(detail.config.bestOf) / 2) + 1;
  if (!Array.isArray(detail.legsWon)
    || Number(detail.legsWon[winner]) !== target
    || Number(detail.legsWon[winner === 0 ? 1 : 0]) >= target) {
    throw new ApiError("INVALID_RESULT", "The leg score does not match the match format.");
  }

  const players: [string, string] = [String(detail.players[0]), String(detail.players[1])];
  const summary = {
    id,
    playedAt,
    players,
    winner,
    legsWon: detail.legsWon,
    startingScore: Number(detail.config.startingScore),
    checkIn: detail.config.checkIn,
    bestOf: Number(detail.config.bestOf),
  };
  await db.prepare(`
    INSERT INTO single_matches (
      id, played_at, player_one, player_two, winner, starting_score,
      check_in, best_of, result_json, detail_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO NOTHING
  `).bind(
    id,
    playedAt,
    players[0],
    players[1],
    winner,
    summary.startingScore,
    summary.checkIn,
    summary.bestOf,
    JSON.stringify(summary),
    JSON.stringify(detail),
  ).run();
  return getSingleMatch(db, id);
};

const verifyAdminPin = async (provided: unknown, expected: string | undefined) => {
  if (!expected) throw new ApiError("PIN_NOT_CONFIGURED", "The organiser PIN has not been configured yet.");
  if (typeof provided !== "string" || !provided) throw new ApiError("INVALID_PIN", "That organiser PIN is incorrect.");
  const encoder = new TextEncoder();
  const [providedHash, expectedHash] = await Promise.all([
    crypto.subtle.digest("SHA-256", encoder.encode(provided)),
    crypto.subtle.digest("SHA-256", encoder.encode(expected)),
  ]);
  const providedBytes = new Uint8Array(providedHash);
  const expectedBytes = new Uint8Array(expectedHash);
  let difference = 0;
  for (let index = 0; index < providedBytes.length; index += 1) {
    difference |= providedBytes[index] ^ expectedBytes[index];
  }
  if (difference !== 0) {
    throw new ApiError("INVALID_PIN", "That organiser PIN is incorrect.");
  }
};

const listTrashUnchecked = async (db: D1Database) => {
  const [tournaments, singles] = await Promise.all([
    db.prepare(`
      SELECT id, name, status, date, created_at, updated_at, deleted_at
      FROM tournaments WHERE deleted_at IS NOT NULL ORDER BY deleted_at DESC
    `).all<Omit<TournamentRow, "tournament_json">>(),
    db.prepare(`
      SELECT * FROM single_matches
      WHERE deleted_at IS NOT NULL ORDER BY deleted_at DESC
    `).all<SingleMatchRow>(),
  ]);
  return {
    tournaments: tournaments.results.map((row) => ({
      id: row.id,
      name: row.name,
      status: row.status,
      date: row.date,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      deletedAt: row.deleted_at,
    })),
    matches: singles.results.map((row) => ({
      ...singleSummary(row),
      deletedAt: row.deleted_at,
    })),
  };
};

const changeTrashItem = async (db: D1Database, request: JsonObject, operation: "trash" | "restore" | "purge") => {
  const kind = request.kind;
  const id = requiredString(request.id, "INVALID_REQUEST", "Item type and ID are required.");
  if (kind !== "tournament" && kind !== "single") {
    throw new ApiError("INVALID_REQUEST", "Item type and ID are required.");
  }
  const table = kind === "tournament" ? "tournaments" : "single_matches";
  const row = await db.prepare(`SELECT deleted_at FROM ${table} WHERE id = ?`).bind(id).first<{ deleted_at: string | null }>();
  if (!row) throw new ApiError("NOT_FOUND", "Item not found.");

  if (operation === "trash") {
    await db.prepare(`UPDATE ${table} SET deleted_at = COALESCE(deleted_at, ?) WHERE id = ?`)
      .bind(new Date().toISOString(), id).run();
  } else if (operation === "restore") {
    await db.prepare(`UPDATE ${table} SET deleted_at = NULL WHERE id = ?`).bind(id).run();
  } else {
    if (!row.deleted_at) throw new ApiError("NOT_TRASHED", "Move the item to Trash before deleting it permanently.");
    await db.prepare(`DELETE FROM ${table} WHERE id = ?`).bind(id).run();
  }
  return listTrashUnchecked(db);
};

const handleGet = async (request: Request, env: Env) => {
  const url = new URL(request.url);
  const action = url.searchParams.get("action") ?? "listTournaments";
  if (action === "listTournaments") return json({ ok: true, tournaments: await listTournaments(env.DB) });
  if (action === "getTournament") {
    const id = requiredString(url.searchParams.get("tournamentId"), "INVALID_REQUEST", "tournamentId is required.");
    return json({ ok: true, tournament: await getTournament(env.DB, id) });
  }
  if (action === "listSingleMatches") return json({ ok: true, matches: await listSingleMatches(env.DB) });
  if (action === "getSingleMatch") {
    const id = requiredString(url.searchParams.get("id"), "INVALID_REQUEST", "id is required.");
    return json({ ok: true, match: await getSingleMatch(env.DB, id) });
  }
  throw new ApiError("UNKNOWN_ACTION", "Unknown action.");
};

const handlePost = async (request: Request, env: Env) => {
  const body = await parseBody(request);
  const action = body.action;
  if (action === "createTournament") return json({ ok: true, tournament: await createTournament(env.DB, body.tournament) });
  if (action === "saveMatch") return json(await saveMatch(env.DB, body));
  if (action === "saveSingleMatch") return json({ ok: true, match: await saveSingleMatch(env.DB, body) });
  if (action === "listTrash") {
    await verifyAdminPin(body.pin, env.ADMIN_PIN);
    return json({ ok: true, trash: await listTrashUnchecked(env.DB) });
  }
  if (action === "trashItem" || action === "restoreItem" || action === "purgeItem") {
    await verifyAdminPin(body.pin, env.ADMIN_PIN);
    const operation = action === "trashItem" ? "trash" : action === "restoreItem" ? "restore" : "purge";
    return json({ ok: true, trash: await changeTrashItem(env.DB, body, operation) });
  }
  throw new ApiError("UNKNOWN_ACTION", "Unknown action.");
};

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const path = new URL(request.url).pathname;
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
    try {
      if (request.method === "GET") return await handleGet(request, env);
      if (request.method === "POST") return await handlePost(request, env);
      return json({ ok: false, code: "INVALID_REQUEST", message: "Method not allowed." }, 405);
    } catch (error) {
      return errorResponse(error, path);
    }
  },
} satisfies ExportedHandler<Env>;
