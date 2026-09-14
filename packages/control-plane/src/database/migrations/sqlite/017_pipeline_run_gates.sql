ALTER TABLE pipeline_runs ADD COLUMN created_by TEXT;
ALTER TABLE pipeline_runs ADD COLUMN gate_step_id TEXT;
ALTER TABLE pipeline_runs ADD COLUMN pending_plan TEXT;
ALTER TABLE pipeline_runs ADD COLUMN approved_by TEXT;
