import { describe, expect, it } from "vitest";
import { parse as parseYaml } from "yaml";

import { ManifestMerge } from "../../../packages/control-plane/src/gitops/ManifestMerge";

describe("ManifestMerge", () => {
    it("deep-merges service environment maps from an overlay", () => {
        const baseYaml = [
            "name: rushpedia",
            "services:",
            "  backend:",
            "    environment:",
            "      NODE_ENV: production",
            "      DB_HOST: postgres"
        ].join("\n");

        const overlayYaml = [
            "services:",
            "  backend:",
            "    environment:",
            "      NODE_ENV: staging",
            "      LOG_LEVEL: debug"
        ].join("\n");

        const merged = parseYaml(ManifestMerge.mergeYaml(baseYaml, overlayYaml)) as {
            name: string;
            services: {
                backend: {
                    environment: Record<string, string>;
                };
            };
        };

        expect(merged.name).toBe("rushpedia");
        expect(merged.services.backend.environment).toEqual({
            NODE_ENV: "staging",
            DB_HOST: "postgres",
            LOG_LEVEL: "debug"
        });
    });

    it("replaces arrays from the overlay", () => {
        const baseYaml = [
            "services:",
            "  frontend:",
            "    ingress:",
            "      hosts:",
            "        - app.example.com"
        ].join("\n");

        const overlayYaml = [
            "services:",
            "  frontend:",
            "    ingress:",
            "      hosts:",
            "        - staging.example.com"
        ].join("\n");

        const merged = parseYaml(ManifestMerge.mergeYaml(baseYaml, overlayYaml)) as {
            services: {
                frontend: {
                    ingress: {
                        hosts: string[];
                    };
                };
            };
        };

        expect(merged.services.frontend.ingress.hosts).toEqual(["staging.example.com"]);
    });

    it("adds overlay-only top-level services without removing base services", () => {
        const baseYaml = [
            "services:",
            "  api:",
            "    image: api:1"
        ].join("\n");

        const overlayYaml = [
            "services:",
            "  worker:",
            "    image: worker:1"
        ].join("\n");

        const merged = parseYaml(ManifestMerge.mergeYaml(baseYaml, overlayYaml)) as {
            services: Record<string, { image: string }>;
        };

        expect(merged.services.api.image).toBe("api:1");
        expect(merged.services.worker.image).toBe("worker:1");
    });
});
