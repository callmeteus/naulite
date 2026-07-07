import type { NotificationProvider, PipelineEventKind, PipelineNotificationEvent } from "@naulite/shared";

import { Logger } from "../Logger";
const log_pipeline = Logger.create("pipeline");

interface RegisteredNotificationProvider {
    provider: NotificationProvider;
    allowedKinds: PipelineEventKind[] | null;
}

/**
 * Dispatches pipeline notifications to registered notification providers.
 */
export namespace RunNotificationDispatcher {
    const providers = new Map<string, RegisteredNotificationProvider>();

    /**
     * Registers a notification provider sink.
     *
     * @param id Provider identifier
     * @param provider Notification provider implementation
     * @param allowedKinds Allowed event kinds, or null when all events are allowed
     * @returns Nothing.
     */
    export function register(
        id: string,
        provider: NotificationProvider,
        allowedKinds: PipelineEventKind[] | null = null
    ): void {
        providers.set(id, { provider, allowedKinds });
        log_pipeline.debug("notification provider registered id=%s count=%d", id, providers.size);
    }

    /**
     * Replaces all registered notification providers.
     *
     * @param entries Destination providers to register
     * @returns Nothing.
     */
    export function replaceAll(entries: Array<{
        id: string;
        provider: NotificationProvider;
        allowedKinds: PipelineEventKind[] | null;
    }>): void {
        providers.clear();

        for (const entry of entries) {
            register(entry.id, entry.provider, entry.allowedKinds);
        }
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

        await Promise.all([...providers.entries()].map(async ([id, entry]) => {
            try {
                if (entry.allowedKinds && !entry.allowedKinds.includes(event.kind)) {
                    log_pipeline.debug("notification filtered id=%s kind=%s", id, event.kind);
                    return;
                }

                await entry.provider.onPipelineEvent(event);
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

        return Promise.all([...providers.entries()].map(async ([id, entry]) => {
            try {
                await entry.provider.onPipelineEvent(event);
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
     * Sends a synthetic test notification to a single provider.
     *
     * @param id Provider identifier
     * @returns Delivery result
     */
    export async function testPingForId(id: string): Promise<{ id: string; ok: boolean; error?: string }> {
        const entry = providers.get(id);

        if (!entry) {
            return {
                id,
                ok: false,
                error: "Notification destination is not registered."
            };
        }

        const event = buildTestEvent();

        try {
            await entry.provider.onPipelineEvent(event);
            return { id, ok: true };
        } catch (err) {
            return {
                id,
                ok: false,
                error: err instanceof Error ? err.message : String(err)
            };
        }
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
