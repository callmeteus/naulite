import type { PipelineNotificationEvent } from "@platform/shared";

/**
 * Formats E7-style Slack messages for pipeline events.
 */
export namespace E7MessageFormatter {
    /**
     * Formats a pipeline notification for Slack or webhook delivery.
     *
     * @param event Normalized pipeline notification payload
     * @returns Human-readable Slack message text
     */
    export function format(event: PipelineNotificationEvent): string {
        const pool = event.pool ? `[${event.pool}]` : "";
        const time = formatLocalTime(event.createdAt);
        const prefix = time ? `[${time}]${pool}` : pool;
        const app = event.serviceName ?? event.manifestName ?? "app";
        const shortSha = event.commitSha?.slice(0, 8);
        const workflow = event.workflowId ? `workflow ${event.workflowId}` : undefined;

        switch (event.kind) {
            case "ci.build.submitted":
                return `${prefix} :hourglass_flowing_sand: CI build submitted ${app} | ${event.imageRef ?? "-"} @ ${event.branch ?? "main"}${workflow ? ` | ${workflow}` : ""}`.trim();
            case "image.build.started":
                return `${prefix} :hammer_and_wrench: Image build started ${app} | ${event.imageRef ?? "-"} @ ${event.commitSha ?? "-"} | node ${event.nodeHostname ?? event.nodeId ?? "-"}`;
            case "build.step.started":
            case "build.step.finished":
                return `${prefix} :arrow_forward: Build step ${event.stepName ?? "step"} | ${app}${shortSha ? ` @ ${shortSha}` : ""}${workflow ? ` | ${workflow}` : ""}`.trim();
            case "image.pushed":
                return `${prefix} :white_check_mark: Image pushed ${app} | ${event.imageRef ?? "-"}`;
            case "rollout.started":
                return `${prefix} :hourglass_flowing_sand: Rollout started ${app} | pulling ${event.imageRef ?? "-"} into deployment/${app}`;
            case "rollout.finished":
                return `${prefix} :rocket: Rollout finished ${app} | health Healthy | ${event.imageRef ?? "-"}`;
            case "ci.build.finished":
                return `${prefix} :white_check_mark: Image build finished ${app} Succeeded | ${event.imageRef ?? "-"}${event.pool ? ` | pool ${event.pool}` : ""}${event.nodeHostname ? `, node ${event.nodeHostname}` : ""}`.trim();
            case "ci.pipeline.failed": {
                const header = `${prefix} :x: CI pipeline failed ${app} Failed | ${event.imageRef ?? "-"}${shortSha ? ` @ ${shortSha}` : ""}`;
                const detail = `• ${event.stepName ?? "step"}${event.pool ? ` (pool ${event.pool}` : ""}${event.nodeHostname ? `, node ${event.nodeHostname}` : ""}${event.pool ? ")" : ""}${event.exitCode !== undefined ? `: Error (exit code ${event.exitCode})` : ""}`;
                const log = event.failureLog ? `\n${event.failureLog}` : "";
                return `${header}\n${detail}${log}`;
            }
            case "gitops.sync.started":
                return `${prefix} :hourglass_flowing_sand: GitOps sync started ${app} | manifests rev ${event.commitSha ?? "-"}`;
            case "infra.sync.finished":
                return `${prefix} :memo: Infra sync finished ${app} | health Healthy | rev ${event.commitSha ?? "-"}`;
            case "node.disk_pressure":
                return `${prefix} :rotating_light: Node disk pressure ${event.nodeHostname ?? event.nodeId ?? "-"}${event.pool ? ` | pool ${event.pool}` : ""}`;
            case "node.disk_pressure.cleared":
                return `${prefix} :white_check_mark: Node disk pressure cleared ${event.nodeHostname ?? event.nodeId ?? "-"}${event.pool ? ` | pool ${event.pool}` : ""}`;
            case "node.left_cluster":
                return `${prefix} :x: Node left cluster ${event.nodeHostname ?? event.nodeId ?? "-"}${event.pool ? ` | pool ${event.pool}` : ""}`;
            case "node.joined_cluster":
                return `${prefix} :white_check_mark: Node joined cluster ${event.nodeHostname ?? event.nodeId ?? "-"}`;
            default:
                return `${prefix} ${event.message}`.trim();
        }
    }

    /**
     * Formats a createdAt timestamp as HHhMM in local time.
     *
     * @param iso ISO timestamp
     * @returns Local time label
     */
    function formatLocalTime(iso: string): string {
        const date = new Date(iso);

        if (Number.isNaN(date.getTime())) {
            return "";
        }

        const hours = String(date.getHours()).padStart(2, "0");
        const minutes = String(date.getMinutes()).padStart(2, "0");
        return `${hours}h${minutes}`;
    }
}
