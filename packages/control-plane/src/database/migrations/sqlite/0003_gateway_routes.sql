CREATE TABLE IF NOT EXISTS "gateway_routes" (
  "id" text PRIMARY KEY NOT NULL,
  "service_name" text NOT NULL,
  "host" text NOT NULL,
  "target_host" text NOT NULL,
  "target_port" integer NOT NULL,
  "ingress" text NOT NULL,
  "auto_tls" integer NOT NULL DEFAULT 0,
  "created_at" text NOT NULL,
  "updated_at" text NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "gateway_routes_service_host_idx"
  ON "gateway_routes" ("service_name", "host");
