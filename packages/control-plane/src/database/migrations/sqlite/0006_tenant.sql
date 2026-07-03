CREATE TABLE IF NOT EXISTS tenants (
    id TEXT PRIMARY KEY NOT NULL,
    slug TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    disabled_at TEXT
);

ALTER TABLE admin_users ADD COLUMN tenant_id TEXT REFERENCES tenants(id);
ALTER TABLE api_keys ADD COLUMN tenant_id TEXT REFERENCES tenants(id);

CREATE INDEX IF NOT EXISTS api_keys_tenant_id_idx ON api_keys(tenant_id);
