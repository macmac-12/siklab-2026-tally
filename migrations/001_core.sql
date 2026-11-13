CREATE TABLE IF NOT EXISTS accounts (
 id text PRIMARY KEY, name text NOT NULL, email text NOT NULL UNIQUE, role text NOT NULL CHECK(role IN ('superadmin','admin','officer')),
 password_hash text NOT NULL, active boolean NOT NULL DEFAULT true, must_reset boolean NOT NULL DEFAULT false, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS categories (id text PRIMARY KEY, data jsonb NOT NULL, version integer NOT NULL DEFAULT 1 CHECK(version>0));
CREATE TABLE IF NOT EXISTS disciplines (id text PRIMARY KEY, category_id text NOT NULL REFERENCES categories(id), data jsonb NOT NULL, version integer NOT NULL DEFAULT 1 CHECK(version>0));
CREATE TABLE IF NOT EXISTS assignments (account_id text NOT NULL REFERENCES accounts(id), category_id text NOT NULL REFERENCES categories(id), PRIMARY KEY(account_id,category_id));
CREATE TABLE IF NOT EXISTS sessions (token_hash text PRIMARY KEY, account_id text NOT NULL REFERENCES accounts(id), expires_at timestamptz NOT NULL, created_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX IF NOT EXISTS sessions_account ON sessions(account_id);
CREATE TABLE IF NOT EXISTS login_attempts (key text PRIMARY KEY, count integer NOT NULL, started_at timestamptz NOT NULL);
CREATE TABLE IF NOT EXISTS entries (id text PRIMARY KEY, category_id text NOT NULL REFERENCES categories(id), college_id text NOT NULL CHECK(college_id IN ('BUHI','CAS','CCS','CEA','CHS','CTDE','CTHBM')), label text NOT NULL, UNIQUE(category_id,label));
CREATE TABLE IF NOT EXISTS schedules (
 id text PRIMARY KEY, category_id text NOT NULL REFERENCES categories(id), discipline_id text REFERENCES disciplines(id), data jsonb NOT NULL,
 version integer NOT NULL DEFAULT 1 CHECK(version>0), published_id text
);
CREATE INDEX IF NOT EXISTS schedules_category ON schedules(category_id);
CREATE TABLE IF NOT EXISTS revisions (
 id text PRIMARY KEY, category_id text NOT NULL REFERENCES categories(id), schedule_id text REFERENCES schedules(id), kind text NOT NULL CHECK(kind IN ('result','award')),
 status text NOT NULL CHECK(status IN ('draft','pending','approved','rejected','superseded')), body jsonb NOT NULL,
 base_id text REFERENCES revisions(id) DEFERRABLE INITIALLY DEFERRED, actor_id text NOT NULL REFERENCES accounts(id), reason text NOT NULL DEFAULT '',
 review_note text NOT NULL DEFAULT '', created_at timestamptz NOT NULL DEFAULT now(), reviewed_at timestamptz, reviewer_id text REFERENCES accounts(id),
 CHECK ((kind='result' AND schedule_id IS NOT NULL) OR (kind='award' AND schedule_id IS NULL))
);
CREATE UNIQUE INDEX IF NOT EXISTS pending_result ON revisions(schedule_id) WHERE kind='result' AND status IN ('draft','pending');
CREATE UNIQUE INDEX IF NOT EXISTS pending_award ON revisions(category_id) WHERE kind='award' AND status IN ('draft','pending');
CREATE INDEX IF NOT EXISTS revisions_category ON revisions(category_id);
CREATE TABLE IF NOT EXISTS awards (category_id text PRIMARY KEY REFERENCES categories(id), revision_id text NOT NULL UNIQUE REFERENCES revisions(id));
ALTER TABLE schedules DROP CONSTRAINT IF EXISTS schedules_published_fk;
ALTER TABLE schedules ADD CONSTRAINT schedules_published_fk FOREIGN KEY(published_id) REFERENCES revisions(id) DEFERRABLE INITIALLY DEFERRED;
CREATE TABLE IF NOT EXISTS audit (
 id text PRIMARY KEY, actor_id text NOT NULL REFERENCES accounts(id), action text NOT NULL, entity_id text NOT NULL,
 before_data jsonb, after_data jsonb, reason text NOT NULL DEFAULT '', created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS audit_created ON audit(created_at DESC);
CREATE TABLE IF NOT EXISTS idempotency (actor_id text NOT NULL REFERENCES accounts(id), key text NOT NULL, request_hash text NOT NULL, response jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(actor_id,key));
CREATE TABLE IF NOT EXISTS system_state (id boolean PRIMARY KEY DEFAULT true CHECK(id), revision bigint NOT NULL DEFAULT 1, updated_at timestamptz NOT NULL DEFAULT now());
INSERT INTO system_state(id) VALUES (true) ON CONFLICT DO NOTHING;
