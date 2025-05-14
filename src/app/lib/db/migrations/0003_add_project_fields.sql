-- Add goal and tags columns to projects table
ALTER TABLE projects
ADD COLUMN goal INTEGER,
ADD COLUMN tags TEXT[]; 