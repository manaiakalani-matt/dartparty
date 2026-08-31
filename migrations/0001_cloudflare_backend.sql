PRAGMA foreign_keys = ON;

CREATE TABLE tournaments (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('active', 'completed')),
  date TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  schema_version INTEGER NOT NULL DEFAULT 1,
  tournament_json TEXT NOT NULL CHECK (json_valid(tournament_json)),
  deleted_at TEXT
);

CREATE INDEX idx_tournaments_updated_at ON tournaments(updated_at DESC);
CREATE INDEX idx_tournaments_deleted_at ON tournaments(deleted_at);

CREATE TABLE matches (
  tournament_id TEXT NOT NULL,
  match_id TEXT NOT NULL,
  stage TEXT NOT NULL CHECK (stage IN ('group', 'knockout')),
  is_final INTEGER NOT NULL DEFAULT 0 CHECK (is_final IN (0, 1)),
  status TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL,
  winner_id TEXT,
  result_json TEXT CHECK (result_json IS NULL OR json_valid(result_json)),
  detail_json TEXT CHECK (detail_json IS NULL OR json_valid(detail_json)),
  PRIMARY KEY (tournament_id, match_id),
  FOREIGN KEY (tournament_id) REFERENCES tournaments(id) ON DELETE CASCADE
);

CREATE INDEX idx_matches_tournament_result ON matches(tournament_id, result_json);
CREATE INDEX idx_matches_tournament_stage ON matches(tournament_id, stage);

CREATE TABLE match_dependencies (
  tournament_id TEXT NOT NULL,
  ancestor_match_id TEXT NOT NULL,
  descendant_match_id TEXT NOT NULL,
  PRIMARY KEY (tournament_id, ancestor_match_id, descendant_match_id),
  FOREIGN KEY (tournament_id, ancestor_match_id)
    REFERENCES matches(tournament_id, match_id) ON DELETE CASCADE,
  FOREIGN KEY (tournament_id, descendant_match_id)
    REFERENCES matches(tournament_id, match_id) ON DELETE CASCADE
);

CREATE INDEX idx_match_dependencies_ancestor
  ON match_dependencies(tournament_id, ancestor_match_id);

CREATE TABLE audit (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  timestamp TEXT NOT NULL,
  action TEXT NOT NULL,
  tournament_id TEXT NOT NULL,
  match_id TEXT NOT NULL,
  previous_json TEXT,
  next_json TEXT,
  FOREIGN KEY (tournament_id) REFERENCES tournaments(id) ON DELETE CASCADE
);

CREATE INDEX idx_audit_tournament_timestamp ON audit(tournament_id, timestamp DESC);

CREATE TABLE single_matches (
  id TEXT PRIMARY KEY,
  played_at TEXT NOT NULL,
  player_one TEXT NOT NULL,
  player_two TEXT NOT NULL,
  winner INTEGER NOT NULL CHECK (winner IN (0, 1)),
  starting_score INTEGER NOT NULL,
  check_in TEXT NOT NULL CHECK (check_in IN ('straight', 'double')),
  best_of INTEGER NOT NULL,
  result_json TEXT NOT NULL CHECK (json_valid(result_json)),
  detail_json TEXT NOT NULL CHECK (json_valid(detail_json)),
  deleted_at TEXT
);

CREATE INDEX idx_single_matches_played_at ON single_matches(played_at DESC);
CREATE INDEX idx_single_matches_deleted_at ON single_matches(deleted_at);

CREATE TRIGGER audit_match_replacement
AFTER UPDATE OF result_json ON matches
WHEN OLD.result_json IS NOT NULL AND NEW.result_json IS NOT OLD.result_json
BEGIN
  INSERT INTO audit (
    timestamp,
    action,
    tournament_id,
    match_id,
    previous_json,
    next_json
  ) VALUES (
    NEW.updated_at,
    'replaceMatch',
    NEW.tournament_id,
    NEW.match_id,
    json_object('result', json(OLD.result_json), 'detail', json(OLD.detail_json)),
    json_object('result', json(NEW.result_json), 'detail', json(NEW.detail_json))
  );
END;

CREATE TRIGGER sync_tournament_after_match_save
AFTER UPDATE OF result_json ON matches
WHEN NEW.result_json IS NOT NULL
BEGIN
  UPDATE tournaments
  SET
    updated_at = NEW.updated_at,
    status = CASE WHEN NEW.is_final = 1 THEN 'completed' ELSE status END,
    tournament_json = CASE
      WHEN NEW.is_final = 1 THEN json_set(
        tournament_json,
        '$.status',
        'completed',
        '$.championId',
        NEW.winner_id
      )
      ELSE tournament_json
    END
  WHERE id = NEW.tournament_id;
END;
