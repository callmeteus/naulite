import type { Task } from "@naulite/shared";

/**
 * Builds agent argv for playbook modules that run as shell commands on the node.
 */
export namespace AgentPlaybookCommandBuilder {
    /**
     * Returns argv for supported modules, or null when the module is not handled here.
     *
     * @param task Playbook task
     * @returns Shell argv or null
     */
    export function buildArgv(task: Task): string[] | null {
        if (task.module === "s3") {
            return buildS3Argv(task);
        }

        if (task.module === "unarchive") {
            return buildUnarchiveArgv(task);
        }

        if (task.module === "unit") {
            return buildUnitArgv(task);
        }

        if (task.module === "http") {
            return buildHttpArgv(task);
        }

        return null;
    }

    /**
     * Extra environment variables for the remote command.
     *
     * @param task Playbook task
     * @returns Env map for the agent command
     */
    export function buildEnv(task: Task): Record<string, string> {
        const env: Record<string, string> = { ...task.env };

        if (task.module === "s3") {
            const endpoint = task.env?.AWS_ENDPOINT_URL
                ?? task.env?.S3_ENDPOINT_URL
                ?? process.env.S3_ENDPOINT
                ?? process.env.S3_ENDPOINT_URL;

            if (endpoint) {
                env.AWS_ENDPOINT_URL = endpoint;
            }

            if (process.env.AWS_REGION) {
                env.AWS_DEFAULT_REGION = process.env.AWS_REGION;
            }

            if (process.env.AWS_ACCESS_KEY_ID) {
                env.AWS_ACCESS_KEY_ID = process.env.AWS_ACCESS_KEY_ID;
            }

            if (process.env.AWS_SECRET_ACCESS_KEY) {
                env.AWS_SECRET_ACCESS_KEY = process.env.AWS_SECRET_ACCESS_KEY;
            }
        }

        return env;
    }

    /**
     * Builds aws s3 cp for download actions.
     *
     * @param task S3 task
     * @returns Shell argv
     */
    function buildS3Argv(task: Task): string[] {
        const bucket = task.bucket ?? "";
        const key = task.key ?? "";
        const dest = task.dest ?? `/tmp/${task.name}`;
        const action = task.action ?? "download";

        if (action !== "download") {
            throw new Error(`S3 action ${action} is not supported on the agent yet.`);
        }

        const taskEnv = AgentPlaybookCommandBuilder.buildEnv(task);
        const endpoint = (
            taskEnv.AWS_ENDPOINT_URL
            ?? taskEnv.S3_ENDPOINT_URL
            ?? ""
        ).replace(/\/$/, "");
        const curlUrl = endpoint ? `${endpoint}/${bucket}/${key}` : "";
        const awsCp = endpoint
            ? `aws --endpoint-url="${endpoint}" s3 cp "s3://${bucket}/${key}" "${dest}"`
            : `aws s3 cp "s3://${bucket}/${key}" "${dest}"`;
        const download = curlUrl
            ? `if command -v aws >/dev/null 2>&1; then ${awsCp}; else curl -fsSL "${curlUrl}" -o "${dest}"; fi`
            : awsCp;
        const exportEnv = buildShellExportPrefix(taskEnv);
        const script = [
            "set -e",
            exportEnv,
            `mkdir -p "$(dirname "${dest}")"`,
            download,
            `test -s "${dest}"`
        ].filter((line) => line.length > 0).join("; ");

        return ["sh", "-c", script];
    }

    /**
     * Builds tar extraction for unarchive tasks.
     *
     * @param task Unarchive task
     * @returns Shell argv
     */
    function buildUnarchiveArgv(task: Task): string[] {
        const src = task.src ?? "";
        const dest = task.dest ?? "/tmp";
        const script = [
            "set -e",
            `mkdir -p "${dest}"`,
            `tar -xzf "${src}" -C "${dest}"`
        ].join("; ");

        return ["sh", "-c", script];
    }

    /**
     * Builds pm2 or systemd unit commands.
     *
     * @param task Unit task
     * @returns Shell argv
     */
    function buildUnitArgv(task: Task): string[] {
        const processName = task.service ?? task.name;
        const state = task.state ?? "started";
        const kind = task.kind ?? "pm2";

        if (kind === "pm2") {
            if (state === "reloaded") {
                return ["sh", "-c", `pm2 reload "${processName}"`];
            }

            if (state === "restarted") {
                return ["sh", "-c", `pm2 restart "${processName}"`];
            }

            return ["sh", "-c", `pm2 start "${processName}"`];
        }

        throw new Error(`Unit kind ${kind} is not supported on the agent yet.`);
    }

    /**
     * Builds curl-based HTTP health checks.
     *
     * @param task HTTP task
     * @returns Shell argv
     */
    function buildHttpArgv(task: Task): string[] {
        const url = task.url ?? "";
        const expected = task.expectedStatus?.[0] ?? 200;
        const timeoutSeconds = parseTimeoutSeconds(task.timeout);
        const script = [
            "set -e",
            `code=$(curl -sS -o /dev/null -w '%{http_code}' --max-time ${timeoutSeconds} "${url}")`,
            `test "$code" = "${expected}"`
        ].join("; ");

        return ["sh", "-c", script];
    }

    /**
     * Builds export statements for AWS-related env vars (agent command tasks do not merge env yet).
     *
     * @param env Resolved task environment
     * @returns Shell prefix or empty string
     */
    function buildShellExportPrefix(env: Record<string, string>): string {
        const keys = [
            "AWS_ACCESS_KEY_ID",
            "AWS_SECRET_ACCESS_KEY",
            "AWS_DEFAULT_REGION",
            "AWS_ENDPOINT_URL",
            "S3_ENDPOINT_URL"
        ];
        const parts: string[] = [];

        for (const key of keys) {
            const value = env[key];

            if (!value) {
                continue;
            }

            const escaped = value.replace(/\\/g, "\\\\").replace(/"/g, "\\\"");
            parts.push(`export ${key}="${escaped}"`);
        }

        return parts.join("; ");
    }

    /**
     * Parses a duration string into seconds for curl.
     *
     * @param timeout Optional timeout like 60s
     * @returns Seconds as integer string
     */
    function parseTimeoutSeconds(timeout?: string): string {
        if (!timeout) {
            return "60";
        }

        const match = /^(\d+)s$/.exec(timeout.trim());

        if (match) {
            return match[1];
        }

        return "60";
    }
}
