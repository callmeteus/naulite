import { ClusterStateModel } from "../database/models/index";

const APPLY_REVISION_KEY = "apply_revision";

/**
 * Shared cluster state persisted for HA control plane replicas.
 */
export namespace ClusterStateService {
    /**
     * Loads the persisted apply revision counter.
     *
     * @returns Current apply revision
     */
    export async function loadApplyRevision(): Promise<number> {
        const row = await ClusterStateModel.findByPk(APPLY_REVISION_KEY);

        if (!row) {
            return 0;
        }

        const parsed = Number.parseInt(row.value, 10);
        return Number.isFinite(parsed) ? parsed : 0;
    }

    /**
     * Persists the apply revision counter.
     *
     * @param revision Apply revision value
     * @returns Nothing.
     */
    export async function saveApplyRevision(revision: number): Promise<void> {
        const now = new Date().toISOString();

        await ClusterStateModel.upsert({
            key: APPLY_REVISION_KEY,
            value: String(revision),
            updatedAt: now
        });
        console.debug("[cluster-state] saved applyRevision=%d", revision);
    }
}
