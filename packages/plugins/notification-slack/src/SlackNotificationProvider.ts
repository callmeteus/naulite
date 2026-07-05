import type { NotificationProvider, PipelineNotificationEvent } from "@naulite/shared";
import { E7MessageFormatter } from "@naulite/shared";

/**
 * Slack webhook notification provider for pipeline events.
 */
export class SlackNotificationProvider implements NotificationProvider {
    private readonly webhookUrl: string;
    private readonly fetchImpl: typeof fetch;

    /**
     * Creates a Slack notification provider.
     *
     * @param options Provider configuration
     */
    constructor(options: {
        webhookUrl: string;
        fetchImpl?: typeof fetch;
    }) {
        this.webhookUrl = options.webhookUrl;
        this.fetchImpl = options.fetchImpl ?? fetch;
    }

    /**
     * Posts a formatted pipeline event to the configured Slack webhook.
     *
     * @param event Normalized pipeline notification payload
     * @returns Nothing.
     */
    async onPipelineEvent(event: PipelineNotificationEvent): Promise<void> {
        if (!this.webhookUrl) {
            console.debug("[slack] skipped kind=%s webhook=unset", event.kind);
            return;
        }

        console.debug(
            "[slack] pipeline event kind=%s runId=%s",
            event.kind,
            event.runId
        );

        const text = E7MessageFormatter.format(event);

        const response = await this.fetchImpl(this.webhookUrl, {
            method: "POST",
            headers: {
                "content-type": "application/json"
            },
            body: JSON.stringify({
                text
            })
        });

        if (!response.ok) {
            throw new Error(`Slack webhook failed with status ${response.status}`);
        }
    }
}

/**
 * Shared Slack notification provider instance resolved from environment.
 */
export const slackNotificationProvider = new SlackNotificationProvider({
    webhookUrl: process.env.NAULITE_SLACK_WEBHOOK_URL
        ?? process.env.SLACK_WEBHOOK_URL
        ?? ""
});
