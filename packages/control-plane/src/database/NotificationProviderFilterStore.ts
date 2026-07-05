import type { PipelineEventKind } from "@naulite/shared";

import { NotificationProviderFilterModel } from "./models/NotificationProviderFilterModel";

/**
 * Persists notification provider event filters.
 */
export namespace NotificationProviderFilterStore {
    /**
     * Returns allowed event kinds for a provider, or null when all events are allowed.
     *
     * @param providerId Notification provider identifier
     * @returns Allowed kinds, or null when unfiltered
     */
    export async function getAllowedKinds(providerId: string): Promise<PipelineEventKind[] | null> {
        const row = await NotificationProviderFilterModel.findByPk(providerId);

        if (!row || row.allowedKinds.length === 0) {
            return null;
        }

        return row.allowedKinds as PipelineEventKind[];
    }

    /**
     * Upserts allowed event kinds for a provider.
     *
     * @param providerId Notification provider identifier
     * @param allowedKinds Pipeline event kinds to deliver
     * @returns Nothing.
     */
    export async function setAllowedKinds(
        providerId: string,
        allowedKinds: PipelineEventKind[]
    ): Promise<void> {
        const updatedAt = new Date().toISOString();
        const existing = await NotificationProviderFilterModel.findByPk(providerId);

        if (existing) {
            await existing.update({
                allowedKinds,
                updatedAt
            });
            return;
        }

        await NotificationProviderFilterModel.create({
            providerId,
            allowedKinds,
            updatedAt
        });
    }
}
