export type PlayerIndex = 0 | 1;
export type CheckIn = "straight" | "double";

export interface MatchConfig {
  startingScore: number;
  bestOf: number;
  checkIn: CheckIn;
  startingPlayer: PlayerIndex;
  openEnded?: boolean;
}

export interface VisitInput {
  score: number;
  doubleInHit?: boolean;
  checkoutDarts?: 1 | 2 | 3;
}

export interface Visit {
  id: string;
  legNumber: number;
  ordinal: number;
  player: PlayerIndex;
  enteredScore: number;
  countedScore: number;
  remainingBefore: number;
  remainingAfter: number;
  dartsUsed: 1 | 2 | 3;
  bust: boolean;
  doubleInHit: boolean;
  checkout: boolean;
}

export interface Leg {
  number: number;
  starter: PlayerIndex;
  winner: PlayerIndex | null;
  visits: Visit[];
}

export interface MatchState {
  config: MatchConfig;
  players: readonly [string, string];
  legs: Leg[];
  currentLegIndex: number;
  currentPlayer: PlayerIndex;
  remaining: readonly [number, number];
  opened: readonly [boolean, boolean];
  legsWon: readonly [number, number];
  winner: PlayerIndex | null;
  completed: boolean;
}

export interface PlayerMatchStats {
  points: number;
  darts: number;
  threeDartAverage: number;
  highestVisit: number;
  oneEighties: number;
}

export interface VisitPreview {
  kind: "score" | "bust" | "checkout" | "double-in-required";
  remainingAfter: number;
}

export class MatchRuleError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MatchRuleError";
  }
}

const otherPlayer = (player: PlayerIndex): PlayerIndex => (player === 0 ? 1 : 0);

const asPlayerIndex = (value: number): PlayerIndex => (value === 0 ? 0 : 1);

const validateConfig = (config: MatchConfig) => {
  if (!Number.isInteger(config.startingScore) || config.startingScore < 2) {
    throw new MatchRuleError("Starting score must be an integer of at least 2.");
  }

  if (!Number.isInteger(config.bestOf) || config.bestOf < 1 || config.bestOf % 2 === 0) {
    throw new MatchRuleError("Best of must be a positive odd number of legs.");
  }
};

const validateVisitScore = (score: number) => {
  if (!Number.isInteger(score) || score < 0 || score > 180) {
    throw new MatchRuleError("Visit score must be a whole number from 0 to 180.");
  }
};

const freshOpened = (checkIn: CheckIn): readonly [boolean, boolean] =>
  checkIn === "straight" ? [true, true] : [false, false];

const createLeg = (number: number, starter: PlayerIndex): Leg => ({
  number,
  starter,
  winner: null,
  visits: [],
});

export const legsNeededToWin = (bestOf: number) => Math.floor(bestOf / 2) + 1;

export function createMatch(
  players: readonly [string, string],
  config: MatchConfig,
): MatchState {
  validateConfig(config);

  if (!players[0].trim() || !players[1].trim()) {
    throw new MatchRuleError("Both players need a name.");
  }

  if (players[0].trim().toLocaleLowerCase() === players[1].trim().toLocaleLowerCase()) {
    throw new MatchRuleError("Players must have different names.");
  }

  return {
    config: { ...config },
    players: [players[0].trim(), players[1].trim()],
    legs: [createLeg(1, config.startingPlayer)],
    currentLegIndex: 0,
    currentPlayer: config.startingPlayer,
    remaining: [config.startingScore, config.startingScore],
    opened: freshOpened(config.checkIn),
    legsWon: [0, 0],
    winner: null,
    completed: false,
  };
}

export function previewVisit(
  state: MatchState,
  score: number,
  doubleInHit = false,
): VisitPreview {
  validateVisitScore(score);

  if (state.completed) {
    throw new MatchRuleError("This match is already complete.");
  }

  const player = state.currentPlayer;
  const isOpen = state.opened[player];

  if (!isOpen && !doubleInHit) {
    return { kind: "double-in-required", remainingAfter: state.remaining[player] };
  }

  if (!isOpen && doubleInHit && score < 2) {
    throw new MatchRuleError("A double-in visit must score at least 2.");
  }

  const remainingAfter = state.remaining[player] - score;

  if (remainingAfter < 0 || remainingAfter === 1) {
    return { kind: "bust", remainingAfter: state.remaining[player] };
  }

  if (remainingAfter === 0) {
    return { kind: "checkout", remainingAfter: 0 };
  }

  return { kind: "score", remainingAfter };
}

let generatedVisitId = 0;

const nextVisitId = () => {
  generatedVisitId += 1;
  return `visit_${generatedVisitId}`;
};

function applyVisit(state: MatchState, input: VisitInput, visitId: string): MatchState {
  validateVisitScore(input.score);

  if (state.completed) {
    throw new MatchRuleError("This match is already complete.");
  }

  const player = state.currentPlayer;
  const leg = state.legs[state.currentLegIndex];
  const remainingBefore = state.remaining[player];
  const wasOpen = state.opened[player];

  if (!wasOpen && input.doubleInHit && input.score < 2) {
    throw new MatchRuleError("A double-in visit must score at least 2.");
  }

  const opensThisVisit = wasOpen || Boolean(input.doubleInHit);
  const attemptedRemaining = opensThisVisit
    ? remainingBefore - input.score
    : remainingBefore;
  const exactZero = opensThisVisit && attemptedRemaining === 0;

  if (input.checkoutDarts && !exactZero) {
    throw new MatchRuleError("Checkout darts can only be recorded when the score reaches zero.");
  }

  const bust = opensThisVisit && (
    attemptedRemaining < 0
    || attemptedRemaining === 1
    || (attemptedRemaining === 0 && !input.checkoutDarts)
  );
  const checkout = exactZero && Boolean(input.checkoutDarts);
  const countedScore = opensThisVisit && !bust ? input.score : 0;
  const remainingAfter = checkout
    ? 0
    : bust || !opensThisVisit
      ? remainingBefore
      : attemptedRemaining;
  const visit: Visit = {
    id: visitId,
    legNumber: leg.number,
    ordinal: leg.visits.length + 1,
    player,
    enteredScore: input.score,
    countedScore,
    remainingBefore,
    remainingAfter,
    dartsUsed: input.checkoutDarts ?? 3,
    bust,
    doubleInHit: Boolean(input.doubleInHit),
    checkout,
  };

  const legs = state.legs.map((item, index) =>
    index === state.currentLegIndex
      ? { ...item, visits: [...item.visits, visit], winner: checkout ? player : null }
      : item,
  );
  const opened: readonly [boolean, boolean] = player === 0
    ? [opensThisVisit, state.opened[1]]
    : [state.opened[0], opensThisVisit];
  const remaining: readonly [number, number] = player === 0
    ? [remainingAfter, state.remaining[1]]
    : [state.remaining[0], remainingAfter];

  if (!checkout) {
    return {
      ...state,
      legs,
      opened,
      remaining,
      currentPlayer: otherPlayer(player),
    };
  }

  const legsWon: readonly [number, number] = player === 0
    ? [state.legsWon[0] + 1, state.legsWon[1]]
    : [state.legsWon[0], state.legsWon[1] + 1];
  const matchWon = !state.config.openEnded
    && legsWon[player] >= legsNeededToWin(state.config.bestOf);

  if (matchWon) {
    return {
      ...state,
      legs,
      opened,
      remaining,
      legsWon,
      winner: player,
      completed: true,
    };
  }

  const nextLegNumber = leg.number + 1;
  const nextStarter = asPlayerIndex(
    (state.config.startingPlayer + nextLegNumber - 1) % 2,
  );

  return {
    ...state,
    legs: [...legs, createLeg(nextLegNumber, nextStarter)],
    currentLegIndex: state.currentLegIndex + 1,
    currentPlayer: nextStarter,
    remaining: [state.config.startingScore, state.config.startingScore],
    opened: freshOpened(state.config.checkIn),
    legsWon,
  };
}

export function submitVisit(state: MatchState, input: VisitInput): MatchState {
  return applyVisit(state, input, nextVisitId());
}

export function editCurrentLegVisit(
  state: MatchState,
  visitId: string,
  score: number,
): MatchState {
  validateVisitScore(score);

  if (state.completed) {
    throw new MatchRuleError("Completed matches are edited from the result screen.");
  }

  const currentLeg = state.legs[state.currentLegIndex];
  if (!currentLeg.visits.some((visit) => visit.id === visitId)) {
    throw new MatchRuleError("Only visits in the current leg can be edited.");
  }

  const completedLegs = state.legs.slice(0, state.currentLegIndex);
  const replayBase: MatchState = {
    ...state,
    legs: [...completedLegs, createLeg(currentLeg.number, currentLeg.starter)],
    currentPlayer: currentLeg.starter,
    remaining: [state.config.startingScore, state.config.startingScore],
    opened: freshOpened(state.config.checkIn),
    winner: null,
    completed: false,
  };

  return currentLeg.visits.reduce((replayed, visit) => {
    if (replayed.completed || replayed.currentLegIndex !== state.currentLegIndex) {
      throw new MatchRuleError("This edit would finish the leg. Undo later visits first.");
    }

    return applyVisit(
      replayed,
      {
        score: visit.id === visitId ? score : visit.enteredScore,
        doubleInHit: visit.doubleInHit,
        checkoutDarts: visit.checkout ? visit.dartsUsed : undefined,
      },
      visit.id,
    );
  }, replayBase);
}

export function getPlayerMatchStats(
  state: MatchState,
  player: PlayerIndex,
): PlayerMatchStats {
  const visits = state.legs.reduce<Visit[]>((allVisits, leg) => allVisits.concat(leg.visits), [])
    .filter((visit) => visit.player === player);
  const points = visits.reduce((total, visit) => total + visit.countedScore, 0);
  const darts = visits.reduce((total, visit) => total + visit.dartsUsed, 0);

  return {
    points,
    darts,
    threeDartAverage: darts ? (points / darts) * 3 : 0,
    highestVisit: visits.reduce((highest, visit) => Math.max(highest, visit.countedScore), 0),
    oneEighties: visits.filter((visit) => visit.countedScore === 180).length,
  };
}

export function currentLeg(state: MatchState): Leg {
  return state.legs[state.currentLegIndex];
}
