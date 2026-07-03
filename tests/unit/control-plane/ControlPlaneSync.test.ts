import { afterEach, describe, expect, it, vi } from "vitest";

import { ControlPlaneSync } from "../../../packages/control-plane/src/services/ControlPlaneSync";

describe("ControlPlaneSync", () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it("notifies wildcard and typed subscribers for remote events", async () => {
        const databaseProvider = {
            getDialect: () => "postgresql" as const
        };
        const sync = new ControlPlaneSync(databaseProvider as never, "cp-local");
        const typed = vi.fn();
        const wildcard = vi.fn();

        sync.on("secret.changed", typed);
        sync.on("*", wildcard);

        const eventModel = await import("../../../packages/control-plane/src/database/models/ControlPlaneEventModel");
        vi.spyOn(eventModel.ControlPlaneEventModel, "findAll").mockResolvedValue([
            {
                id: 7,
                eventType: "secret.changed",
                payload: { name: "db" },
                sourceInstanceId: "cp-remote",
                createdAt: "2026-07-02T00:00:00.000Z"
            }
        ] as never);

        await sync.poll();

        expect(typed).toHaveBeenCalledWith(expect.objectContaining({
            id: 7,
            eventType: "secret.changed",
            payload: { name: "db" }
        }));
        expect(wildcard).toHaveBeenCalledTimes(1);
    });

    it("skips events published by the same instance", async () => {
        const databaseProvider = {
            getDialect: () => "postgresql" as const
        };
        const sync = new ControlPlaneSync(databaseProvider as never, "cp-local");
        const listener = vi.fn();

        sync.subscribe("apply.revision.changed", listener);

        const eventModel = await import("../../../packages/control-plane/src/database/models/ControlPlaneEventModel");
        vi.spyOn(eventModel.ControlPlaneEventModel, "findAll").mockResolvedValue([
            {
                id: 3,
                eventType: "apply.revision.changed",
                payload: { revision: 2 },
                sourceInstanceId: "cp-local",
                createdAt: "2026-07-02T00:00:00.000Z"
            }
        ] as never);

        await sync.poll();

        expect(listener).not.toHaveBeenCalled();
    });
});
