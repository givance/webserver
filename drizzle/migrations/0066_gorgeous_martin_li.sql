-- Clean up duplicate emails, keeping only the most recent one for each session_id/donor_id combination
-- This removes older emails with the same session_id and donor_id, keeping the one with the latest created_at

WITH duplicate_emails AS (
  SELECT 
    id,
    session_id,
    donor_id,
    created_at,
    ROW_NUMBER() OVER (
      PARTITION BY session_id, donor_id 
      ORDER BY created_at DESC, id DESC
    ) as rn
  FROM generated_emails
),
emails_to_delete AS (
  SELECT id 
  FROM duplicate_emails 
  WHERE rn > 1
)
DELETE FROM generated_emails 
WHERE id IN (SELECT id FROM emails_to_delete);

-- Now add the unique constraint
ALTER TABLE "generated_emails" ADD CONSTRAINT "generated_emails_session_id_donor_id_unique" UNIQUE("session_id", "donor_id"); 