import type { PipelineNotificationEvent } from "../providers/NotificationProvider";

/**
 * Neutral JSON payload for pipeline notification delivery.
 */
export interface PipelineNotificationPayload {
    kind: PipelineNotificationEvent["kind"];
    runId: string;
    workflowId?: string;
    manifestName?: string;
    serviceName?: string;
    app: string;
    imageRef?: string;
    commitSha?: string;
    shortCommitSha?: string;
    branch?: string;
    pool?: string;
    poolLabel: string;
    nodeId?: string;
    nodeHostname?: string;
    stepName?: string;
    exitCode?: number;
    message: string;
    failureLog?: string;
    workflowLabel?: string;
    createdAt: string;
    localTime: string;
    timePrefix: string;
    metadata?: Record<string, unknown>;
}

/**
 * Builds provider-neutral pipeline notification payloads from normalized events.
 */
export namespace PipelineNotificationPayload {
    /**
     * Builds a neutral JSON payload from a pipeline notification event.
     *
     * @param event Normalized pipeline notification payload
     * @returns Provider-neutral notification payload
     */
    export function build(event: PipelineNotificationEvent): PipelineNotificationPayload {
        const poolLabel = event.pool ? `[${event.pool}]` : "";
        const localTime = formatLocalTime(event.createdAt);
        const timePrefix = localTime ? `[${localTime}]${poolLabel}` : poolLabel;
        const app = event.serviceName ?? event.manifestName ?? "app";
        const shortCommitSha = event.commitSha?.slice(0, 8);
        const workflowLabel = event.workflowId ? `workflow ${event.workflowId}` : undefined;

        return {
            kind: event.kind,
            runId: event.runId,
            workflowId: event.workflowId,
            manifestName: event.manifestName,
            serviceName: event.serviceName,
            app,
            imageRef: event.imageRef,
            commitSha: event.commitSha,
            shortCommitSha,
            branch: event.branch,
            pool: event.pool,
            poolLabel,
            nodeId: event.nodeId,
            nodeHostname: event.nodeHostname,
            stepName: event.stepName,
            exitCode: event.exitCode,
            message: event.message,
            failureLog: event.failureLog,
            workflowLabel,
            createdAt: event.createdAt,
            localTime,
            timePrefix,
            metadata: event.metadata
        };
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
