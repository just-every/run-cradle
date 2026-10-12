CREATE TABLE admission_provenance_segments (
 command_id TEXT NOT NULL REFERENCES command_admissions(command_id) ON DELETE CASCADE,
 segment_index INTEGER NOT NULL CHECK(segment_index>=0),
 subjects_json TEXT NOT NULL,
 PRIMARY KEY(command_id,segment_index)
);
