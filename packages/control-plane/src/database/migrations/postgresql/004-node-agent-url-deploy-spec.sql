ALTER TABLE "nodes" ADD COLUMN IF NOT EXISTS "agent_url" text;
ALTER TABLE "services" ADD COLUMN IF NOT EXISTS "deploy_spec" jsonb;
