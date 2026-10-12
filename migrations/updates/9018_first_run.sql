-- Existing native portfolios and Base owners keep their completed workspace.
-- A fresh installation has no operators when migrations run.
CREATE TABLE cradle_first_run (
 singleton INTEGER PRIMARY KEY CHECK(singleton=1), completed_at INTEGER
);
INSERT INTO cradle_first_run(singleton,completed_at)
 VALUES(1,CASE WHEN EXISTS(SELECT 1 FROM operators) OR EXISTS(SELECT 1 FROM oa_operators WHERE role='owner') THEN unixepoch()*1000 ELSE NULL END);
