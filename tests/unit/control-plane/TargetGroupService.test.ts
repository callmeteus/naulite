import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import type { ControlPlaneContext } from "../../../packages/control-plane/src/ControlPlaneContext";
import { ControlPlaneService } from "../../../packages/control-plane/src/ControlPlaneService";
import { DatabaseProvider } from "../../../packages/control-plane/src/database/DatabaseProvider";
import { ControlPlaneStore } from "../../../packages/control-plane/src/database/ControlPlaneStore";
import { HTTP409Error } from "../../../packages/control-plane/src/errors/TreatedError";
import { TargetGroupService } from "../../../packages/control-plane/src/services/TargetGroupService";

describe("TargetGroupService", () => {
    let databaseProvider: DatabaseProvider | undefined;

    afterEach(async () => {
        if (databaseProvider) {
            await databaseProvider.disconnect();
            databaseProvider = undefined;
        }
    });

    /**
     * Connects an isolated sqlite database and installs the store.
     *
     * @returns Nothing.
     */
    async function connectDatabase(): Promise<void> {
        const tempDir = await mkdtemp(path.join(os.tmpdir(), "naulite-target-groups-"));
        databaseProvider = new DatabaseProvider();

        await databaseProvider.connect({
            dialect: "sqlite",
            url: `sqlite://${path.join(tempDir, "control-plane.db")}`
        });

        await databaseProvider.migrate();

        ControlPlaneService.install({
            store: new ControlPlaneStore()
        } as ControlPlaneContext);
    }

    it("creates a target group", async () => {
        await connectDatabase();

        const group = await TargetGroupService.create({
            id: "edge-nodes",
            name: "Edge nodes",
            memberNodeIds: []
        });

        expect(group.id).toBe("edge-nodes");
        expect(group.name).toBe("Edge nodes");
        expect(group.memberNodeIds).toEqual([]);
    });

    it("rejects a duplicate target group id", async () => {
        await connectDatabase();

        await TargetGroupService.create({
            id: "edge-nodes",
            name: "Edge nodes",
            memberNodeIds: []
        });

        await expect(TargetGroupService.create({
            id: "edge-nodes",
            name: "Edge nodes copy",
            memberNodeIds: []
        })).rejects.toBeInstanceOf(HTTP409Error);
    });
});
