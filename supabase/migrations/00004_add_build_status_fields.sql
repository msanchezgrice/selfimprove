ALTER TABLE roadmap_items ADD COLUMN IF NOT EXISTS build_status text;
ALTER TABLE roadmap_items ADD COLUMN IF NOT EXISTS github_issue_url text;
ALTER TABLE roadmap_items ADD COLUMN IF NOT EXISTS github_issue_number integer;
ALTER TABLE roadmap_items ADD COLUMN IF NOT EXISTS pr_url text;
ALTER TABLE roadmap_items ADD COLUMN IF NOT EXISTS pr_number integer;
