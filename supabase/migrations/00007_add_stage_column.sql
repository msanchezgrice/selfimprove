ALTER TABLE roadmap_items ADD COLUMN IF NOT EXISTS stage text DEFAULT 'brief' CHECK (stage IN ('brief', 'roadmap'));

-- Migrate existing: proposed items become briefs, approved/building/shipped become roadmap
UPDATE roadmap_items SET stage = 'roadmap' WHERE status IN ('approved', 'building', 'shipped');
UPDATE roadmap_items SET stage = 'brief' WHERE status = 'proposed';
