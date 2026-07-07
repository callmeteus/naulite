ALTER TABLE "instances" ADD COLUMN "dispatch_attempts" integer NOT NULL DEFAULT 0;
ALTER TABLE "instances" ADD COLUMN "last_dispatched_at" text;
ALTER TABLE "instances" ADD COLUMN "last_error" text;
