CREATE TABLE repair_slot_agreements(id TEXT PRIMARY KEY NOT NULL,version INTEGER NOT NULL CHECK(version>0),created_at TEXT NOT NULL,updated_at TEXT NOT NULL,lifecycle TEXT NOT NULL,schema_version INTEGER NOT NULL DEFAULT 1,quote_id TEXT NOT NULL REFERENCES repair_quotes(id),quote_version TEXT NOT NULL,contractor_id TEXT NOT NULL REFERENCES repair_contractors(id),start_at TEXT NOT NULL,end_at TEXT NOT NULL,timezone TEXT NOT NULL,evidence TEXT NOT NULL,actor_id TEXT NOT NULL);
CREATE INDEX repair_slot_agreement_quote ON repair_slot_agreements(quote_id,quote_version,start_at,end_at);
ALTER TABLE repair_invoices ADD COLUMN invoice_date TEXT;
ALTER TABLE repair_invoices ADD COLUMN due_date TEXT;
ALTER TABLE repair_invoices ADD COLUMN line_amount_types TEXT;
ALTER TABLE repair_invoices ADD COLUMN lines TEXT;
