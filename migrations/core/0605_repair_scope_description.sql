ALTER TABLE repair_work_orders ADD COLUMN scope_description TEXT;
UPDATE repair_work_orders SET scope_description=(SELECT text FROM repair_intakes WHERE repair_intakes.id=repair_work_orders.intake_id);
