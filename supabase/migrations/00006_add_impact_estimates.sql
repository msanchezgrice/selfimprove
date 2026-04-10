ALTER TABLE roadmap_items ADD COLUMN IF NOT EXISTS impact_estimates jsonb DEFAULT '[]';
ALTER TABLE roadmap_items ADD COLUMN IF NOT EXISTS impact_actuals jsonb DEFAULT '[]';
ALTER TABLE roadmap_items ADD COLUMN IF NOT EXISTS estimate_accuracy real;
