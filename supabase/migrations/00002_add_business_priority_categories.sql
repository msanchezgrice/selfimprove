-- Add business priority categories to automation_roi_focus CHECK constraint
-- New values: bugs, ux, features, retention, revenue, reach

-- Drop the existing CHECK constraint and re-add with new values
ALTER TABLE project_settings
  DROP CONSTRAINT IF EXISTS project_settings_automation_roi_focus_check;

ALTER TABLE project_settings
  ADD CONSTRAINT project_settings_automation_roi_focus_check
  CHECK (automation_roi_focus IN ('balanced', 'impact', 'effort', 'confidence', 'bugs', 'ux', 'features', 'retention', 'revenue', 'reach'));

-- Add new roadmap_items category values
-- The category column also has a CHECK constraint
ALTER TABLE roadmap_items
  DROP CONSTRAINT IF EXISTS roadmap_items_category_check;

ALTER TABLE roadmap_items
  ADD CONSTRAINT roadmap_items_category_check
  CHECK (category IN ('bug', 'feature', 'improvement', 'infrastructure', 'retention', 'revenue', 'reach'));
