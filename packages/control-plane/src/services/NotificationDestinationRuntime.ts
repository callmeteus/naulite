import { SlackNotificationProvider } from "@naulite/plugin-notification-slack";
import { WebhookNotificationProvider } from "@naulite/plugin-notification-webhook";
import type { NotificationProvider } from "@naulite/shared";

import { NotificationDestinationStore } from "../database/NotificationDestinationStore";
import { RunNotificationDispatcher } from "./RunNotificationDispatcher";
import { Logger } from "../Logger";

const log_notifications = Logger.create("notifications");

/**
 * Hydrates notification destinations from the database into the dispatcher.
 */
export namespace NotificationDestinationRuntime {
    /**
     * Reloads enabled destinations from the database.
     *
     * @returns Nothing.
     */
    export async function syncFromDatabase(): Promise<void> {
        const destinations = await NotificationDestinationStore.listEnabled();
        const entries = destinations.map((destination) => ({
            id: destination.id,
            provider: createProvider(destination),
            allowedKinds: destination.allowedKinds.length === 0
                ? null
                : destination.allowedKinds
        }));

        RunNotificationDispatcher.replaceAll(entries);
        log_notifications.debug("destinations synced count=%d", entries.length);
    }

    /**
     * Sends a synthetic test notification to a destination record.
     *
     * @param destination Destination record
     * @returns Delivery result
     */
    export async function sendTest(destination: {
        id: string;
        type: "SLACK" | "WEBHOOK";
        url: string;
        secret: string | null;
    }): Promise<{ id: string; ok: boolean; error?: string }> {
        const provider = createProvider(destination);
        const event = {
            kind: "ci.build.submitted" as const,
            runId: "notification-test",
            serviceName: "naulite",
            imageRef: "ghcr.io/example/platform:test",
            branch: "main",
            message: "Teste de notificação da plataforma.",
            createdAt: new Date().toISOString()
        };

        try {
            await provider.onPipelineEvent(event);
            return { id: destination.id, ok: true };
        } catch (err) {
            return {
                id: destination.id,
                ok: false,
                error: err instanceof Error ? err.message : String(err)
            };
        }
    }

    /**
     * Builds a notification provider for a destination row.
     *
     * @param destination Destination record
     * @returns Notification provider implementation
     */
    function createProvider(destination: {
        type: "SLACK" | "WEBHOOK";
        url: string;
        secret: string | null;
    }): NotificationProvider {
        if (destination.type === "SLACK") {
            return new SlackNotificationProvider({
                webhookUrl: destination.url
            });
        }

        return new WebhookNotificationProvider({
            webhookUrl: destination.url,
            webhookSecret: destination.secret ?? undefined
        });
    }
}
