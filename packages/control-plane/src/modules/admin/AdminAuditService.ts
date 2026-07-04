import { randomUUID } from "node:crypto";

import { AdminAuditLogModel } from "../../database/models/AdminAuditLogModel";

/**
 * Persists admin security audit events.
 */
export namespace AdminAuditService {
    /**
     * Records an audit log entry.
     *
     * @param input Audit event payload
     * @returns Nothing.
     */
    export async function record(input: {
        action: string;
        actorUserId?: string | null;
        detail?: Record<string, unknown>;
    }): Promise<void> {
        try {
            await AdminAuditLogModel.create({
                id: randomUUID(),
                action: input.action,
                actorUserId: input.actorUserId ?? null,
                detailJson: input.detail ? JSON.stringify(input.detail) : null,
                createdAt: new Date().toISOString()
            });
        } catch (err) {
            console.error("[admin-audit] record failed: %O", err);
        }
    }
}
