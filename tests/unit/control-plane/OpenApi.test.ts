import { describe, expect, it, vi } from "vitest";

import { createApp } from "../../../packages/control-plane/src/App";
import type { ControlPlaneContext } from "../../../packages/control-plane/src/ControlPlaneContext";

/**
 * Builds a minimal control plane context for OpenAPI smoke tests.
 *
 * @returns Mocked control plane context
 */
function createOpenApiTestContext(): ControlPlaneContext {
    return {
        store: {
            validateApiKey: vi.fn(async () => true),
            getClusterSecretValues: vi.fn(async () => ({}))
        }
    } as unknown as ControlPlaneContext;
}

describe("control plane OpenAPI", () => {
    it("exposes swagger JSON at /docs/json", async () => {
        const app = await createApp({
            context: createOpenApiTestContext(),
            logger: false
        });

        const response = await app.inject({
            method: "GET",
            url: "/docs/json"
        });

        expect(response.statusCode).toBe(200);

        const body = response.json() as {
            openapi?: string;
            info?: { title?: string };
        };

        expect(body.openapi).toBe("3.1.0");
        expect(body.info?.title).toBe("Naulite Control Plane API");

        await app.close();
    });
});
