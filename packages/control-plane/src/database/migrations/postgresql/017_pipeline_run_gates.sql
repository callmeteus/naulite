ALTER TABLE pipeline_runs ADD COLUMN IF NOT EXISTS created_by TEXT;
ALTER TABLE pipeline_runs ADD COLUMN IF NOT EXISTS gate_step_id TEXT;
ALTER TABLE pipeline_runs ADD COLUMN IF NOT EXISTS pending_plan TEXT;
ALTER TABLE pipeline_runs ADD COLUMN IF NOT EXISTS approved_by TEXT;
