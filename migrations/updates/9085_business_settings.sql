CREATE TABLE bs_settings (
  singleton INTEGER PRIMARY KEY CHECK(singleton=1),
  rev INTEGER NOT NULL DEFAULT 0,
  document TEXT,
  applied_at TEXT,
  stopped INTEGER NOT NULL DEFAULT 0 CHECK(stopped IN(0,1)),
  token TEXT NOT NULL DEFAULT ''
);
CREATE TABLE bs_overrides (
  field TEXT PRIMARY KEY CHECK(field IN('display_name','owner_name','brand_color','logo','timezone')),
  value TEXT NOT NULL,
  actor TEXT NOT NULL,
  changed_at TEXT NOT NULL
);
CREATE TABLE bs_logo (
  singleton INTEGER PRIMARY KEY CHECK(singleton=1),
  sha256 TEXT NOT NULL,
  type TEXT NOT NULL,
  bytes BLOB NOT NULL
);
CREATE TABLE bs_team (
  email TEXT PRIMARY KEY,
  operator_id TEXT,
  invite INTEGER NOT NULL,
  state TEXT NOT NULL CHECK(state IN('invited','active','inactive','conflict'))
);
CREATE TABLE bs_audit (
  id INTEGER PRIMARY KEY,
  actor TEXT NOT NULL,
  action TEXT NOT NULL,
  field TEXT,
  changed_at TEXT NOT NULL
);
-- An INSERT of NULL fails the transaction if a concurrent write invalidated its fence.
CREATE TABLE bs_assert (value INTEGER NOT NULL);
ALTER TABLE bs_settings ADD COLUMN owner_id TEXT CHECK(owner_id IS NULL OR owner_id <> '');
ALTER TABLE bs_team ADD COLUMN business_id TEXT CHECK(business_id IS NULL OR business_id <> '');
ALTER TABLE bs_team ADD COLUMN business_role TEXT CHECK(business_role IS NULL OR business_role IN('admin','member'));
CREATE UNIQUE INDEX bs_team_business_id ON bs_team(business_id) WHERE business_id IS NOT NULL;
