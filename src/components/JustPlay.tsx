import { useState } from "react";
import type { CheckIn } from "../domain/x01";
import type { PlaySessionSummary } from "../services/tournamentApi";
import { formatDateTimeForDisplay } from "../utils/compat";

export interface JustPlayDraft {
  players: readonly [string, string];
  startingScore: number;
  customScore: string;
  checkIn: CheckIn;
}

export const defaultJustPlayDraft: JustPlayDraft = {
  players: ["", ""], startingScore: 501, customScore: "701", checkIn: "straight",
};

export function JustPlaySetup({ initial = defaultJustPlayDraft, onCancel, onContinue }: { initial?: JustPlayDraft; onCancel: () => void; onContinue: (draft: JustPlayDraft) => void }) {
  const [draft, setDraft] = useState(initial);
  const score = draft.startingScore || Number(draft.customScore);
  const valid = draft.players.every((name) => name.trim()) && draft.players[0].trim().toLowerCase() !== draft.players[1].trim().toLowerCase() && score >= 2;
  const name = (index: 0 | 1, value: string) => setDraft({ ...draft, players: index === 0 ? [value, draft.players[1]] : [draft.players[0], value] });
  return <main className="form-screen"><header className="app-topbar"><button type="button" onClick={onCancel}>← Home</button><div className="brand-lockup"><span className="brand-target" aria-hidden="true"><i /></span><span><small>DARTY</small><strong>PARTY</strong></span></div><span /></header><section className="form-card just-play-card"><p className="eyebrow">Just play</p><h1>Start a session</h1><p>Play as many legs as you like. The session keeps running until you exit.</p><div className="name-grid"><label><span>Player one</span><input autoFocus value={draft.players[0]} onChange={(event) => name(0, event.target.value)} placeholder="First player" /></label><b>V</b><label><span>Player two</span><input value={draft.players[1]} onChange={(event) => name(1, event.target.value)} placeholder="Second player" /></label></div><fieldset><legend>Game</legend><div className="segmented four-up">{[170, 301, 501].map((value) => <button type="button" key={value} className={draft.startingScore === value ? "selected" : ""} onClick={() => setDraft({ ...draft, startingScore: value })}>{value}</button>)}<button type="button" className={draft.startingScore === 0 ? "selected" : ""} onClick={() => setDraft({ ...draft, startingScore: 0 })}>Custom</button></div>{draft.startingScore === 0 && <input className="custom-score" inputMode="numeric" value={draft.customScore} onChange={(event) => setDraft({ ...draft, customScore: event.target.value.replace(/\D/g, "") })} />}</fieldset><fieldset><legend>Check in</legend><div className="segmented"><button type="button" className={draft.checkIn === "straight" ? "selected" : ""} onClick={() => setDraft({ ...draft, checkIn: "straight" })}>Straight in</button><button type="button" className={draft.checkIn === "double" ? "selected" : ""} onClick={() => setDraft({ ...draft, checkIn: "double" })}>Double in</button></div></fieldset><button className="primary-button" type="button" disabled={!valid} onClick={() => onContinue({ ...draft, players: [draft.players[0].trim(), draft.players[1].trim()], startingScore: score })}>Throw for bull <span>→</span></button></section></main>;
}

const matchDate = (startedAt: string) => formatDateTimeForDisplay(startedAt);

export function SingleMatchList({ matches, all = false, onOpen, onBack }: { matches: PlaySessionSummary[]; all?: boolean; onOpen: (id: string) => void; onBack?: () => void }) {
  const content = matches.length ? matches.map((match) => <button className="tournament-link single-match-link" type="button" key={match.id} onClick={() => onOpen(match.id)}><span><strong>{match.players[0]} <i>v</i> {match.players[1]}</strong><small>{matchDate(match.startedAt)} · {match.startingScore} · {match.completedLegs} completed {match.completedLegs === 1 ? "leg" : "legs"}{match.endedAt ? "" : " · Resume"}</small></span><b>{match.legsWon[0]}–{match.legsWon[1]}</b><i>→</i></button>) : <p className="empty-list">Saved Just Play sessions will live here permanently.</p>;
  if (!all) return <>{content}</>;
  return <main className="tournament-screen"><header className="app-topbar"><button type="button" onClick={onBack}>← Home</button><div className="brand-lockup"><span className="brand-target" aria-hidden="true"><i /></span><span><small>DARTY</small><strong>PARTY</strong></span></div><span /></header><section className="history-hero"><p className="eyebrow">Just play</p><h1>Past sessions</h1><p>{matches.length} saved {matches.length === 1 ? "session" : "sessions"}</p></section><section className="history-list">{content}</section></main>;
}
