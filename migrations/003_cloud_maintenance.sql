-- Operational records deliberately stay outside exported/restored event data.
-- actor_id has no FK: a restore temporarily deletes/reinserts account rows.
CREATE TABLE maintenance_operations (
  id text PRIMARY KEY,
  actor_id text NOT NULL,
  kind text NOT NULL CHECK (kind IN ('restore', 'reset')),
  object_key text,
  checksum text,
  expected_revision bigint,
  counts jsonb,
  completed_result jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT now() + interval '24 hours'
);
CREATE INDEX maintenance_operations_expiry ON maintenance_operations(expires_at);
ALTER TABLE maintenance_operations ENABLE ROW LEVEL SECURITY;
