ALTER TABLE api_keys
    ADD COLUMN IF NOT EXISTS previous_key_hash TEXT;

ALTER TABLE api_keys
    ADD COLUMN IF NOT EXISTS rotation_grace_until TEXT;

CREATE INDEX IF NOT EXISTS api_keys_previous_key_hash_idx ON api_keys(previous_key_hash);
