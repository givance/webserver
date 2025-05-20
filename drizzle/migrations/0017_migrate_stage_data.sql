-- This is a data migration that will be run manually after deploying the schema changes
-- For each donor, we need to:
-- 1. Get the organization's donor journey
-- 2. Find the stage name for the current_stage_id
-- 3. Update the current_stage_name field

-- Note: This is a placeholder migration. The actual data migration should be done
-- through a script that can access the donor journey data and map IDs to names.
-- This SQL file serves as a reminder that data migration is needed.

-- Example of what the script would do:
-- UPDATE donors d
-- SET current_stage_name = (
--   SELECT node_label 
--   FROM organization_donor_journey_nodes n
--   JOIN organizations o ON o.id = d.organization_id
--   WHERE n.journey_id = o.donor_journey_id
--   AND n.node_id = d.current_stage_id
-- )
-- WHERE d.current_stage_id IS NOT NULL;

-- The actual migration should be done through a Node.js script that can:
-- 1. Load each organization's donor journey
-- 2. Parse the journey nodes
-- 3. Map stage IDs to names
-- 4. Update donors table accordingly 