import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { DatabaseProvider } from "../../../packages/control-plane/src/database/DatabaseProvider";
import { GatewayRouteService } from "../../../packages/control-plane/src/services/GatewayRouteService";
import { LeaderElection } from "../../../packages/control-plane/src/services/LeaderElection";
import { ControlPlaneSync } from "../../../packages/control-plane/src/services/ControlPlaneSync";
import { createTraefikNetBirdGatewayProvider } from "@naulite/gateway";

describe("GatewayRouteService", () => {
    let databaseProvider: DatabaseProvider;
    let storagePath = "";

    afterEach(async () => {
        if (databaseProvider) {
            await databaseProvider.disconnect();
        }
    });

    it("persists routes and pushes Traefik config on the leader", async () => {
        const tempDir = await mkdtemp(path.join(os.tmpdir(), "naulite-gateway-route-"));
        storagePath = path.join(tempDir, "gateway.sqlite");
        databaseProvider = new DatabaseProvider();
        await databaseProvider.connect({ dialect: "sqlite", url: `sqlite://${storagePath}` });
        await databaseProvider.migrate();

        const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 200 }));
        const traefik = createTraefikNetBirdGatewayProvider({
            traefikDynamicConfigUrl: "http://traefik.test/naulite/dynamic-config",
            fetchImpl
        });
        const leaderElection = new LeaderElection(databaseProvider, "cp-test");
        leaderElection.start();
        const controlPlaneSync = new ControlPlaneSync(databaseProvider, "cp-test");
        const service = new GatewayRouteService(traefik, leaderElection, controlPlaneSync);

        await service.upsertRoute({
            serviceName: "web",
            ingress: {
                host: "app.test.local",
                exposure: "public",
                paths: [{ path: "/", port: 80 }]
            },
            targetHost: "agent-1",
            targetPort: 8080
        });

        const routes = await service.listRoutes();
        expect(routes.items).toHaveLength(1);
        expect(routes.items[0]?.host).toBe("app.test.local");
        expect(fetchImpl).toHaveBeenCalled();
    });
});
