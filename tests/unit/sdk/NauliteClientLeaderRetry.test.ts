import { describe, expect, it, vi } from "vitest";

import { NauliteClient } from "../../../packages/sdk/src/NauliteClient";

describe("NauliteClient leader retry", () => {
    it("retries mutating requests on another control plane instance", async () => {
        const fetchImpl = vi.fn(async (url: string) => {
            if (url.includes("control-plane-1")) {
                return new Response(JSON.stringify({
                    message: "Cluster leader is unavailable. Retry the request on the leader instance.",
                    error: "not_leader",
                    leaderId: "cp-2"
                }), { status: 503 });
            }

            return new Response(JSON.stringify({
                instanceId: "minimal:web-1",
                status: "dispatched"
            }), { status: 200 });
        });

        const client = new NauliteClient({
            controlPlaneInstances: [
                "http://control-plane-1:8080",
                "http://control-plane-2:8080"
            ],
            fetchImpl
        });

        const result = await client.reconcileInstance("minimal:web-1");

        expect(result.status).toBe("dispatched");
        expect(fetchImpl).toHaveBeenCalledTimes(2);
        expect(String(fetchImpl.mock.calls[1]?.[0])).toContain("control-plane-2");
    });
});
