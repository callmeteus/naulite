CREATE TABLE IF NOT EXISTS admin_audit_log (
    id text PRIMARY KEY NOT NULL,
    action text NOT NULL,
    actor_user_id text,
    detail_json text,
    created_at text NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_admin_audit_log_created_at ON admin_audit_log (created_at);
