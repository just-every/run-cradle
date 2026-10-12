CREATE TABLE operators (
  id TEXT PRIMARY KEY NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  name TEXT NOT NULL,
  email TEXT NOT NULL COLLATE NOCASE UNIQUE,
  active INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE sessions (
  id TEXT PRIMARY KEY NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  operator_id TEXT NOT NULL REFERENCES operators(id),
  token TEXT NOT NULL UNIQUE,
  expires_at INTEGER NOT NULL,
  revoked_at INTEGER
);

CREATE TABLE workspace_settings (
  id TEXT PRIMARY KEY NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  workspace_name TEXT NOT NULL,
  timezone TEXT NOT NULL,
  currency TEXT NOT NULL,
  quiet_hours_start TEXT NOT NULL,
  quiet_hours_end TEXT NOT NULL,
  ai_enabled INTEGER NOT NULL DEFAULT 0,
  ai_daily_ceiling INTEGER NOT NULL DEFAULT 200
);

CREATE TABLE campaigns (
  id TEXT PRIMARY KEY NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  code TEXT NOT NULL COLLATE NOCASE UNIQUE,
  name TEXT NOT NULL,
  owner_id TEXT NOT NULL REFERENCES operators(id),
  start_date TEXT NOT NULL,
  launch_date TEXT NOT NULL,
  objective TEXT NOT NULL,
  status_summary TEXT NOT NULL,
  phase TEXT NOT NULL,
  status TEXT NOT NULL,
  health INTEGER NOT NULL,
  health_updated_at INTEGER NOT NULL,
  budget_minor INTEGER NOT NULL,
  spend_minor INTEGER NOT NULL,
  archived_at INTEGER
);

CREATE TABLE campaign_tags (
  id TEXT PRIMARY KEY NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  campaign_id TEXT NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  tag TEXT NOT NULL,
  UNIQUE(campaign_id, tag)
);

CREATE TABLE deliverables (
  id TEXT PRIMARY KEY NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  campaign_id TEXT NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  owner_id TEXT NOT NULL REFERENCES operators(id),
  title TEXT NOT NULL,
  due_date TEXT,
  state TEXT NOT NULL,
  completed_at INTEGER,
  completed_by_id TEXT REFERENCES operators(id)
);

CREATE TABLE milestones (
  id TEXT PRIMARY KEY NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  campaign_id TEXT NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  owner_id TEXT NOT NULL REFERENCES operators(id),
  title TEXT NOT NULL,
  type TEXT NOT NULL,
  status TEXT NOT NULL,
  start_date TEXT NOT NULL,
  end_date TEXT,
  conflict_reason TEXT
);

CREATE TABLE milestone_dependencies (
  id TEXT PRIMARY KEY NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  milestone_id TEXT NOT NULL REFERENCES milestones(id) ON DELETE CASCADE,
  predecessor_id TEXT NOT NULL REFERENCES milestones(id) ON DELETE CASCADE,
  UNIQUE(milestone_id, predecessor_id)
);

CREATE TABLE risks (
  id TEXT PRIMARY KEY NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  campaign_id TEXT NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  owner_id TEXT NOT NULL REFERENCES operators(id),
  title TEXT NOT NULL,
  severity TEXT NOT NULL,
  due_date TEXT,
  signal TEXT NOT NULL,
  mitigation TEXT NOT NULL,
  state TEXT NOT NULL,
  resolution_note TEXT,
  escalated_at INTEGER,
  escalated_by_id TEXT REFERENCES operators(id),
  escalation_reason TEXT
);

CREATE TABLE decisions (
  id TEXT PRIMARY KEY NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  campaign_id TEXT NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  risk_id TEXT REFERENCES risks(id),
  requester_id TEXT NOT NULL REFERENCES operators(id),
  assignee_id TEXT REFERENCES operators(id),
  title TEXT NOT NULL,
  priority TEXT NOT NULL,
  due_at INTEGER NOT NULL,
  recommendation TEXT NOT NULL,
  impact TEXT NOT NULL,
  state TEXT NOT NULL,
  outcome_at INTEGER,
  outcome_by_id TEXT REFERENCES operators(id),
  rationale TEXT
);

CREATE TABLE lenses (
  id TEXT PRIMARY KEY NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  record_type TEXT NOT NULL,
  conditions_json TEXT NOT NULL,
  sort_json TEXT NOT NULL,
  fields_json TEXT NOT NULL,
  display TEXT NOT NULL,
  created_by_id TEXT NOT NULL REFERENCES operators(id),
  shipped_key TEXT UNIQUE
);

CREATE TABLE activity_entries (
  id TEXT PRIMARY KEY NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  campaign_id TEXT NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  subject_id TEXT NOT NULL,
  actor_id TEXT REFERENCES operators(id),
  type TEXT NOT NULL,
  field_name TEXT,
  previous_value TEXT,
  next_value TEXT,
  message TEXT NOT NULL
);

CREATE TABLE comments (
  id TEXT PRIMARY KEY NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  campaign_id TEXT NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  author_id TEXT NOT NULL REFERENCES operators(id),
  body TEXT NOT NULL,
  deleted_at INTEGER
);

CREATE TABLE automations (
  id TEXT PRIMARY KEY NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  name TEXT NOT NULL,
  trigger_type TEXT NOT NULL,
  trigger_config_json TEXT NOT NULL,
  actions_json TEXT NOT NULL,
  enabled INTEGER NOT NULL,
  definition_version INTEGER NOT NULL
);

CREATE TABLE automation_runs (
  id TEXT PRIMARY KEY NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  automation_id TEXT NOT NULL REFERENCES automations(id) ON DELETE CASCADE,
  definition_version INTEGER NOT NULL,
  subject_id TEXT,
  state TEXT NOT NULL,
  queued_at INTEGER NOT NULL,
  started_at INTEGER,
  finished_at INTEGER,
  affected_count INTEGER NOT NULL DEFAULT 0,
  error_code TEXT,
  error_message TEXT
);

CREATE TABLE notifications (
  id TEXT PRIMARY KEY NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  operator_id TEXT NOT NULL REFERENCES operators(id),
  kind TEXT NOT NULL,
  subject_id TEXT,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  unavailable INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE notification_reads (
  id TEXT PRIMARY KEY NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  notification_id TEXT NOT NULL REFERENCES notifications(id) ON DELETE CASCADE,
  operator_id TEXT NOT NULL REFERENCES operators(id),
  read_at INTEGER NOT NULL,
  UNIQUE(notification_id, operator_id)
);

CREATE TABLE sample_installations (
  id TEXT PRIMARY KEY NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  installed_by_id TEXT NOT NULL REFERENCES operators(id),
  source_hash TEXT NOT NULL UNIQUE
);

CREATE INDEX campaigns_active_launch_idx ON campaigns(archived_at, launch_date, id);
CREATE INDEX deliverables_campaign_idx ON deliverables(campaign_id, id);
CREATE INDEX milestones_timeline_idx ON milestones(start_date, id);
CREATE INDEX risks_lens_idx ON risks(severity, state, due_date, id);
CREATE INDEX decisions_queue_idx ON decisions(state, due_at, id);
CREATE INDEX notifications_operator_idx ON notifications(operator_id, created_at DESC, id);
