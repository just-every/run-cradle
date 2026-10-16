-- A human decision is final for this original attempt. Provider observations may
-- still append ordinary receipts; neither redelivery nor another decision replaces it.
CREATE UNIQUE INDEX execution_one_human_resolution ON execution_receipts(attempt_id) WHERE method='human_evidence';
