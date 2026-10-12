CREATE TABLE channel_mail_authority (id TEXT PRIMARY KEY,epoch INTEGER NOT NULL,active INTEGER NOT NULL);
INSERT INTO channel_mail_authority VALUES('00000000000000000000001200',1,1);
CREATE TABLE channel_mail_batches (
 id TEXT PRIMARY KEY, delivery_ids_json TEXT NOT NULL, operator_id TEXT NOT NULL REFERENCES operators(id),
 input_hash TEXT NOT NULL, connection_id TEXT NOT NULL, connection_version INTEGER NOT NULL,
 created_at INTEGER NOT NULL, deadline INTEGER NOT NULL
);
