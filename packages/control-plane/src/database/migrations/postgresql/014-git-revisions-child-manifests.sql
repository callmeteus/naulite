ALTER TABLE "git_revisions" ADD COLUMN IF NOT EXISTS "child_manifests" jsonb DEFAULT '[]'::jsonb NOT NULL;

