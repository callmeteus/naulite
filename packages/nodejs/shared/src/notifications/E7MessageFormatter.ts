import type { PipelineNotificationEvent } from "../providers/NotificationProvider";

import { PipelineNotificationPayload } from "./PipelineNotificationPayload";

/**
 * Formats E7-style Slack messages for pipeline events.
 */
export namespace E7MessageFormatter {
    /**
     * Formats a pipeline notification for Slack delivery.
     *
     * @param event Normalized pipeline notification payload
     * @returns Human-readable Slack message text
     */
    export function format(event: PipelineNotificationEvent): string {
        const payload = PipelineNotificationPayload.build(event);

        switch (payload.kind) {
            case "ci.build.submitted":
                return `${payload.timePrefix} :hourglass_flowing_sand: CI build submitted ${payload.app} | ${payload.imageRef ?? "-"} @ ${payload.branch ?? "main"}${payload.workflowLabel ? ` | ${payload.workflowLabel}` : ""}`.trim();
            case "image.build.started":
                return `${payload.timePrefix} :hammer_and_wrench: Image build started ${payload.app} | ${payload.imageRef ?? "-"} @ ${payload.commitSha ?? "-"} | node ${payload.nodeHostname ?? payload.nodeId ?? "-"}`;
            case "build.step.started":
            case "build.step.finished":
                return `${payload.timePrefix} :arrow_forward: Build step ${payload.stepName ?? "step"} | ${payload.app}${payload.shortCommitSha ? ` @ ${payload.shortCommitSha}` : ""}${payload.workflowLabel ? ` | ${payload.workflowLabel}` : ""}`.trim();
            case "image.pushed":
                return `${payload.timePrefix} :white_check_mark: Image pushed ${payload.app} | ${payload.imageRef ?? "-"}`;
            case "rollout.started":
                return `${payload.timePrefix} :hourglass_flowing_sand: Rollout started ${payload.app} | pulling ${payload.imageRef ?? "-"} into deployment/${payload.app}`;
            case "rollout.finished":
                return `${payload.timePrefix} :rocket: Rollout finished ${payload.app} | health Healthy | ${payload.imageRef ?? "-"}`;
            case "ci.build.finished":
                return `${payload.timePrefix} :white_check_mark: Image build finished ${payload.app} Succeeded | ${payload.imageRef ?? "-"}${payload.pool ? ` | pool ${payload.pool}` : ""}${payload.nodeHostname ? `, node ${payload.nodeHostname}` : ""}`.trim();
            case "ci.pipeline.failed": {
                const header = `${payload.timePrefix} :x: CI pipeline failed ${payload.app} Failed | ${payload.imageRef ?? "-"}${payload.shortCommitSha ? ` @ ${payload.shortCommitSha}` : ""}`;
                const detail = `• ${payload.stepName ?? "step"}${payload.pool ? ` (pool ${payload.pool}` : ""}${payload.nodeHostname ? `, node ${payload.nodeHostname}` : ""}${payload.pool ? ")" : ""}${payload.exitCode !== undefined ? `: Error (exit code ${payload.exitCode})` : ""}`;
                const log = payload.failureLog ? `\n${payload.failureLog}` : "";
                return `${header}\n${detail}${log}`;
            }

            case "gitops.sync.started":
                return `${payload.timePrefix} :hourglass_flowing_sand: GitOps sync started ${payload.app} | manifests rev ${payload.commitSha ?? "-"}`;
            case "infra.sync.finished":
                return `${payload.timePrefix} :memo: Infra sync finished ${payload.app} | health Healthy | rev ${payload.commitSha ?? "-"}`;
            case "node.disk_pressure":
                return `${payload.timePrefix} :rotating_light: Node disk pressure ${payload.nodeHostname ?? payload.nodeId ?? "-"}${payload.pool ? ` | pool ${payload.pool}` : ""}`;
            case "node.disk_pressure.cleared":
                return `${payload.timePrefix} :white_check_mark: Node disk pressure cleared ${payload.nodeHostname ?? payload.nodeId ?? "-"}${payload.pool ? ` | pool ${payload.pool}` : ""}`;
            case "node.left_cluster":
                return `${payload.timePrefix} :x: Node left cluster ${payload.nodeHostname ?? payload.nodeId ?? "-"}${payload.pool ? ` | pool ${payload.pool}` : ""}`;
            case "node.joined_cluster":
                return `${payload.timePrefix} :white_check_mark: Node joined cluster ${payload.nodeHostname ?? payload.nodeId ?? "-"}`;
            default:
                return `${payload.timePrefix} ${payload.message}`.trim();
        }
    }
}
