import type { NotificationProvider, PipelineNotificationEvent } from "@platform/shared";

import { E7MessageFormatter } from "./E7MessageFormatter";

/**
 * Dispatches pipeline notifications to registered notification providers.
 */
export namespace RunNotificationDispatcher {
    const providers = new Set<NotificationProvider>();

    /**
     * Registers a notification provider sink.
     *
     * @param provider Notification provider implementation
     * @returns Nothing.
     */
    export function register(provider: NotificationProvider): void {
        providers.add(provider);
        console.debug("[pipeline] notification provider registered count=%d", providers.size);
    }

    /**
     * Dispatches a pipeline notification to all registered providers.
     *
     * @param event Normalized pipeline notification payload
     * @returns Nothing.
     */
    export async function dispatch(event: PipelineNotificationEvent): Promise<void> {
        if (providers.size === 0) {
            console.debug("[pipeline] notification skipped kind=%s providers=0", event.kind);
            return;
        }

        const text = E7MessageFormatter.format(event);

        await Promise.all([...providers].map(async (provider) => {
            try {
                await provider.onPipelineEvent({
                    ...event,
                    message: text
                });
            } catch (err) {
                console.error("[pipeline] notification provider failed: %O", err);
            }
        }));
    }
}
