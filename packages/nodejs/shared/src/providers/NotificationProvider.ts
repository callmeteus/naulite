import type { PipelineEventKindSchema } from "../schemas/PipelineRun";
import type { z } from "zod";

/**
 * Pipeline notification payload dispatched to external sinks.
 */
export interface PipelineNotificationEvent {
    kind: z.infer<typeof PipelineEventKindSchema>;
    runId: string;
    workflowId?: string;
    manifestName?: string;
    serviceName?: string;
    imageRef?: string;
    commitSha?: string;
    branch?: string;
    pool?: string;
    nodeId?: string;
    nodeHostname?: string;
    stepName?: string;
    exitCode?: number;
    message: string;
    failureLog?: string;
    metadata?: Record<string, unknown>;
    createdAt: string;
}

/**
 * Notification plugin contract for Slack/webhook sinks.
 */
export interface NotificationProvider {
    /**
     * Delivers a pipeline event to an external notification channel.
     *
     * @param event Normalized pipeline notification payload
     * @returns Nothing.
     */
    onPipelineEvent(event: PipelineNotificationEvent): Promise<void>;
}
