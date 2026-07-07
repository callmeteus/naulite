ALTER TABLE "instances" ADD COLUMN IF NOT EXISTS "dispatch_attempts" integer NOT NULL DEFAULT 0;
ALTER TABLE "instances" ADD COLUMN IF NOT EXISTS "last_dispatched_at" text;
ALTER TABLE "instances" ADD COLUMN IF NOT EXISTS "last_error" text;
