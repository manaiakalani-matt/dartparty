import assert from "node:assert/strict";

const apiUrl = process.env.API_BASE_URL ?? "http://localhost:8787";

const post = async (body) => {
  const response = await fetch(apiUrl, {
    method: "POST",
    headers: { "content-type": "text/plain;charset=utf-8" },
    body: JSON.stringify(body),
  });
  assert.equal(response.status, 200);
  return response.json();
};

const tournamentId = `integration_${Date.now()}`;
const players = ["One", "Two", "Three", "Four"].map((name, index) => ({
  id: `player_${index + 1}`,
  name,
  groupId: null,
  drawPosition: index + 1,
}));
const tournament = {
  config: {
    id: tournamentId,
    name: "Worker Integration Test",
    date: "31 Aug 2026",
    startingScore: 501,
    checkIn: "straight",
    structure: "knockout",
    qualifiersPerGroup: 2,
    formats: { group: 3, early: 3, semifinal: 3, final: 3 },
  },
  players,
  matches: [
    {
      id: "semi_1", stage: "knockout", stageLabel: "Semifinal", groupId: null,
      round: 1, order: 1, bestOf: 3, playerOneId: "player_1", playerTwoId: "player_2",
      sourceOne: null, sourceTwo: null, status: "unplayed", result: null,
    },
    {
      id: "semi_2", stage: "knockout", stageLabel: "Semifinal", groupId: null,
      round: 1, order: 2, bestOf: 3, playerOneId: "player_3", playerTwoId: "player_4",
      sourceOne: null, sourceTwo: null, status: "unplayed", result: null,
    },
    {
      id: "final", stage: "knockout", stageLabel: "Final", groupId: null,
      round: 2, order: 1, bestOf: 3, playerOneId: null, playerTwoId: null,
      sourceOne: { kind: "match", matchId: "semi_1" },
      sourceTwo: { kind: "match", matchId: "semi_2" },
      status: "waiting", result: null,
    },
  ],
  status: "active",
  championId: null,
};

const result = (winnerId, playerOneLegs, playerTwoLegs) => ({
  winnerId,
  playerOneLegs,
  playerTwoLegs,
  source: "manual",
});

const created = await post({ action: "createTournament", tournament });
assert.equal(created.ok, true);
assert.equal(created.tournament.savedMatches.length, 0);

const simultaneous = await Promise.all([
  post({
    action: "saveMatch", tournamentId, matchId: "semi_1",
    playerIds: ["player_1", "player_2"], result: result("player_1", 2, 0), detail: null,
  }),
  post({
    action: "saveMatch", tournamentId, matchId: "semi_1",
    playerIds: ["player_1", "player_2"], result: result("player_2", 0, 2), detail: null,
  }),
]);
assert.deepEqual(simultaneous.map((value) => value.ok).sort(), [false, true]);
const semiOneWinner = simultaneous.find((value) => value.ok).saved.result.winnerId;
assert.equal(simultaneous.find((value) => !value.ok).code, "MATCH_CONFLICT");

const secondSemi = await post({
  action: "saveMatch", tournamentId, matchId: "semi_2",
  playerIds: ["player_3", "player_4"], result: result("player_3", 2, 1), detail: null,
});
assert.equal(secondSemi.ok, true);

const stale = await post({
  action: "saveMatch", tournamentId, matchId: "semi_2",
  playerIds: ["player_3", "player_4"], result: result("player_4", 1, 2), detail: null,
  replace: true, expectedVersion: 0,
});
assert.equal(stale.code, "STALE_REPLACEMENT");

const replacement = await post({
  action: "saveMatch", tournamentId, matchId: "semi_2",
  playerIds: ["player_3", "player_4"], result: result("player_4", 1, 2), detail: null,
  replace: true, expectedVersion: 1,
});
assert.equal(replacement.ok, true);
assert.equal(replacement.saved.version, 2);

const finalSave = await post({
  action: "saveMatch", tournamentId, matchId: "final",
  playerIds: [semiOneWinner, "player_4"], result: result(semiOneWinner, 2, 1), detail: null,
});
assert.equal(finalSave.ok, true);

const locked = await post({
  action: "saveMatch", tournamentId, matchId: "semi_1",
  playerIds: ["player_1", "player_2"], result: result("player_1", 2, 0), detail: null,
  replace: true, expectedVersion: 1,
});
assert.equal(locked.code, "RESULT_LOCKED");

const snapshotResponse = await fetch(`${apiUrl}?action=getTournament&tournamentId=${tournamentId}`);
const snapshot = await snapshotResponse.json();
assert.equal(snapshot.ok, true);
assert.equal(snapshot.tournament.tournament.status, "completed");
assert.equal(snapshot.tournament.tournament.championId, semiOneWinner);
assert.equal(snapshot.tournament.savedMatches.length, 3);

const singleId = `single_${Date.now()}`;
const single = await post({
  action: "saveSingleMatch",
  id: singleId,
  playedAt: new Date().toISOString(),
  detail: {
    completed: true,
    winner: 0,
    players: ["Alpha", "Beta"],
    legsWon: [2, 1],
    config: { startingScore: 501, checkIn: "straight", bestOf: 3 },
  },
});
assert.equal(single.ok, true);

const wrongPin = await post({ action: "listTrash", pin: "9999" });
assert.equal(wrongPin.code, "INVALID_PIN");
const trash = await post({ action: "trashItem", pin: "1234", kind: "single", id: singleId });
assert.equal(trash.ok, true);
assert.equal(trash.trash.matches.length, 1);
const restored = await post({ action: "restoreItem", pin: "1234", kind: "single", id: singleId });
assert.equal(restored.ok, true);
assert.equal(restored.trash.matches.length, 0);

console.log(JSON.stringify({
  tournamentId,
  simultaneousSave: "first save won and second conflicted",
  staleReplacement: "blocked",
  validReplacement: "audited",
  dependentReplacement: "locked",
  finalChampion: semiOneWinner,
  trashPin: "verified",
}, null, 2));
