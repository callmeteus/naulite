import type { NotificationProvider, PipelineNotificationEvent } from "@naulite/shared";

import { NotificationProviderFilterStore } from "../database/NotificationProviderFilterStore";
import { Logger } from "../Logger";
const log_pipeline = Logger.create("pipeline");


/**
 * Dispatches pipeline notifications to registered notification providers.
 */
export namespace RunNotificationDispatcher {
    const providers = new Map<string, NotificationProvider>();

    /**
     * Registers a notification provider sink.
     *
     * @param id Provider identifier
     * @param provider Notification provider implementation
     * @returns Nothing.
     */
    export function register(id: string, provider: NotificationProvider): void {
        providers.set(id, provider);
        log_pipeline.debug("notification provider registered id=%s count=%d", id, providers.size);
    }

    /**
     * Returns the number of registered notification providers.
     *
     * @returns Provider count
     */
    export function count(): number {
        return providers.size;
    }

    /**
     * Lists registered notification provider ids.
     *
     * @returns Sorted provider ids
     */
    export function listIds(): string[] {
        return [...providers.keys()].sort((left, right) => left.localeCompare(right));
    }

    /**
     * Clears all registered notification providers.
     *
     * @returns Nothing.
     */
    export function resetForTests(): void {
        providers.clear();
    }

    /**
     * Dispatches a pipeline notification to all registered providers.
     *
     * @param event Normalized pipeline notification payload
     * @returns Nothing.
     */
    export async function dispatch(event: PipelineNotificationEvent): Promise<void> {
        if (providers.size === 0) {
            log_pipeline.debug("notification skipped kind=%s providers=0", event.kind);
            return;
        }

        await Promise.all([...providers.entries()].map(async ([id, provider]) => {
            try {
                let allowedKinds: Awaited<ReturnType<typeof NotificationProviderFilterStore.getAllowedKinds>> = null;

                try {
                    allowedKinds = await NotificationProviderFilterStore.getAllowedKinds(id);
                } catch (filterErr) {
                    log_pipeline.debug("notification filter lookup failed id=%s: %O", id, filterErr);
                }

                if (allowedKinds && !allowedKinds.includes(event.kind)) {
                    log_pipeline.debug("notification filtered id=%s kind=%s", id, event.kind);
                    return;
                }

                await provider.onPipelineEvent(event);
            } catch (err) {
                log_pipeline.error("notification provider failed: %O", err);
            }
        }));
    }

    /**
     * Sends a synthetic test notification to every registered provider.
     *
     * @returns Per-provider delivery results
     */
    export async function testPing(): Promise<Array<{ id: string; ok: boolean; error?: string }>> {
        const event = buildTestEvent();

        return Promise.all([...providers.entries()].map(async ([id, provider]) => {
            try {
                await provider.onPipelineEvent(event);
                return { id, ok: true };
            } catch (err) {
                return {
                    id,
                    ok: false,
                    error: err instanceof Error ? err.message : String(err)
                };
            }
        }));
    }

    /**
     * Builds a synthetic pipeline notification used for provider test pings.
     *
     * @returns Test notification payload
     */
    function buildTestEvent(): PipelineNotificationEvent {
        return {
            kind: "ci.build.submitted",
            runId: "notification-test",
            serviceName: "naulite",
            imageRef: "ghcr.io/example/platform:test",
            branch: "main",
            message: "Teste de notificação da plataforma.",
            createdAt: new Date().toISOString()
        };
    }
}
