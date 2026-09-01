import { useEffect, useMemo, useState } from "react";
import { getPlayerMatchStats, type Leg, type MatchState, type PlayerIndex, type Visit } from "../domain/x01";

interface MatchResultsProps {
  match: MatchState;
  onBack: () => void;
  backLabel?: string;
  onRematch?: () => void;
}

interface ResultRow {
  playerOne?: Visit;
  playerTwo?: Visit;
}

const rowsForLeg = (leg: Leg): ResultRow[] => {
  const rows: ResultRow[] = [];
  leg.visits.forEach((visit, index) => {
    const rowIndex = Math.floor(index / 2);
    const row = rows[rowIndex] ?? {};
    if (visit.player === 0) row.playerOne = visit;
    else row.playerTwo = visit;
    rows[rowIndex] = row;
  });
  return rows;
};

const displayVisit = (visit?: Visit) => {
  if (!visit) return "—";
  if (visit.bust) return "BUST";
  return visit.enteredScore;
};

const countVisitsAtLeast = (match: MatchState, player: PlayerIndex, minimum: number) =>
  match.legs.reduce<Visit[]>((visits, leg) => visits.concat(leg.visits), [])
    .filter((visit) => visit.player === player && visit.countedScore >= minimum).length;

const bestLeg = (match: MatchState, player: PlayerIndex) => {
  const winningLegs = match.legs.filter((leg) => leg.winner === player);
  const dartCounts = winningLegs.map((leg) => leg.visits
    .filter((visit) => visit.player === player)
    .reduce((total, visit) => total + visit.dartsUsed, 0));
  return dartCounts.length ? Math.min(...dartCounts) : null;
};

export function MatchResults({ match, onBack, backLabel = "Back", onRematch }: MatchResultsProps) {
  const [expandedLegs, setExpandedLegs] = useState<Set<number>>(
    () => new Set(match.legs.length ? [match.legs[match.legs.length - 1].number] : []),
  );
  const [shareNotice, setShareNotice] = useState("");
  const winner = match.winner;
  const sessionMode = Boolean(match.config.openEnded);
  const stats = useMemo(
    () => [getPlayerMatchStats(match, 0), getPlayerMatchStats(match, 1)] as const,
    [match],
  );
  const bestLegs = useMemo(() => [bestLeg(match, 0), bestLeg(match, 1)] as const, [match]);

  const toggleLeg = (legNumber: number) => {
    setExpandedLegs((current) => {
      const next = new Set(current);
      if (next.has(legNumber)) next.delete(legNumber);
      else next.add(legNumber);
      return next;
    });
  };

  const expandAll = () => setExpandedLegs(new Set(match.legs.map((leg) => leg.number)));
  const collapseAll = () => setExpandedLegs(new Set());

  useEffect(() => {
    if (!shareNotice) return;
    const timer = window.setTimeout(() => setShareNotice(""), 2600);
    return () => window.clearTimeout(timer);
  }, [shareNotice]);

  const shareMatch = async () => {
    if (!sessionMode && winner === null) return;
    const text = sessionMode
      ? `${match.players[0]} ${match.legsWon[0]}–${match.legsWon[1]} ${match.players[1]} · Darty Party session`
      : (() => {
        const loser: PlayerIndex = winner === 0 ? 1 : 0;
        return `${match.players[winner!]} defeated ${match.players[loser]} ${match.legsWon[winner!]}–${match.legsWon[loser]} · Darty Party`;
      })();
    const shareData = { title: sessionMode ? "Darty Party session" : "Darty Party match result", text, url: window.location.href };

    try {
      if (navigator.share) await navigator.share(shareData);
      else {
        await navigator.clipboard.writeText(`${text}\n${window.location.href}`);
        setShareNotice("Result and link copied");
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      setShareNotice("Could not share this result");
    }
  };

  return (
    <main className="results-screen">
      <header className="results-topbar">
        <button type="button" onClick={onBack}>← {backLabel}</button>
        <div className="brand-lockup compact-result">
          <span className="brand-target" aria-hidden="true"><i /></span>
          <span><small>DARTY</small><strong>PARTY</strong></span>
        </div>
        <button type="button" onClick={shareMatch}>Share</button>
      </header>

      <section className="results-hero">
        <p className="eyebrow">{sessionMode ? "Session summary" : "Match result"}</p>
        <div className="result-player-grid">
          <div className={!sessionMode && winner === 0 ? "winner" : ""}>
            <span>{!sessionMode && winner === 0 ? "WINNER" : "PLAYER"}</span>
            <strong>{match.players[0]}</strong>
          </div>
          <b>{match.legsWon[0]}–{match.legsWon[1]}</b>
          <div className={!sessionMode && winner === 1 ? "winner" : ""}>
            <span>{!sessionMode && winner === 1 ? "WINNER" : "PLAYER"}</span>
            <strong>{match.players[1]}</strong>
          </div>
        </div>
        <p>{match.config.startingScore} · {match.config.checkIn === "double" ? "Double in" : "Straight in"}{sessionMode ? " · Open session" : ` · Best of ${match.config.bestOf}`}</p>
      </section>

      <section className="match-stat-table" aria-label="Match statistics">
        <div className="stat-head"><strong>{match.players[0]}</strong><span>Match</span><strong>{match.players[1]}</strong></div>
        <div><strong>{stats[0].threeDartAverage.toFixed(2)}</strong><span>3-dart average</span><strong>{stats[1].threeDartAverage.toFixed(2)}</strong></div>
        <div><strong>{stats[0].highestVisit}</strong><span>Highest visit</span><strong>{stats[1].highestVisit}</strong></div>
        <div><strong>{countVisitsAtLeast(match, 0, 100)}</strong><span>100+ visits</span><strong>{countVisitsAtLeast(match, 1, 100)}</strong></div>
        <div><strong>{countVisitsAtLeast(match, 0, 140)}</strong><span>140+ visits</span><strong>{countVisitsAtLeast(match, 1, 140)}</strong></div>
        <div><strong>{stats[0].oneEighties}</strong><span>180s</span><strong>{stats[1].oneEighties}</strong></div>
        <div><strong>{bestLegs[0] === null ? "—" : `${bestLegs[0]} darts`}</strong><span>Best leg</span><strong>{bestLegs[1] === null ? "—" : `${bestLegs[1]} darts`}</strong></div>
      </section>

      <section className="leg-results">
        <div className="leg-results-head">
          <div><p className="eyebrow">Visit history</p><h2>Every leg</h2></div>
          <div><button type="button" onClick={expandAll}>Expand all</button><button type="button" onClick={collapseAll}>Collapse</button></div>
        </div>

        {match.legs.map((leg) => {
          const expanded = expandedLegs.has(leg.number);
          const legWinner = leg.winner === null ? "Incomplete" : `${match.players[leg.winner]} won`;
          const winningDarts = leg.winner === null ? null : leg.visits
            .filter((visit) => visit.player === leg.winner)
            .reduce((total, visit) => total + visit.dartsUsed, 0);
          const rows = rowsForLeg(leg);

          return (
            <article className={`leg-result ${expanded ? "expanded" : ""}`} key={leg.number}>
              <button className="leg-toggle" type="button" onClick={() => toggleLeg(leg.number)} aria-expanded={expanded}>
                <span>{expanded ? "−" : "+"}</span>
                <div><strong>Leg {leg.number}</strong><small>{legWinner}{winningDarts ? ` in ${winningDarts} darts` : ""}</small></div>
                <b>{leg.starter === 0 ? match.players[0] : match.players[1]} started</b>
              </button>

              {expanded && (
                <div className="leg-table-wrap">
                  <div className="leg-table-head"><span>Scored</span><span>Left</span><i>Visit</i><span>Scored</span><span>Left</span></div>
                  {rows.map((row, index) => (
                    <div className="leg-table-row" key={index}>
                      <strong className={row.playerOne?.bust ? "bust" : ""}>{displayVisit(row.playerOne)}</strong>
                      <span>{row.playerOne?.remainingAfter ?? "—"}</span>
                      <i>{index + 1}</i>
                      <strong className={row.playerTwo?.bust ? "bust" : ""}>{displayVisit(row.playerTwo)}</strong>
                      <span>{row.playerTwo?.remainingAfter ?? "—"}</span>
                    </div>
                  ))}
                </div>
              )}
            </article>
          );
        })}
      </section>

      {onRematch && <section className="result-next-actions"><button className="primary-button" type="button" onClick={onRematch}>{sessionMode ? "New session" : "Rematch"}</button><button className="secondary-button" type="button" onClick={onBack}>Exit to home</button></section>}

      {shareNotice && <div className="result-share-notice" role="status">{shareNotice}</div>}
    </main>
  );
}
