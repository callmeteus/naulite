import { afterEach, describe, expect, it, vi } from "vitest";

import { DatabaseProvider } from "../../../packages/control-plane/src/database/DatabaseProvider";
import { LeaderElection } from "../../../packages/control-plane/src/services/LeaderElection";

describe("LeaderElection", () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it("treats sqlite deployments as always-on leaders", async () => {
        const databaseProvider = {
            getDialect: () => "sqlite" as const
        } as DatabaseProvider;
        const election = new LeaderElection(databaseProvider, "cp-a");

        election.start();
        await election.renewLease();

        expect(election.isLeader()).toBe(true);
        expect(election.getLeaderId()).toBe("cp-a");

        election.stop();
    });

    it("reports follower state when another instance holds the lease", async () => {
        const databaseProvider = {
            getDialect: () => "postgresql" as const
        } as DatabaseProvider;
        const election = new LeaderElection(databaseProvider, "cp-follower", 10_000, 1_000);

        const leaderModel = await import("../../../packages/control-plane/src/database/models/ControlPlaneLeaderModel");
        vi.spyOn(leaderModel.ControlPlaneLeaderModel, "findByPk").mockResolvedValue({
            leaseKey: "control-plane",
            leaderInstanceId: "cp-leader",
            expiresAt: new Date(Date.now() + 60_000).toISOString(),
            updatedAt: new Date().toISOString()
        } as never);
        vi.spyOn(leaderModel.ControlPlaneLeaderModel, "create").mockRejectedValue(new Error("duplicate"));
        vi.spyOn(leaderModel.ControlPlaneLeaderModel, "update").mockResolvedValue([0]);

        await election.renewLease();

        expect(election.isLeader()).toBe(false);
        expect(election.getLeaderId()).toBe("cp-leader");
    });
});
