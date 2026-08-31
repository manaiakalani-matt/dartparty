import assert from "node:assert/strict";

const sourceApiUrl = process.env.SOURCE_API_URL
  ?? "https://script.google.com/macros/s/AKfycbzRrf8wicmEjvywMfRYsxyWAbBC2NkusEF2h-i6Y0Ozm2REn78CEJou0V9L1co88bpOtw/exec";
const targetApiUrl = process.env.TARGET_API_URL;

assert(targetApiUrl, "TARGET_API_URL is required.");
assert.notEqual(targetApiUrl, sourceApiUrl, "Source and target APIs must be different.");

const get = async (baseUrl, action, params = {}) => {
  const url = new URL(baseUrl);
  url.searchParams.set("action", action);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  const response = await fetch(url);
  const body = await response.json();
  if (body.ok === false) throw new Error(`${body.code}: ${body.message}`);
  return body;
};

const post = async (body) => {
  const response = await fetch(targetApiUrl, {
    method: "POST",
    headers: { "content-type": "text/plain;charset=utf-8" },
    body: JSON.stringify(body),
  });
  const value = await response.json();
  if (value.ok === false && value.code !== "ALREADY_EXISTS" && value.code !== "MATCH_CONFLICT") {
    throw new Error(`${value.code}: ${value.message}`);
  }
  return value;
};

const tournamentList = await get(sourceApiUrl, "listTournaments");
let tournamentCount = 0;
let tournamentMatchCount = 0;

for (const summary of tournamentList.tournaments ?? []) {
  const source = await get(sourceApiUrl, "getTournament", { tournamentId: summary.id });
  const snapshot = source.tournament;
  await post({ action: "createTournament", tournament: snapshot.tournament });

  for (const saved of snapshot.savedMatches ?? []) {
    const playerIds = [
      saved.result.playerOneId,
      saved.result.playerTwoId,
    ];
    assert(playerIds.every(Boolean), `Saved match ${saved.matchId} is missing player IDs.`);
    await post({
      action: "saveMatch",
      tournamentId: snapshot.tournament.config.id,
      matchId: saved.matchId,
      playerIds,
      result: saved.result,
      detail: saved.detail,
    });
    tournamentMatchCount += 1;
  }
  tournamentCount += 1;
}

const singleList = await get(sourceApiUrl, "listSingleMatches");
let singleMatchCount = 0;
for (const summary of singleList.matches ?? []) {
  const source = await get(sourceApiUrl, "getSingleMatch", { id: summary.id });
  await post({
    action: "saveSingleMatch",
    id: source.match.id,
    playedAt: source.match.playedAt,
    detail: source.match.detail,
  });
  singleMatchCount += 1;
}

console.log(JSON.stringify({
  tournaments: tournamentCount,
  tournamentMatches: tournamentMatchCount,
  singleMatches: singleMatchCount,
}, null, 2));
