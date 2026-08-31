import { useState } from "react";
import type { PlaySessionSummary, TrashData, TrashItemKind } from "../services/tournamentApi";

interface ManageTournament {
  id: string;
  name: string;
  status: "active" | "completed";
  date: string;
}

export function AdminPinDialog({ busy, error, onCancel, onUnlock }: { busy: boolean; error: string; onCancel: () => void; onUnlock: (pin: string) => void }) {
  const [pin, setPin] = useState("");
  return <div className="modal-backdrop"><section className="result-modal admin-pin-dialog"><p className="eyebrow">Organiser access</p><h2>Open Trash</h2><p>Enter the organiser PIN to manage saved data.</p><label><span>PIN</span><input autoFocus type="password" inputMode="numeric" maxLength={6} value={pin} onChange={(event) => setPin(event.target.value.replace(/\D/g, ""))} onKeyDown={(event) => { if (event.key === "Enter" && pin.length >= 4) onUnlock(pin); }} /></label>{error && <p className="form-error" role="alert">{error}</p>}<div className="modal-actions"><button type="button" disabled={busy} onClick={onCancel}>Cancel</button><button className="primary-button" type="button" disabled={busy || pin.length < 4} onClick={() => onUnlock(pin)}>{busy ? "Checking…" : "Unlock"}</button></div></section></div>;
}

export function TrashManager({ tournaments, matches, trash, busy, error, onBack, onTrash, onRestore, onPurge }: { tournaments: ManageTournament[]; matches: PlaySessionSummary[]; trash: TrashData; busy: boolean; error: string; onBack: () => void; onTrash: (kind: TrashItemKind, id: string) => void; onRestore: (kind: TrashItemKind, id: string) => void; onPurge: (kind: TrashItemKind, id: string) => void }) {
  const [confirming, setConfirming] = useState<{ kind: TrashItemKind; id: string; name: string } | null>(null);
  const [confirmation, setConfirmation] = useState("");
  const currentRows = [
    ...tournaments.map((item) => ({ kind: "tournament" as const, id: item.id, name: item.name, meta: `${item.date} · ${item.status}` })),
    ...matches.map((item) => ({ kind: "single" as const, id: item.id, name: `${item.players[0]} v ${item.players[1]}`, meta: `${item.startingScore} · ${item.completedLegs} completed legs` })),
  ];
  const trashedRows = [
    ...trash.tournaments.map((item) => ({ kind: "tournament" as const, id: item.id, name: item.name, meta: `${item.date} · Tournament` })),
    ...trash.matches.map((item) => ({ kind: "single" as const, id: item.id, name: `${item.players[0]} v ${item.players[1]}`, meta: `${item.startingScore} · Just Play session` })),
  ];
  return <main className="tournament-screen manage-screen"><header className="app-topbar"><button type="button" onClick={onBack}>← Home</button><div className="brand-lockup"><span className="brand-target" aria-hidden="true"><i /></span><span><small>DARTY</small><strong>PARTY</strong></span></div><span /></header><section className="history-hero"><p className="eyebrow">PIN protected</p><h1>Manage &amp; Trash</h1><p>Move saved data out of the app, restore it later, or delete it permanently.</p></section>{error && <p className="form-error manage-error" role="alert">{error}</p>}<section className="manage-columns"><article><div className="list-title"><h2>Saved data</h2><b>{currentRows.length}</b></div>{currentRows.length ? currentRows.map((item) => <div className="manage-row" key={`${item.kind}_${item.id}`}><span><strong>{item.name}</strong><small>{item.meta}</small></span><button type="button" disabled={busy} onClick={() => onTrash(item.kind, item.id)}>Move to trash</button></div>) : <p className="empty-list">There is no saved data to manage.</p>}</article><article><div className="list-title"><h2>Trash</h2><b>{trashedRows.length}</b></div>{trashedRows.length ? trashedRows.map((item) => <div className="manage-row trashed" key={`${item.kind}_${item.id}`}><span><strong>{item.name}</strong><small>{item.meta}</small></span><div><button type="button" disabled={busy} onClick={() => onRestore(item.kind, item.id)}>Restore</button><button className="danger-link" type="button" disabled={busy} onClick={() => { setConfirmation(""); setConfirming(item); }}>Delete forever</button></div></div>) : <p className="empty-list">Trash is empty.</p>}</article></section>{confirming && <div className="modal-backdrop"><section className="result-modal permanent-delete"><p className="eyebrow">Cannot be undone</p><h2>Delete forever?</h2><p><strong>{confirming.name}</strong> and all of its saved scoring data will be permanently removed.</p><label><span>Type DELETE to confirm</span><input autoFocus value={confirmation} onChange={(event) => setConfirmation(event.target.value.toUpperCase())} /></label><div className="modal-actions"><button type="button" disabled={busy} onClick={() => setConfirming(null)}>Cancel</button><button className="danger-button" type="button" disabled={busy || confirmation !== "DELETE"} onClick={() => { onPurge(confirming.kind, confirming.id); setConfirming(null); }}>{busy ? "Deleting…" : "Delete permanently"}</button></div></section></div>}</main>;
}
