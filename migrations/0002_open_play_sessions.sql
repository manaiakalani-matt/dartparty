CREATE TABLE play_sessions (
  id TEXT PRIMARY KEY,
  started_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  ended_at TEXT,
  player_one TEXT NOT NULL,
  player_two TEXT NOT NULL,
  starting_score INTEGER NOT NULL,
  check_in TEXT NOT NULL CHECK (check_in IN ('straight', 'double')),
  completed_legs INTEGER NOT NULL DEFAULT 0,
  result_json TEXT NOT NULL CHECK (json_valid(result_json)),
  detail_json TEXT NOT NULL CHECK (json_valid(detail_json)),
  deleted_at TEXT
);

CREATE INDEX play_sessions_visible_idx ON play_sessions(deleted_at, updated_at DESC);
CREATE INDEX play_sessions_ended_idx ON play_sessions(ended_at, updated_at DESC);

INSERT OR IGNORE INTO play_sessions (
  id, started_at, updated_at, ended_at, player_one, player_two,
  starting_score, check_in, completed_legs, result_json, detail_json, deleted_at
)
SELECT
  id,
  played_at,
  played_at,
  played_at,
  player_one,
  player_two,
  starting_score,
  check_in,
  CAST(json_extract(result_json, '$.legsWon[0]') AS INTEGER)
    + CAST(json_extract(result_json, '$.legsWon[1]') AS INTEGER),
  json_object(
    'id', id,
    'startedAt', played_at,
    'updatedAt', played_at,
    'endedAt', played_at,
    'players', json_array(player_one, player_two),
    'legsWon', json_array(
      CAST(json_extract(result_json, '$.legsWon[0]') AS INTEGER),
      CAST(json_extract(result_json, '$.legsWon[1]') AS INTEGER)
    ),
    'completedLegs',
      CAST(json_extract(result_json, '$.legsWon[0]') AS INTEGER)
        + CAST(json_extract(result_json, '$.legsWon[1]') AS INTEGER),
    'startingScore', starting_score,
    'checkIn', check_in
  ),
  detail_json,
  deleted_at
FROM single_matches;
