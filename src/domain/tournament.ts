import { legsNeededToWin, type CheckIn } from "./x01";

export type TournamentStructure = "knockout" | "single-group" | "two-groups";
export type TournamentStatus = "active" | "completed";
export type TournamentMatchStatus = "waiting" | "unplayed" | "completed" | "bye";
export type ResultSource = "scored" | "manual" | "bye";

export interface StageFormats {
  group: number;
  early: number;
  semifinal: number;
  final: number;
}

export interface TournamentConfig {
  id: string;
  name: string;
  date: string;
  startingScore: number;
  checkIn: CheckIn;
  structure: TournamentStructure;
  qualifiersPerGroup: number;
  formats: StageFormats;
}

export interface TournamentPlayer {
  id: string;
  name: string;
  groupId: "A" | "B" | null;
  drawPosition: number;
}

export interface MatchPlayerStats {
  points: number;
  darts: number;
}

export interface TournamentMatchResult {
  winnerId: string;
  playerOneLegs: number;
  playerTwoLegs: number;
  source: ResultSource;
  playerStats?: Record<string, MatchPlayerStats>;
}

export interface MatchSource {
  kind: "match" | "group";
  matchId?: string;
  groupId?: "A" | "B";
  rank?: number;
}

export interface TournamentMatch {
  id: string;
  stage: "group" | "knockout";
  stageLabel: string;
  groupId: "A" | "B" | null;
  round: number;
  order: number;
  bestOf: number;
  playerOneId: string | null;
  playerTwoId: string | null;
  sourceOne: MatchSource | null;
  sourceTwo: MatchSource | null;
  status: TournamentMatchStatus;
  result: TournamentMatchResult | null;
}

export interface Tournament {
  config: TournamentConfig;
  players: TournamentPlayer[];
  matches: TournamentMatch[];
  status: TournamentStatus;
  championId: string | null;
}

export interface Standing {
  rank: number;
  playerId: string;
  played: number;
  wins: number;
  losses: number;
  legsFor: number;
  legsAgainst: number;
  legDifference: number;
  points: number;
  darts: number;
  average: number | null;
  completeStats: boolean;
  unresolvedTie: boolean;
}

export interface CreateTournamentInput {
  config: TournamentConfig;
  playerNames: string[];
}

const isPowerOfTwo = (value: number) => value > 0 && (value & (value - 1)) === 0;
const nextPowerOfTwo = (value: number) => 2 ** Math.ceil(Math.log2(value));

const validateBestOf = (value: number, label: string) => {
  if (!Number.isInteger(value) || value < 1 || value % 2 === 0) {
    throw new Error(`${label} match length must be a positive odd number.`);
  }
};

function validateTournamentInput({ config, playerNames }: CreateTournamentInput) {
  const cleaned = playerNames.map((name) => name.trim()).filter(Boolean);
  if (cleaned.length < 2) throw new Error("A tournament needs at least two players.");
  if (cleaned.length > 32) throw new Error("Version one supports up to 32 players.");
  if (new Set(cleaned.map((name) => name.toLocaleLowerCase())).size !== cleaned.length) {
    throw new Error("Player names must be unique within a tournament.");
  }
  if (!Number.isInteger(config.startingScore) || config.startingScore < 2) {
    throw new Error("Starting score must be an integer of at least 2.");
  }
  validateBestOf(config.formats.group, "Group");
  validateBestOf(config.formats.early, "Early-round");
  validateBestOf(config.formats.semifinal, "Semifinal");
  validateBestOf(config.formats.final, "Final");

  if (config.structure !== "knockout") {
    const groupCount = config.structure === "two-groups" ? 2 : 1;
    const smallestGroup = Math.floor(cleaned.length / groupCount);
    const minimumQualifiers = config.structure === "single-group" ? 2 : 1;
    if (!isPowerOfTwo(config.qualifiersPerGroup) || config.qualifiersPerGroup < minimumQualifiers || config.qualifiersPerGroup > smallestGroup) {
      throw new Error("Qualifiers per group must be a power of two that fits the smallest group.");
    }
  }
}

const makePlayers = (names: string[], structure: TournamentStructure): TournamentPlayer[] =>
  names.map((name, index) => ({
    id: `player_${index + 1}`,
    name: name.trim(),
    groupId: structure === "two-groups" ? (index % 2 === 0 ? "A" : "B") : structure === "single-group" ? "A" : null,
    drawPosition: index + 1,
  }));

function roundRobinRounds(playerIds: string[]): Array<Array<readonly [string, string]>> {
  const rotation: Array<string | null> = [...playerIds];
  if (rotation.length % 2 === 1) rotation.push(null);
  const rounds: Array<Array<readonly [string, string]>> = [];

  for (let round = 0; round < rotation.length - 1; round += 1) {
    const pairs: Array<readonly [string, string]> = [];
    for (let index = 0; index < rotation.length / 2; index += 1) {
      const first = rotation[index];
      const second = rotation[rotation.length - 1 - index];
      if (first && second) pairs.push([first, second]);
    }
    rounds.push(pairs);
    rotation.splice(1, 0, rotation.pop()!);
  }

  return rounds;
}

function groupMatches(players: TournamentPlayer[], groupId: "A" | "B", bestOf: number): TournamentMatch[] {
  const playerIds = players.filter((player) => player.groupId === groupId).map((player) => player.id);
  let order = 0;
  return roundRobinRounds(playerIds).flatMap((round, roundIndex) => round.map(([playerOneId, playerTwoId]) => {
    order += 1;
    return {
      id: `group_${groupId.toLowerCase()}_${order}`,
      stage: "group" as const,
      stageLabel: `Group ${groupId}`,
      groupId,
      round: roundIndex + 1,
      order,
      bestOf,
      playerOneId,
      playerTwoId,
      sourceOne: null,
      sourceTwo: null,
      status: "unplayed" as const,
      result: null,
    };
  }));
}

interface KnockoutSlot {
  playerId: string | null;
  source: MatchSource | null;
}

const knockoutStageLabel = (round: number, totalRounds: number) => {
  const roundsRemaining = totalRounds - round;
  if (roundsRemaining === 0) return "Final";
  if (roundsRemaining === 1) return "Semifinal";
  if (roundsRemaining === 2) return "Quarterfinal";
  return `Round of ${2 ** (roundsRemaining + 1)}`;
};

const formatForKnockoutRound = (round: number, totalRounds: number, formats: StageFormats) => {
  const label = knockoutStageLabel(round, totalRounds);
  if (label === "Final") return formats.final;
  if (label === "Semifinal") return formats.semifinal;
  return formats.early;
};

function knockoutMatches(slots: KnockoutSlot[], formats: StageFormats): TournamentMatch[] {
  if (!isPowerOfTwo(slots.length) || slots.length < 2) {
    throw new Error("Knockout slots must form a power-of-two bracket.");
  }

  const totalRounds = Math.log2(slots.length);
  const matches: TournamentMatch[] = [];
  let previousRoundIds: string[] = [];

  for (let round = 1; round <= totalRounds; round += 1) {
    const matchCount = slots.length / 2 ** round;
    const currentRoundIds: string[] = [];

    for (let order = 1; order <= matchCount; order += 1) {
      const id = `ko_r${round}_m${order}`;
      currentRoundIds.push(id);
      const firstRound = round === 1;
      const slotOne = firstRound ? slots[(order - 1) * 2] : null;
      const slotTwo = firstRound ? slots[(order - 1) * 2 + 1] : null;
      const sourceOne = firstRound ? slotOne!.source : { kind: "match" as const, matchId: previousRoundIds[(order - 1) * 2] };
      const sourceTwo = firstRound ? slotTwo!.source : { kind: "match" as const, matchId: previousRoundIds[(order - 1) * 2 + 1] };
      const playerOneId = firstRound ? slotOne!.playerId : null;
      const playerTwoId = firstRound ? slotTwo!.playerId : null;
      const explicitBye = firstRound
        && ((playerOneId && !playerTwoId && !sourceTwo) || (playerTwoId && !playerOneId && !sourceOne));
      const byeWinner = explicitBye ? (playerOneId ?? playerTwoId) : null;

      matches.push({
        id,
        stage: "knockout",
        stageLabel: knockoutStageLabel(round, totalRounds),
        groupId: null,
        round,
        order,
        bestOf: formatForKnockoutRound(round, totalRounds, formats),
        playerOneId,
        playerTwoId,
        sourceOne,
        sourceTwo,
        status: explicitBye ? "bye" : playerOneId && playerTwoId ? "unplayed" : "waiting",
        result: byeWinner ? {
          winnerId: byeWinner,
          playerOneLegs: 0,
          playerTwoLegs: 0,
          source: "bye",
        } : null,
      });
    }

    previousRoundIds = currentRoundIds;
  }

  return matches;
}

const seedPositions = (size: number) => {
  if (!isPowerOfTwo(size)) throw new Error("Qualifier count must be a power of two.");
  let positions = [1, 2];
  while (positions.length < size) {
    const nextSize = positions.length * 2;
    positions = positions.flatMap((seed) => [seed, nextSize + 1 - seed]);
  }
  return positions.slice(0, size);
};

function straightKnockoutSlots(players: TournamentPlayer[]): KnockoutSlot[] {
  const size = nextPowerOfTwo(players.length);
  const byeCount = size - players.length;
  const slots: KnockoutSlot[] = [];
  let playerIndex = 0;

  for (let bye = 0; bye < byeCount; bye += 1) {
    slots.push({ playerId: players[playerIndex++].id, source: null }, { playerId: null, source: null });
  }

  while (playerIndex < players.length) {
    slots.push({ playerId: players[playerIndex++].id, source: null });
  }

  return slots;
}

function groupQualifierSlots(structure: TournamentStructure, qualifiers: number): KnockoutSlot[] {
  if (structure === "single-group") {
    return seedPositions(qualifiers).map((rank) => ({
      playerId: null,
      source: { kind: "group", groupId: "A", rank },
    }));
  }

  const slots: KnockoutSlot[] = [];
  for (let rank = 1; rank <= qualifiers; rank += 1) {
    slots.push(
      { playerId: null, source: { kind: "group", groupId: "A", rank } },
      { playerId: null, source: { kind: "group", groupId: "B", rank: qualifiers + 1 - rank } },
    );
  }
  return slots;
}

export function createTournament(input: CreateTournamentInput): Tournament {
  validateTournamentInput(input);
  const players = makePlayers(input.playerNames, input.config.structure);
  const matches: TournamentMatch[] = [];

  if (input.config.structure === "knockout") {
    matches.push(...knockoutMatches(straightKnockoutSlots(players), input.config.formats));
  } else {
    matches.push(...groupMatches(players, "A", input.config.formats.group));
    if (input.config.structure === "two-groups") {
      matches.push(...groupMatches(players, "B", input.config.formats.group));
    }
    const qualifierSlots = groupQualifierSlots(input.config.structure, input.config.qualifiersPerGroup);
    matches.push(...knockoutMatches(qualifierSlots, input.config.formats));
  }

  return resolveTournament({
    config: structuredClone(input.config),
    players,
    matches,
    status: "active",
    championId: null,
  });
}

export function standingsForGroup(tournament: Tournament, groupId: "A" | "B"): Standing[] {
  const players = tournament.players.filter((player) => player.groupId === groupId);
  const groupMatches = tournament.matches.filter((match) => match.groupId === groupId && match.status === "completed" && match.result);
  const byPlayer = new Map<string, Standing>(players.map((player) => [player.id, {
    rank: 0,
    playerId: player.id,
    played: 0,
    wins: 0,
    losses: 0,
    legsFor: 0,
    legsAgainst: 0,
    legDifference: 0,
    points: 0,
    darts: 0,
    average: null,
    completeStats: true,
    unresolvedTie: false,
  }]));

  for (const match of groupMatches) {
    const result = match.result!;
    const first = byPlayer.get(match.playerOneId!)!;
    const second = byPlayer.get(match.playerTwoId!)!;
    first.played += 1;
    second.played += 1;
    first.legsFor += result.playerOneLegs;
    first.legsAgainst += result.playerTwoLegs;
    second.legsFor += result.playerTwoLegs;
    second.legsAgainst += result.playerOneLegs;
    if (result.winnerId === first.playerId) {
      first.wins += 1;
      second.losses += 1;
    } else {
      second.wins += 1;
      first.losses += 1;
    }

    for (const standing of [first, second]) {
      const stats = result.playerStats?.[standing.playerId];
      if (stats) {
        standing.points += stats.points;
        standing.darts += stats.darts;
      } else if (result.source !== "bye") {
        standing.completeStats = false;
      }
    }
  }

  const standings = [...byPlayer.values()];
  standings.forEach((standing) => {
    standing.legDifference = standing.legsFor - standing.legsAgainst;
    standing.average = standing.completeStats && standing.darts > 0
      ? (standing.points / standing.darts) * 3
      : null;
  });
  standings.sort((a, b) => b.wins - a.wins || b.legDifference - a.legDifference);

  let clusterStart = 0;
  while (clusterStart < standings.length) {
    let clusterEnd = clusterStart + 1;
    while (
      clusterEnd < standings.length
      && standings[clusterEnd].wins === standings[clusterStart].wins
      && standings[clusterEnd].legDifference === standings[clusterStart].legDifference
    ) clusterEnd += 1;

    const cluster = standings.slice(clusterStart, clusterEnd);
    if (cluster.length === 2) {
      const headToHead = groupMatches.find((match) =>
        match.playerOneId && match.playerTwoId
        && new Set([match.playerOneId, match.playerTwoId]).size === 2
        && [cluster[0].playerId, cluster[1].playerId].includes(match.playerOneId)
        && [cluster[0].playerId, cluster[1].playerId].includes(match.playerTwoId));
      if (headToHead?.result?.winnerId === cluster[1].playerId) {
        standings.splice(clusterStart, 2, cluster[1], cluster[0]);
      } else if (!headToHead && cluster.every((standing) => standing.average !== null)) {
        cluster.sort((a, b) => b.average! - a.average!);
        standings.splice(clusterStart, cluster.length, ...cluster);
      }
    } else if (cluster.length > 2) {
      if (cluster.every((standing) => standing.average !== null)) {
        cluster.sort((a, b) => b.average! - a.average!);
        standings.splice(clusterStart, cluster.length, ...cluster);
      } else {
        cluster.forEach((standing) => { standing.unresolvedTie = true; });
      }
    }
    clusterStart = clusterEnd;
  }

  standings.forEach((standing, index) => { standing.rank = index + 1; });
  return standings;
}

const groupIsComplete = (tournament: Tournament, groupId: "A" | "B") => {
  const matches = tournament.matches.filter((match) => match.groupId === groupId);
  return matches.length > 0 && matches.every((match) => match.status === "completed");
};

const resolveSource = (tournament: Tournament, source: MatchSource | null): string | null => {
  if (!source) return null;
  if (source.kind === "match") {
    return tournament.matches.find((match) => match.id === source.matchId)?.result?.winnerId ?? null;
  }
  if (!source.groupId || !source.rank || !groupIsComplete(tournament, source.groupId)) return null;
  const standings = standingsForGroup(tournament, source.groupId);
  const qualified = standings[source.rank - 1];
  return qualified && !qualified.unresolvedTie ? qualified.playerId : null;
};

function resolveTournament(tournament: Tournament): Tournament {
  let next = structuredClone(tournament);
  let changed = true;

  while (changed) {
    changed = false;
    next.matches = next.matches.map((match) => {
      if (match.status === "completed" || match.status === "bye") return match;
      const playerOneId = match.playerOneId ?? resolveSource(next, match.sourceOne);
      const playerTwoId = match.playerTwoId ?? resolveSource(next, match.sourceTwo);
      const status: TournamentMatchStatus = playerOneId && playerTwoId ? "unplayed" : "waiting";
      if (playerOneId !== match.playerOneId || playerTwoId !== match.playerTwoId || status !== match.status) {
        changed = true;
        return { ...match, playerOneId, playerTwoId, status };
      }
      return match;
    });
  }

  const final = next.matches.find((match) => match.stageLabel === "Final" && match.stage === "knockout");
  if (final?.status === "completed" && final.result) {
    next.status = "completed";
    next.championId = final.result.winnerId;
  }
  return next;
}

export function completeTournamentMatch(
  tournament: Tournament,
  matchId: string,
  result: TournamentMatchResult,
): Tournament {
  const match = tournament.matches.find((item) => item.id === matchId);
  if (!match) throw new Error("Match not found.");
  if (match.status !== "unplayed" || !match.playerOneId || !match.playerTwoId) {
    throw new Error("Only an unplayed match with two players can be completed.");
  }
  if (![match.playerOneId, match.playerTwoId].includes(result.winnerId)) {
    throw new Error("Winner must be one of the players in the match.");
  }

  const target = legsNeededToWin(match.bestOf);
  const winnerLegs = result.winnerId === match.playerOneId ? result.playerOneLegs : result.playerTwoLegs;
  const loserLegs = result.winnerId === match.playerOneId ? result.playerTwoLegs : result.playerOneLegs;
  if (winnerLegs !== target || loserLegs < 0 || loserLegs >= target) {
    throw new Error(`Result must show the winner reaching ${target} legs.`);
  }

  return resolveTournament({
    ...tournament,
    matches: tournament.matches.map((item) => item.id === matchId
      ? { ...item, status: "completed", result: structuredClone(result) }
      : item),
  });
}

const dependsOnMatch = (tournament: Tournament, candidate: TournamentMatch, matchId: string): boolean => {
  const directSources = [candidate.sourceOne, candidate.sourceTwo]
    .filter((source): source is MatchSource => Boolean(source));
  if (directSources.some((source) => source.kind === "match" && source.matchId === matchId)) return true;
  return directSources.some((source) => source.kind === "match" && source.matchId
    ? dependsOnMatch(tournament, tournament.matches.find((match) => match.id === source.matchId)!, matchId)
    : false);
};

export function replaceTournamentMatchResult(
  tournament: Tournament,
  matchId: string,
  result: TournamentMatchResult,
): Tournament {
  const target = tournament.matches.find((match) => match.id === matchId);
  if (!target || target.status !== "completed") throw new Error("Only a completed match result can be replaced.");

  const completedKnockout = tournament.matches.some((match) => match.stage === "knockout" && match.status === "completed");
  const completedDescendant = target.stage === "group"
    ? completedKnockout
    : tournament.matches.some((match) => match.status === "completed" && dependsOnMatch(tournament, match, matchId));
  if (completedDescendant) throw new Error("A later completed match depends on this result.");

  const retained = tournament.matches
    .filter((match) => match.status === "completed" && match.id !== matchId && match.result)
    .map((match) => ({ matchId: match.id, result: structuredClone(match.result!) }));
  let rebuilt: Tournament = {
    ...tournament,
    status: "active",
    championId: null,
    matches: tournament.matches.map((match) => {
      if (match.status === "bye") return match;
      const playerOneId = match.sourceOne ? null : match.playerOneId;
      const playerTwoId = match.sourceTwo ? null : match.playerTwoId;
      return {
        ...match,
        playerOneId,
        playerTwoId,
        status: playerOneId && playerTwoId ? "unplayed" : "waiting",
        result: null,
      };
    }),
  };

  const replay = [...retained, { matchId, result }].sort((a, b) => {
    const first = rebuilt.matches.find((match) => match.id === a.matchId)!;
    const second = rebuilt.matches.find((match) => match.id === b.matchId)!;
    return Number(first.stage === "knockout") - Number(second.stage === "knockout") || first.round - second.round;
  });
  replay.forEach((saved) => { rebuilt = completeTournamentMatch(rebuilt, saved.matchId, saved.result); });
  return rebuilt;
}
