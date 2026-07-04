import { createHmac } from "node:crypto";

import type { NotificationProvider, PipelineNotificationEvent } from "@platform/shared";
import { PipelineNotificationPayload } from "@platform/shared";

const SIGNATURE_HEADER = "x-platform-signature";

/**
 * Generic webhook notification provider for pipeline events.
 */
export class WebhookNotificationProvider implements NotificationProvider {
    private readonly webhookUrl: string;
    private readonly webhookSecret: string;
    private readonly fetchImpl: typeof fetch;

    /**
     * Creates a webhook notification provider.
     *
     * @param options Provider configuration
     */
    constructor(options: {
        webhookUrl: string;
        webhookSecret?: string;
        fetchImpl?: typeof fetch;
    }) {
        this.webhookUrl = options.webhookUrl;
        this.webhookSecret = options.webhookSecret?.trim() ?? "";
        this.fetchImpl = options.fetchImpl ?? fetch;
    }

    /**
     * Posts a JSON pipeline event payload to the configured webhook URL.
     *
     * @param event Normalized pipeline notification payload
     * @returns Nothing.
     */
    async onPipelineEvent(event: PipelineNotificationEvent): Promise<void> {
        if (!this.webhookUrl) {
            console.debug("[webhook] skipped kind=%s webhook=unset", event.kind);
            return;
        }

        console.debug(
            "[webhook] pipeline event kind=%s runId=%s",
            event.kind,
            event.runId
        );

        const body = JSON.stringify(PipelineNotificationPayload.build(event));
        const headers: Record<string, string> = {
            "content-type": "application/json"
        };

        if (this.webhookSecret) {
            const digest = createHmac("sha256", this.webhookSecret)
                .update(body)
                .digest("hex");
            headers[SIGNATURE_HEADER] = `sha256=${digest}`;
        }

        const response = await this.fetchImpl(this.webhookUrl, {
            method: "POST",
            headers,
            body
        });

        if (!response.ok) {
            throw new Error(`Webhook notification failed with status ${response.status}`);
        }
    }
}

/**
 * Shared webhook notification provider instance resolved from environment.
 */
export const webhookNotificationProvider = new WebhookNotificationProvider({
    webhookUrl: process.env.PLATFORM_WEBHOOK_URL
        ?? process.env.WEBHOOK_URL
        ?? "",
    webhookSecret: process.env.PLATFORM_WEBHOOK_SECRET
});
