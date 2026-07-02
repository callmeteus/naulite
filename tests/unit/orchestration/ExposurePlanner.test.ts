import { ExposurePlanner } from "@platform/control-plane";
import type { Manifest, NetworkExposure } from "@platform/shared";
import { describe, expect, it } from "vitest";

describe("ExposurePlanner", () => {
    const planner = new ExposurePlanner();

    it("builds NetBird group names for internal exposures", () => {
        const manifest: Manifest = {
            name: "bookstore",
            services: {
                api: {
                    image: "api:latest",
                    networks: ["internal"],
                    capabilities: [],
                    ingress: {
                        host: "api.internal",
                        exposure: "internal",
                        paths: [{
                            path: "/",
                            port: 8080,
                            protocol: "http"
                        }]
                    }
                }
            },
            volumes: {},
            networks: {},
            registries: {}
        };
        const exposures: NetworkExposure[] = [{
            serviceName: "api",
            port: 8080,
            protocol: "tcp",
            networkName: "internal"
        }];

        const plan = planner.plan(manifest, exposures);

        expect(plan.manifestName).toBe("bookstore");
        expect(plan.entries).toEqual([{
            networkGroupId: "bookstore-internal",
            exposure: exposures[0],
            netbirdGroupName: "internal-bookstore-internal"
        }]);
    });

    it("returns an empty plan when no exposures are provided", () => {
        const manifest: Manifest = {
            name: "minimal",
            services: {
                web: {
                    image: "nginx:1.27-alpine",
                    capabilities: []
                }
            },
            volumes: {},
            networks: {},
            registries: {}
        };

        const plan = planner.plan(manifest, []);

        expect(plan.entries).toEqual([]);
        expect(planner.filterInternalOnly([])).toEqual([]);
    });
});
