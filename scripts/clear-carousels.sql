-- Clear carousels and related data (keep jobs, knowledge, rules)
-- Run: sqlite3 storage/studio.db < scripts/clear-carousels.sql

DELETE FROM slides;
DELETE FROM captions;
DELETE FROM facts;
DELETE FROM compliance_findings;
DELETE FROM agent_runs WHERE carousel_id IS NOT NULL;
DELETE FROM carousels;
DELETE FROM revisions;

-- Verify
SELECT 'Carousels cleared:' AS status;
SELECT COUNT(*) AS carousel_count FROM carousels;
SELECT COUNT(*) AS slide_count FROM slides;
SELECT COUNT(*) AS job_count FROM jobs;
SELECT COUNT(*) AS knowledge_count FROM knowledge_items;
