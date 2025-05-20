-- Rename current_stage_id to current_stage_name and change type to varchar(255)
ALTER TABLE donors RENAME COLUMN current_stage_id TO current_stage_name;
ALTER TABLE donors ALTER COLUMN current_stage_name TYPE varchar(255); 