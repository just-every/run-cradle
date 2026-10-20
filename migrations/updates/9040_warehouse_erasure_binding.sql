-- Retain the FILES custody of every existing erasure receipt.
ALTER TABLE lifecycle_erasure_blobs ADD COLUMN bucket_binding TEXT NOT NULL DEFAULT 'FILES' CHECK(bucket_binding IN ('FILES','WAREHOUSE'));
