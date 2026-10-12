CREATE UNIQUE INDEX repair_one_live_visit ON repair_visits(work_order_id) WHERE lifecycle IN ('requested','unknown','confirmed');
