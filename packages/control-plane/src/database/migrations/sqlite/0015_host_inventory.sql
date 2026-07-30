ALTER TABLE `nodes` ADD COLUMN `os_family` text;
ALTER TABLE `nodes` ADD COLUMN `os_version` text;
ALTER TABLE `nodes` ADD COLUMN `arch` text;

CREATE TABLE IF NOT EXISTS `host_inventories` (
  `node_id` text PRIMARY KEY NOT NULL,
  `package_manager` text NOT NULL,
  `packages` text DEFAULT '[]' NOT NULL,
  `collected_at` text NOT NULL,
  `updated_at` text NOT NULL
);

CREATE TABLE IF NOT EXISTS `host_update_runs` (
  `id` text PRIMARY KEY NOT NULL,
  `node_id` text NOT NULL,
  `kind` text NOT NULL,
  `status` text NOT NULL,
  `packages` text DEFAULT '[]' NOT NULL,
  `reboot_required` integer DEFAULT 0 NOT NULL,
  `stdout` text,
  `stderr` text,
  `error_message` text,
  `started_at` text,
  `completed_at` text,
  `created_at` text NOT NULL
);
