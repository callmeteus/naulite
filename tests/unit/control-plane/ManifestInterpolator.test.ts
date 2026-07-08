import { describe, expect, it } from "vitest";

import { ManifestInterpolator } from "../../../packages/control-plane/src/gitops/ManifestInterpolator";

describe("ManifestInterpolator", () => {
    it("interpolates ${VAR} in nested strings", () => {
        const input = {
            services: {
                api: {
                    image: "ghcr.io/acme/api:${VERSION}",
                    environment: {
                        LOG_LEVEL: "${LOG_LEVEL:-info}"
                    }
                }
            }
        };

        const out = ManifestInterpolator.interpolate(input, {
            vars: { VERSION: "2026.07.07" }
        }) as any;

        expect(out.services.api.image).toBe("ghcr.io/acme/api:2026.07.07");
        expect(out.services.api.environment.LOG_LEVEL).toBe("info");
    });

    it("throws on missing ${VAR} without default (strict)", () => {
        expect(() => {
            ManifestInterpolator.interpolate(
                { services: { api: { image: "api:${MISSING}" } } },
                { vars: {}, strict: true }
            );
        }).toThrow(/Variável obrigatória não definida: MISSING/);
    });

    it("coerces deploy.replicas string to number when valid", () => {
        const doc = {
            services: {
                api: {
                    deploy: {
                        replicas: "5"
                    }
                }
            }
        };

        const out = ManifestInterpolator.coerceNumericFields(doc) as any;
        expect(out.services.api.deploy.replicas).toBe(5);
    });

    it("does not coerce invalid replicas values", () => {
        const doc = {
            services: {
                api: {
                    deploy: {
                        replicas: "0"
                    }
                }
            }
        };

        const out = ManifestInterpolator.coerceNumericFields(doc) as any;
        expect(out.services.api.deploy.replicas).toBe("0");
    });
});

