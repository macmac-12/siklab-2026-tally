CREATE TABLE tally_adjustments (
 id text PRIMARY KEY,
 college_id text NOT NULL CHECK(college_id IN ('BUHI','CAS','CCS','CEA','CHS','CTDE','CTHBM')),
 points_delta bigint NOT NULL CHECK(points_delta BETWEEN -9007199254740991 AND 9007199254740991),
 gold_delta bigint NOT NULL CHECK(gold_delta BETWEEN -9007199254740991 AND 9007199254740991),
 silver_delta bigint NOT NULL CHECK(silver_delta BETWEEN -9007199254740991 AND 9007199254740991),
 bronze_delta bigint NOT NULL CHECK(bronze_delta BETWEEN -9007199254740991 AND 9007199254740991),
 actor_id text NOT NULL REFERENCES accounts(id),
 reason text NOT NULL CHECK(length(trim(reason)) BETWEEN 10 AND 2000),
 created_at timestamptz NOT NULL DEFAULT now(),
 CHECK(points_delta <> 0 OR gold_delta <> 0 OR silver_delta <> 0 OR bronze_delta <> 0)
);
CREATE INDEX tally_adjustments_college ON tally_adjustments(college_id);
ALTER TABLE tally_adjustments ENABLE ROW LEVEL SECURITY;
-- Local installations have no cloud roles. Hosted migrations preserve server-only access.
DO $$
BEGIN
 IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='siklab_app') THEN
  GRANT SELECT, INSERT, UPDATE, DELETE ON tally_adjustments TO siklab_app;
  CREATE POLICY siklab_server ON tally_adjustments FOR ALL TO siklab_app USING (true) WITH CHECK (true);
 END IF;
 IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') THEN
  REVOKE ALL ON tally_adjustments FROM anon;
 END IF;
 IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN
  REVOKE ALL ON tally_adjustments FROM authenticated;
 END IF;
 IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN
  REVOKE ALL ON tally_adjustments FROM service_role;
 END IF;
END $$;
REVOKE ALL ON tally_adjustments FROM PUBLIC;
