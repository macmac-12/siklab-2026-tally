CREATE TABLE brackets (
  id text PRIMARY KEY,
  category_id text NOT NULL REFERENCES categories(id),
  discipline_id text REFERENCES disciplines(id),
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  draft jsonb NOT NULL,
  published jsonb,
  published_at timestamptz
);
CREATE INDEX brackets_category ON brackets(category_id);
