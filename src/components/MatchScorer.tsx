import { useEffect, useMemo, useRef, useState } from "react";
import { checkoutRoute } from "../domain/checkouts";
import { cueForVisit, englishScoreVoices, playScoreCue, stopScoreAudio, voiceKey } from "../services/scoreAudio";
import {
  createMatch,
  currentLeg,
  editCurrentLegVisit,
  getPlayerMatchStats,
  MatchRuleError,
  previewVisit,
  submitVisit,
  type MatchConfig,
  type MatchState,
  type PlayerIndex,
  type Visit,
} from "../domain/x01";

interface MatchScorerProps {
  players: readonly [string, string];
  config: MatchConfig;
  onExit: () => void;
  onSave: (match: MatchState) => Promise<void>;
}

interface PendingCheckout {
  type: "checkout";
  score: number;
  doubleInHit: boolean;
}

interface PendingDoubleIn {
  type: "double-in";
  score: number;
}

type PendingAction = PendingCheckout | PendingDoubleIn | null;

const SOUND_PREFERENCE_KEY = "dartyPartySoundEnabled";
const VOICE_PREFERENCE_KEY = "dartyPartyScoreVoice";

const initialSoundPreference = () => {
  try {
    return window.localStorage.getItem(SOUND_PREFERENCE_KEY) !== "false";
  } catch {
    return true;
  }
};

const initialVoicePreference = () => {
  try {
    return window.localStorage.getItem(VOICE_PREFERENCE_KEY) ?? "";
  } catch {
    return "";
  }
};

interface VisitRow {
  playerOne?: Visit;
  playerTwo?: Visit;
}

const rowsForLeg = (visits: Visit[]): VisitRow[] => {
  const rows: VisitRow[] = [];

  visits.forEach((visit, index) => {
    const rowIndex = Math.floor(index / 2);
    const row = rows[rowIndex] ?? {};
    if (visit.player === 0) row.playerOne = visit;
    else row.playerTwo = visit;
    rows[rowIndex] = row;
  });

  return rows;
};

const scoreLabel = (visit?: Visit) => {
  if (!visit) return "";
  if (visit.bust) return "BUST";
  return String(visit.enteredScore);
};

export function MatchScorer({ players, config, onExit, onSave }: MatchScorerProps) {
  const [match, setMatch] = useState(() => createMatch(players, config));
  const [past, setPast] = useState<MatchState[]>([]);
  const [entry, setEntry] = useState("");
  const [selectedVisitId, setSelectedVisitId] = useState<string | null>(null);
  const [pending, setPending] = useState<PendingAction>(null);
  const [notice, setNotice] = useState("");
  const [saveError, setSaveError] = useState("");
  const [saving, setSaving] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(initialSoundPreference);
  const [selectedVoiceKey, setSelectedVoiceKey] = useState(initialVoicePreference);
  const [availableVoices, setAvailableVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [voiceSettingsOpen, setVoiceSettingsOpen] = useState(false);
  const historyEndRef = useRef<HTMLDivElement>(null);

  const leg = currentLeg(match);
  const rows = useMemo(() => rowsForLeg(leg.visits), [leg.visits]);
  const activeRoute = useMemo(
    () => checkoutRoute(match.remaining[match.currentPlayer]),
    [match.currentPlayer, match.remaining],
  );

  useEffect(() => {
    historyEndRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [leg.visits.length]);

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(""), 1800);
    return () => window.clearTimeout(timer);
  }, [notice]);

  useEffect(() => {
    if (!("speechSynthesis" in window)) return;
    const speech = window.speechSynthesis;
    const refreshVoices = () => setAvailableVoices(englishScoreVoices());
    refreshVoices();
    speech.addEventListener("voiceschanged", refreshVoices);
    return () => speech.removeEventListener("voiceschanged", refreshVoices);
  }, []);

  const rememberAndSet = (next: MatchState) => {
    setPast((history) => [...history, match]);
    setMatch(next);
    setEntry("");
    setSelectedVisitId(null);
    setPending(null);
  };

  const reportError = (error: unknown) => {
    setNotice(error instanceof Error ? error.message : "That score could not be entered.");
  };

  const appendDigit = (digit: string) => {
    if (pending || match.completed) return;
    setEntry((current) => {
      const next = `${current}${digit}`.replace(/^0+(?=\d)/, "").slice(0, 3);
      return Number(next || 0) <= 180 ? next : current;
    });
  };

  const clearDigits = () => {
    setEntry("");
    if (pending) setPending(null);
  };

  const cancelEditing = () => {
    setEntry("");
    setSelectedVisitId(null);
    setPending(null);
  };

  const backspace = () => {
    if (pending || match.completed) return;
    setEntry((current) => current.slice(0, -1));
  };

  const commitVisit = (score: number, doubleInHit = false, checkoutDarts?: 1 | 2 | 3) => {
    try {
      const beforeLeg = currentLeg(match).number;
      const scoringPlayer = match.currentPlayer;
      const next = submitVisit(match, { score, doubleInHit, checkoutDarts });
      const completedLeg = next.legs.find((item) => item.number === beforeLeg);
      const submittedVisit = completedLeg?.visits[completedLeg.visits.length - 1];
      rememberAndSet(next);

      if (soundEnabled && submittedVisit) {
        playScoreCue(cueForVisit(score, submittedVisit.bust, Boolean(checkoutDarts)), selectedVoiceKey);
      }

      if (next.completed) {
        setNotice(`${players[scoringPlayer]} wins the match`);
      } else if (currentLeg(next).number !== beforeLeg) {
        setNotice(`${players[scoringPlayer]} wins leg ${beforeLeg}`);
      } else if (currentLeg(next).visits[currentLeg(next).visits.length - 1]?.bust) {
        setNotice("Bust — score restored");
      }
    } catch (error) {
      reportError(error);
    }
  };

  const enterScore = () => {
    if (pending || match.completed || entry === "") return;
    const score = Number(entry);

    if (selectedVisitId) {
      try {
        rememberAndSet(editCurrentLegVisit(match, selectedVisitId, score));
        setNotice("Visit updated");
      } catch (error) {
        reportError(error);
      }
      return;
    }

    try {
      const preview = previewVisit(match, score);
      if (preview.kind === "double-in-required") {
        if (score === 0) commitVisit(0);
        else setPending({ type: "double-in", score });
      } else if (preview.kind === "checkout") {
        setPending({ type: "checkout", score, doubleInHit: false });
      } else {
        commitVisit(score);
      }
    } catch (error) {
      reportError(error);
    }
  };

  const confirmDoubleIn = () => {
    if (pending?.type !== "double-in") return;
    try {
      const preview = previewVisit(match, pending.score, true);
      if (preview.kind === "checkout") {
        setPending({ type: "checkout", score: pending.score, doubleInHit: true });
      } else {
        commitVisit(pending.score, true);
      }
    } catch (error) {
      reportError(error);
    }
  };

  const noDoubleIn = () => {
    if (pending?.type !== "double-in") return;
    commitVisit(0);
  };

  const undo = () => {
    const previous = past[past.length - 1];
    if (!previous) return;
    setMatch(previous);
    setPast((history) => history.slice(0, -1));
    setEntry("");
    setSelectedVisitId(null);
    setPending(null);
    setNotice("Last action undone");
  };

  const toggleSound = () => {
    const next = !soundEnabled;
    setSoundEnabled(next);
    try { window.localStorage.setItem(SOUND_PREFERENCE_KEY, String(next)); } catch { /* Preference remains active for this visit. */ }
    if (next) playScoreCue({ text: "Sound on", rate: 0.92, pitch: 0.9 }, selectedVoiceKey);
    else stopScoreAudio();
  };

  const selectVoice = (key: string) => {
    setSelectedVoiceKey(key);
    try { window.localStorage.setItem(VOICE_PREFERENCE_KEY, key); } catch { /* Preference remains active for this visit. */ }
  };

  const testVoice = () => {
    if (!soundEnabled) {
      setSoundEnabled(true);
      try { window.localStorage.setItem(SOUND_PREFERENCE_KEY, "true"); } catch { /* Preference remains active for this visit. */ }
    }
    playScoreCue(cueForVisit(85, false, false), selectedVoiceKey);
  };

  const selectVisit = (visit?: Visit) => {
    if (!visit || match.completed || pending) return;
    if (selectedVisitId === visit.id) {
      cancelEditing();
      return;
    }
    setSelectedVisitId(visit.id);
    setEntry(String(visit.enteredScore));
  };

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (/^\d$/.test(event.key)) appendDigit(event.key);
      else if (event.key === "Backspace") backspace();
      else if (event.key === "Escape") cancelEditing();
      else if (event.key === "Enter" && !event.repeat) enterScore();
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  });

  const leaveMatch = () => {
    const hasScoring = match.legs.some((item) => item.visits.length > 0);
    if (!hasScoring || window.confirm("Leave this match? Unsaved scoring will be lost.")) {
      onExit();
    }
  };

  const saveResult = async () => {
    setSaveError("");
    setSaving(true);
    try {
      await onSave(match);
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : "The result could not be saved.");
      setSaving(false);
    }
  };

  if (match.completed && match.winner !== null) {
    const winner = match.winner;
    const loser: PlayerIndex = winner === 0 ? 1 : 0;
    const winnerStats = getPlayerMatchStats(match, winner);
    const loserStats = getPlayerMatchStats(match, loser);

    return (
      <main className="complete-screen">
        <section className="complete-card">
          <div className="complete-kicker">Match complete</div>
          <h1>{players[winner]} wins</h1>
          <div className="complete-score">
            <span>{players[winner]}</span>
            <strong>{match.legsWon[winner]}–{match.legsWon[loser]}</strong>
            <span>{players[loser]}</span>
          </div>
          <div className="result-summary">
            <div><span>3-dart average</span><strong>{winnerStats.threeDartAverage.toFixed(2)}</strong><strong>{loserStats.threeDartAverage.toFixed(2)}</strong></div>
            <div><span>Highest visit</span><strong>{winnerStats.highestVisit}</strong><strong>{loserStats.highestVisit}</strong></div>
            <div><span>Darts recorded</span><strong>{winnerStats.darts}</strong><strong>{loserStats.darts}</strong></div>
          </div>
          <div className="complete-actions">
            <button className="secondary-button" type="button" disabled={saving} onClick={undo}>Undo checkout</button>
            <button className="primary-button" type="button" disabled={saving} onClick={saveResult}>{saving ? "Saving…" : "Save result"}</button>
          </div>
          {saveError && <p className="form-error" role="alert">{saveError}</p>}
          <p className="prototype-note">The result is committed to Darty Party when you press Save result.</p>
        </section>
      </main>
    );
  }

  return (
    <main className="scorer-shell">
      <header className="match-bar">
        <button type="button" onClick={leaveMatch}>← Exit</button>
        <div>
          <span>DARTY PARTY</span>
          <strong>{config.startingScore} · Best of {config.bestOf}</strong>
        </div>
        <span>Leg {leg.number}</span>
      </header>

      <section className="score-header" aria-label="Current scores">
        {[0, 1].map((value) => {
          const player = value as PlayerIndex;
          const active = player === match.currentPlayer;
          return (
            <article className={`player-score ${active ? "active" : ""}`} key={player}>
              <div className="player-line">
                <span>{active ? "TO THROW" : `LEGS ${match.legsWon[player]}`}</span>
                <strong>{players[player]}</strong>
                <b>{match.legsWon[player]}</b>
              </div>
              <div className="remaining-score">
                {!match.opened[player] && <small>NOT IN</small>}
                <strong>{match.remaining[player]}</strong>
              </div>
            </article>
          );
        })}
        <div className="checkout-strip">
          {activeRoute ? (
            <><span>Possible checkout</span><strong>{activeRoute.join(" · ")}</strong></>
          ) : (
            <><span>Current leg</span><strong>{players[match.currentPlayer]} to throw</strong></>
          )}
        </div>
      </section>

      <section className="visit-panel" aria-label={`Leg ${leg.number} visit history`}>
        <div className="visit-head">
          <span>SCORED</span><span>TO GO</span><i>VISIT</i><span>SCORED</span><span>TO GO</span>
        </div>
        <div className="visit-scroll">
          {rows.length === 0 && (
            <div className="empty-visits">
              <strong>Game on</strong>
              <span>Enter the first three-dart visit below.</span>
            </div>
          )}
          {rows.map((row, index) => (
            <div className="visit-row" key={`${leg.number}-${index}`}>
              <button
                className={`${row.playerOne?.bust ? "bust" : ""} ${selectedVisitId === row.playerOne?.id ? "editing" : ""}`}
                type="button"
                disabled={!row.playerOne}
                onClick={() => selectVisit(row.playerOne)}
              >
                {scoreLabel(row.playerOne)}
              </button>
              <strong>{row.playerOne?.remainingAfter ?? ""}</strong>
              <i>{index + 1}</i>
              <button
                className={`${row.playerTwo?.bust ? "bust" : ""} ${selectedVisitId === row.playerTwo?.id ? "editing" : ""}`}
                type="button"
                disabled={!row.playerTwo}
                onClick={() => selectVisit(row.playerTwo)}
              >
                {scoreLabel(row.playerTwo)}
              </button>
              <strong>{row.playerTwo?.remainingAfter ?? ""}</strong>
            </div>
          ))}
          <div ref={historyEndRef} />
        </div>
      </section>

      <section className="keypad-panel" aria-label="Score keypad">
        {notice && <div className="toast" role="status">{notice}</div>}

        {voiceSettingsOpen && (
          <div className="voice-settings" role="dialog" aria-label="Score voice settings">
            <div className="voice-settings-head">
              <div><span>Score voice</span><strong>Choose and test this device’s voice</strong></div>
              <button type="button" aria-label="Close voice settings" onClick={() => setVoiceSettingsOpen(false)}>×</button>
            </div>
            <label>
              <span>English voice</span>
              <select value={selectedVoiceKey} onChange={(event) => selectVoice(event.target.value)}>
                <option value="">Automatic</option>
                {availableVoices.map((voice) => (
                  <option key={voiceKey(voice)} value={voiceKey(voice)}>{voice.name} · {voice.lang}</option>
                ))}
              </select>
            </label>
            <div className="voice-settings-actions">
              <button type="button" onClick={toggleSound}>{soundEnabled ? "Mute sound" : "Turn sound on"}</button>
              <button className="confirm" type="button" onClick={testVoice}>Test voice</button>
            </div>
          </div>
        )}

        {pending?.type === "double-in" && (
          <div className="decision-bar">
            <div><span>{players[match.currentPlayer]} is not in</span><strong>Did this {pending.score || 0} visit include a double?</strong></div>
            <button type="button" onClick={noDoubleIn}>No double · score 0</button>
            <button className="confirm" type="button" onClick={confirmDoubleIn}>Double hit · count {pending.score}</button>
          </div>
        )}

        {pending?.type === "checkout" && (
          <div className="decision-bar checkout-decision">
            <div><span>Checkout {pending.score}</span><strong>How many darts?</strong></div>
            <button type="button" onClick={() => commitVisit(pending.score, pending.doubleInHit)}>Bust</button>
            {[1, 2, 3].map((darts) => (
              <button
                className="confirm"
                key={darts}
                type="button"
                onClick={() => commitVisit(pending.score, pending.doubleInHit, darts as 1 | 2 | 3)}
              >
                {darts}
              </button>
            ))}
          </div>
        )}

        <div className={`entry-display ${selectedVisitId ? "editing" : ""}`}>
          <span>{selectedVisitId ? "EDIT VISIT" : `${players[match.currentPlayer]} SCORED`}</span>
          <strong>{entry || "—"}</strong>
        </div>

        <div className="keypad-grid">
          {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((digit) => (
            <button key={digit} type="button" onClick={() => appendDigit(String(digit))}>{digit}</button>
          ))}
          <button className="utility" type="button" onClick={backspace} aria-label="Backspace">⌫</button>
          <button type="button" onClick={() => appendDigit("0")}>0</button>
          <button className="enter" type="button" onClick={enterScore}>ENTER</button>
        </div>

        <div className="keypad-tools">
          <button type="button" onClick={clearDigits}>Clear</button>
          <button type="button" disabled={!past.length} onClick={undo}>↶ Undo</button>
          <button type="button" aria-expanded={voiceSettingsOpen} onClick={() => setVoiceSettingsOpen(true)}>{soundEnabled ? "🔊 Voice" : "🔇 Voice"}</button>
        </div>
      </section>
    </main>
  );
}
