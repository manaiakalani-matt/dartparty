import assert from "node:assert/strict";

const sourceApiUrl = process.env.SOURCE_API_URL
  ?? "https://script.google.com/macros/s/AKfycbzRrf8wicmEjvywMfRYsxyWAbBC2NkusEF2h-i6Y0Ozm2REn78CEJou0V9L1co88bpOtw/exec";
const targetApiUrl = process.env.TARGET_API_URL;
assert(targetApiUrl, "TARGET_API_URL is required.");

const get = async (baseUrl, action, params = {}) => {
  const url = new URL(baseUrl);
  url.searchParams.set("action", action);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  const response = await fetch(url);
  const body = await response.json();
  assert.notEqual(body.ok, false, `${body.code}: ${body.message}`);
  return body;
};

const sourceTournaments = (await get(sourceApiUrl, "listTournaments")).tournaments ?? [];
const targetTournaments = (await get(targetApiUrl, "listTournaments")).tournaments ?? [];
assert.deepEqual(
  targetTournaments.map((item) => item.id).sort(),
  sourceTournaments.map((item) => item.id).sort(),
);

let savedMatchCount = 0;
for (const summary of sourceTournaments) {
  const source = (await get(sourceApiUrl, "getTournament", { tournamentId: summary.id })).tournament;
  const target = (await get(targetApiUrl, "getTournament", { tournamentId: summary.id })).tournament;
  assert.deepEqual(target.tournament.config, source.tournament.config);
  assert.deepEqual(target.tournament.players, source.tournament.players);
  assert.deepEqual(target.tournament.matches, source.tournament.matches);

  const normalize = (saved) => ({
    matchId: saved.matchId,
    result: saved.result,
    detail: saved.detail,
  });
  assert.deepEqual(
    target.savedMatches.map(normalize).sort((a, b) => a.matchId.localeCompare(b.matchId)),
    source.savedMatches.map(normalize).sort((a, b) => a.matchId.localeCompare(b.matchId)),
  );
  savedMatchCount += source.savedMatches.length;
}

const sourceSingles = (await get(sourceApiUrl, "listSingleMatches")).matches ?? [];
const targetSingles = (await get(targetApiUrl, "listSingleMatches")).matches ?? [];
assert.deepEqual(
  targetSingles.map((item) => item.id).sort(),
  sourceSingles.map((item) => item.id).sort(),
);
for (const summary of sourceSingles) {
  const source = (await get(sourceApiUrl, "getSingleMatch", { id: summary.id })).match;
  const target = (await get(targetApiUrl, "getSingleMatch", { id: summary.id })).match;
  assert.deepEqual(target, source);
}

console.log(JSON.stringify({
  tournaments: sourceTournaments.length,
  tournamentMatches: savedMatchCount,
  singleMatches: sourceSingles.length,
  result: "all migrated records match",
}, null, 2));
