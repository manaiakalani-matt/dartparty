/** @OnlyCurrentDoc */

/**
 * Dart Party — Google Apps Script persistence API.
 * Bind this project to the one master spreadsheet, run setupDartParty once,
 * then deploy it as a web app that anyone with the URL can access.
 */

var DP_SCHEMA_VERSION = 1;
var DP_SHEETS = {
  tournaments: { name: "Tournaments", headers: ["id", "name", "status", "date", "createdAt", "updatedAt", "schemaVersion", "tournamentJson"] },
  matches: { name: "Matches", headers: ["tournamentId", "matchId", "status", "version", "updatedAt", "resultJson", "detailJson"] },
  audit: { name: "Audit", headers: ["timestamp", "action", "tournamentId", "matchId", "previousJson", "nextJson"] },
  singles: { name: "Single Matches", headers: ["id", "playedAt", "playerOne", "playerTwo", "winner", "startingScore", "checkIn", "bestOf", "resultJson", "detailJson"] }
};

function setupDartParty() {
  var spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  Object.keys(DP_SHEETS).forEach(function (key) {
    ensureSheet_(spreadsheet, DP_SHEETS[key]);
  });
  return "Dart Party sheets are ready.";
}

function doGet(event) {
  try {
    var action = String((event && event.parameter && event.parameter.action) || "listTournaments");
    if (action === "listTournaments") return jsonResponse_({ ok: true, tournaments: listTournaments_() });
    if (action === "getTournament") return jsonResponse_({ ok: true, tournament: getTournament_(requiredParameter_(event, "tournamentId")) });
    if (action === "listSingleMatches") return jsonResponse_({ ok: true, matches: listSingleMatches_() });
    if (action === "getSingleMatch") return jsonResponse_({ ok: true, match: getSingleMatch_(requiredParameter_(event, "id")) });
    return jsonResponse_({ ok: false, code: "UNKNOWN_ACTION", message: "Unknown action." });
  } catch (error) {
    return errorResponse_(error);
  }
}

function doPost(event) {
  try {
    var request = parseRequest_(event);
    if (request.action === "createTournament") return jsonResponse_({ ok: true, tournament: createTournament_(request.tournament) });
    if (request.action === "saveMatch") return jsonResponse_(saveMatch_(request));
    if (request.action === "saveSingleMatch") return jsonResponse_({ ok: true, match: saveSingleMatch_(request) });
    return jsonResponse_({ ok: false, code: "UNKNOWN_ACTION", message: "Unknown action." });
  } catch (error) {
    return errorResponse_(error);
  }
}

function saveSingleMatch_(request) {
  validateSingleMatch_(request);
  var lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    var singlesSheet = sheet_(DP_SHEETS.singles);
    var existingRow = findRow_(singlesSheet, 1, request.id);
    if (existingRow) return singleMatchFromRow_(singlesSheet.getRange(existingRow, 1, 1, 10).getValues()[0]);
    var detail = request.detail;
    var summary = {
      id: request.id,
      playedAt: request.playedAt,
      players: detail.players,
      winner: detail.winner,
      legsWon: detail.legsWon,
      startingScore: detail.config.startingScore,
      checkIn: detail.config.checkIn,
      bestOf: detail.config.bestOf
    };
    singlesSheet.appendRow([request.id, request.playedAt, detail.players[0], detail.players[1], detail.players[detail.winner], detail.config.startingScore, detail.config.checkIn, detail.config.bestOf, JSON.stringify(summary), JSON.stringify(detail)]);
    return { id: summary.id, playedAt: summary.playedAt, players: summary.players, winner: summary.winner, legsWon: summary.legsWon, startingScore: summary.startingScore, checkIn: summary.checkIn, bestOf: summary.bestOf, detail: detail };
  } finally {
    lock.releaseLock();
  }
}

function listSingleMatches_() {
  var singlesSheet = sheet_(DP_SHEETS.singles);
  if (singlesSheet.getLastRow() < 2) return [];
  return singlesSheet.getRange(2, 1, singlesSheet.getLastRow() - 1, 10).getValues().map(function (row) {
    return parseJson_(row[8]);
  }).filter(Boolean).sort(function (a, b) { return String(b.playedAt).localeCompare(String(a.playedAt)); });
}

function getSingleMatch_(id) {
  var singlesSheet = sheet_(DP_SHEETS.singles);
  var row = findRow_(singlesSheet, 1, id);
  if (!row) throw apiError_("NOT_FOUND", "Match not found.");
  return singleMatchFromRow_(singlesSheet.getRange(row, 1, 1, 10).getValues()[0]);
}

function singleMatchFromRow_(row) {
  var summary = parseJson_(row[8]);
  summary.detail = parseJson_(row[9]);
  return summary;
}

function validateSingleMatch_(request) {
  var detail = request && request.detail;
  if (!request || !request.id || !request.playedAt || !detail) throw apiError_("INVALID_REQUEST", "Match ID, date, and detail are required.");
  if (!detail.completed || (detail.winner !== 0 && detail.winner !== 1)) throw apiError_("INVALID_RESULT", "Only a completed match can be saved.");
  if (!Array.isArray(detail.players) || detail.players.length !== 2 || !String(detail.players[0]).trim() || !String(detail.players[1]).trim()) throw apiError_("INVALID_RESULT", "Two named players are required.");
  if (!detail.config || Number(detail.config.startingScore) < 2 || Number(detail.config.bestOf) < 1 || Number(detail.config.bestOf) % 2 === 0) throw apiError_("INVALID_RESULT", "The match format is invalid.");
  var target = Math.floor(Number(detail.config.bestOf) / 2) + 1;
  if (!Array.isArray(detail.legsWon) || Number(detail.legsWon[detail.winner]) !== target || Number(detail.legsWon[detail.winner === 0 ? 1 : 0]) >= target) throw apiError_("INVALID_RESULT", "The leg score does not match the match format.");
}

function createTournament_(tournament) {
  validateTournament_(tournament);
  var lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    var sheet = sheet_(DP_SHEETS.tournaments);
    if (findRow_(sheet, 1, tournament.config.id)) throw apiError_("ALREADY_EXISTS", "A tournament with that ID already exists.");
    var now = new Date().toISOString();
    sheet.appendRow([tournament.config.id, tournament.config.name, tournament.status, tournament.config.date, now, now, DP_SCHEMA_VERSION, JSON.stringify(tournament)]);
    tournament.matches.forEach(function (match) {
      sheet_(DP_SHEETS.matches).appendRow([tournament.config.id, match.id, match.status, 0, now, "", ""]);
    });
    return tournamentSnapshot_(tournament.config.id);
  } finally {
    lock.releaseLock();
  }
}

function saveMatch_(request) {
  if (!request.tournamentId || !request.matchId || !request.result) throw apiError_("INVALID_REQUEST", "Tournament, match, and result are required.");
  var lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    var tournamentRecord = tournamentRecord_(request.tournamentId);
    var definition = tournamentRecord.tournament.matches.filter(function (match) { return match.id === request.matchId; })[0];
    if (!definition) throw apiError_("NOT_FOUND", "Match not found.");
    var playerIds = request.playerIds || [definition.playerOneId, definition.playerTwoId];
    validateResult_(tournamentRecord.tournament, definition, playerIds, request.result);
    request.result.playerOneId = playerIds[0];
    request.result.playerTwoId = playerIds[1];

    var matchesSheet = sheet_(DP_SHEETS.matches);
    var row = findMatchRow_(matchesSheet, request.tournamentId, request.matchId);
    if (!row) throw apiError_("NOT_FOUND", "Match storage row not found.");
    var values = matchesSheet.getRange(row, 1, 1, DP_SHEETS.matches.headers.length).getValues()[0];
    var currentVersion = Number(values[3] || 0);
    var existingResult = parseJson_(values[5]);
    var existingDetail = parseJson_(values[6]);

    if (existingResult && !request.replace) {
      return { ok: false, code: "MATCH_CONFLICT", message: conflictMessage_(tournamentRecord.tournament, definition, existingResult), saved: { result: existingResult, detail: existingDetail, version: currentVersion } };
    }
    if (existingResult && Number(request.expectedVersion) !== currentVersion) {
      return { ok: false, code: "STALE_REPLACEMENT", message: "The saved result changed again. Reload before replacing it.", saved: { result: existingResult, detail: existingDetail, version: currentVersion } };
    }
    if (existingResult && hasCompletedDescendant_(tournamentRecord.tournament, request.matchId, request.tournamentId)) {
      return { ok: false, code: "RESULT_LOCKED", message: "A later match depending on this result is already complete, so it cannot be replaced." };
    }

    var nextVersion = currentVersion + 1;
    var now = new Date().toISOString();
    var nextResultJson = JSON.stringify(request.result);
    var nextDetailJson = request.detail ? JSON.stringify(request.detail) : "";
    if (existingResult) sheet_(DP_SHEETS.audit).appendRow([now, "replaceMatch", request.tournamentId, request.matchId, JSON.stringify({ result: existingResult, detail: existingDetail }), JSON.stringify({ result: request.result, detail: request.detail || null })]);
    matchesSheet.getRange(row, 3, 1, 5).setValues([["completed", nextVersion, now, nextResultJson, nextDetailJson]]);
    refreshTournamentStatus_(tournamentRecord, request.matchId, request.result.winnerId, now);
    return { ok: true, saved: { result: request.result, detail: request.detail || null, version: nextVersion } };
  } finally {
    lock.releaseLock();
  }
}

function listTournaments_() {
  var sheet = sheet_(DP_SHEETS.tournaments);
  if (sheet.getLastRow() < 2) return [];
  return sheet.getRange(2, 1, sheet.getLastRow() - 1, 8).getValues().map(function (row) {
    return { id: row[0], name: row[1], status: row[2], date: row[3], createdAt: row[4], updatedAt: row[5] };
  }).sort(function (a, b) { return String(b.updatedAt).localeCompare(String(a.updatedAt)); });
}

function getTournament_(tournamentId) {
  return tournamentSnapshot_(tournamentId);
}

function tournamentSnapshot_(tournamentId) {
  var record = tournamentRecord_(tournamentId);
  var resultRows = matchRows_(tournamentId).filter(function (row) { return row.result; });
  return { tournament: record.tournament, savedMatches: resultRows };
}

function tournamentRecord_(tournamentId) {
  var sheet = sheet_(DP_SHEETS.tournaments);
  var row = findRow_(sheet, 1, tournamentId);
  if (!row) throw apiError_("NOT_FOUND", "Tournament not found.");
  var values = sheet.getRange(row, 1, 1, 8).getValues()[0];
  return { row: row, values: values, tournament: JSON.parse(values[7]) };
}

function matchRows_(tournamentId) {
  var sheet = sheet_(DP_SHEETS.matches);
  if (sheet.getLastRow() < 2) return [];
  return sheet.getRange(2, 1, sheet.getLastRow() - 1, 7).getValues().filter(function (row) { return row[0] === tournamentId; }).map(function (row) {
    return { matchId: row[1], status: row[2], version: Number(row[3]), updatedAt: row[4], result: parseJson_(row[5]), detail: parseJson_(row[6]) };
  });
}

function refreshTournamentStatus_(record, matchId, winnerId, now) {
  var finalMatch = record.tournament.matches.filter(function (match) { return match.stage === "knockout" && match.stageLabel === "Final"; })[0];
  var status = finalMatch && finalMatch.id === matchId ? "completed" : "active";
  record.tournament.status = status;
  record.tournament.championId = status === "completed" ? winnerId : null;
  var sheet = sheet_(DP_SHEETS.tournaments);
  sheet.getRange(record.row, 3).setValue(status);
  sheet.getRange(record.row, 6).setValue(now);
  sheet.getRange(record.row, 8).setValue(JSON.stringify(record.tournament));
}

function hasCompletedDescendant_(tournament, matchId, tournamentId) {
  var completed = {};
  matchRows_(tournamentId).forEach(function (row) { if (row.result) completed[row.matchId] = true; });
  var original = tournament.matches.filter(function (match) { return match.id === matchId; })[0];
  if (original && original.stage === "group") {
    return tournament.matches.some(function (match) { return match.stage === "knockout" && completed[match.id]; });
  }
  var frontier = [matchId];
  while (frontier.length) {
    var sourceId = frontier.shift();
    var children = tournament.matches.filter(function (match) {
      return (match.sourceOne && match.sourceOne.matchId === sourceId) || (match.sourceTwo && match.sourceTwo.matchId === sourceId);
    });
    for (var i = 0; i < children.length; i += 1) {
      if (completed[children[i].id]) return true;
      frontier.push(children[i].id);
    }
  }
  return false;
}

function validateTournament_(tournament) {
  if (!tournament || !tournament.config || !tournament.config.id || !tournament.config.name) throw apiError_("INVALID_TOURNAMENT", "Tournament ID and name are required.");
  if (!Array.isArray(tournament.players) || tournament.players.length < 2) throw apiError_("INVALID_TOURNAMENT", "At least two players are required.");
  if (!Array.isArray(tournament.matches) || tournament.matches.length < 1) throw apiError_("INVALID_TOURNAMENT", "At least one match is required.");
}

function validateResult_(tournament, match, playerIds, result) {
  if (!Array.isArray(playerIds) || playerIds.length !== 2 || playerIds[0] === playerIds[1]) throw apiError_("INVALID_RESULT", "Two different match players are required.");
  var tournamentPlayerIds = tournament.players.map(function (player) { return player.id; });
  if (tournamentPlayerIds.indexOf(playerIds[0]) === -1 || tournamentPlayerIds.indexOf(playerIds[1]) === -1) throw apiError_("INVALID_RESULT", "Both players must belong to this tournament.");
  if (match.playerOneId && match.playerOneId !== playerIds[0]) throw apiError_("INVALID_RESULT", "Player one does not match the draw.");
  if (match.playerTwoId && match.playerTwoId !== playerIds[1]) throw apiError_("INVALID_RESULT", "Player two does not match the draw.");
  if (playerIds.indexOf(result.winnerId) === -1) throw apiError_("INVALID_RESULT", "Winner is not in this match.");
  var target = Math.floor(match.bestOf / 2) + 1;
  var winnerLegs = result.winnerId === playerIds[0] ? Number(result.playerOneLegs) : Number(result.playerTwoLegs);
  var loserLegs = result.winnerId === playerIds[0] ? Number(result.playerTwoLegs) : Number(result.playerOneLegs);
  if (winnerLegs !== target || loserLegs < 0 || loserLegs >= target) throw apiError_("INVALID_RESULT", "The leg score does not match this match format.");
}

function conflictMessage_(tournament, match, result) {
  var names = {};
  tournament.players.forEach(function (player) { names[player.id] = player.name; });
  var playerOneId = result.playerOneId || match.playerOneId;
  var playerTwoId = result.playerTwoId || match.playerTwoId;
  var loserId = result.winnerId === playerOneId ? playerTwoId : playerOneId;
  var winnerLegs = result.winnerId === playerOneId ? result.playerOneLegs : result.playerTwoLegs;
  var loserLegs = result.winnerId === playerOneId ? result.playerTwoLegs : result.playerOneLegs;
  return names[result.winnerId] + " defeated " + names[loserId] + " " + winnerLegs + "–" + loserLegs + ". Your local result has not been saved.";
}

function ensureSheet_(spreadsheet, definition) {
  var sheet = spreadsheet.getSheetByName(definition.name) || spreadsheet.insertSheet(definition.name);
  if (sheet.getLastRow() === 0) sheet.appendRow(definition.headers);
  var existing = sheet.getRange(1, 1, 1, definition.headers.length).getValues()[0];
  if (existing.join("|") !== definition.headers.join("|")) throw new Error(definition.name + " has unexpected headers. Refusing to overwrite it.");
  sheet.setFrozenRows(1);
  sheet.getRange(1, 1, 1, definition.headers.length).setFontWeight("bold");
}

function sheet_(definition) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(definition.name);
  if (!sheet) throw apiError_("NOT_CONFIGURED", "Run setupDartParty in the spreadsheet first.");
  return sheet;
}

function findRow_(sheet, column, value) {
  if (sheet.getLastRow() < 2) return 0;
  var match = sheet.getRange(2, column, sheet.getLastRow() - 1, 1).createTextFinder(String(value)).matchEntireCell(true).findNext();
  return match ? match.getRow() : 0;
}

function findMatchRow_(sheet, tournamentId, matchId) {
  if (sheet.getLastRow() < 2) return 0;
  var values = sheet.getRange(2, 1, sheet.getLastRow() - 1, 2).getValues();
  for (var index = 0; index < values.length; index += 1) if (values[index][0] === tournamentId && values[index][1] === matchId) return index + 2;
  return 0;
}

function requiredParameter_(event, name) {
  var value = event && event.parameter && event.parameter[name];
  if (!value) throw apiError_("INVALID_REQUEST", name + " is required.");
  return String(value);
}

function parseRequest_(event) {
  if (!event || !event.postData || !event.postData.contents) throw apiError_("INVALID_REQUEST", "JSON request body is required.");
  try { return JSON.parse(event.postData.contents); } catch (error) { throw apiError_("INVALID_JSON", "Request body must be valid JSON."); }
}

function parseJson_(value) {
  if (!value) return null;
  try { return JSON.parse(value); } catch (error) { return null; }
}

function apiError_(code, message) { var error = new Error(message); error.apiCode = code; return error; }
function errorResponse_(error) { console.error(error); return jsonResponse_({ ok: false, code: error.apiCode || "SERVER_ERROR", message: error.message || "Unexpected server error." }); }
function jsonResponse_(payload) { return ContentService.createTextOutput(JSON.stringify(payload)).setMimeType(ContentService.MimeType.JSON); }
