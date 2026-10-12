CREATE TABLE portability_segments(job_id TEXT NOT NULL,part_index INTEGER NOT NULL,segment_index INTEGER NOT NULL,content TEXT NOT NULL,PRIMARY KEY(job_id,part_index,segment_index));
