import { afterEach, describe, expect, it, vi } from "vitest";

import { createApp } from "../../../packages/control-plane/src/App";
import type { ControlPlaneContext } from "../../../packages/control-plane/src/ControlPlaneContext";
import { PrometheusClient } from "../../../packages/control-plane/src/metrics/PrometheusClient";

/**
 * Builds a minimal control plane context for PromQL proxy route tests.
 *
 * @returns Mocked control plane context
 */
function createPromqlTestContext(): ControlPlaneContext {
    return {
        store: {
            validateApiKey: vi.fn(async () => true),
            getClusterSecretValues: vi.fn(async () => ({}))
        },
        leaderElection: {
            isLeader: () => true,
            getLeaderId: () => "cp-test"
        },
        netBirdEnrollment: {
            ensureSetupKey: vi.fn(async () => "setup-key")
        }
    } as unknown as ControlPlaneContext;
}

describe("metrics promql proxy routes", () => {
    afterEach(() => {
        vi.restoreAllMocks();
        delete process.env.PROMETHEUS_URL;
    });

    it("proxies instant queries to Prometheus", async () => {
        const proxySpy = vi.spyOn(PrometheusClient, "proxyGet").mockResolvedValue({
            status: "success",
            data: { resultType: "vector", result: [] }
        });

        const app = await createApp({
            context: createPromqlTestContext(),
            logger: false
        });

        const response = await app.inject({
            method: "GET",
            url: "/metrics/query?query=up",
            remoteAddress: "127.0.0.1"
        });

        expect(response.statusCode).toBe(200);
        expect(proxySpy).toHaveBeenCalledWith("/api/v1/query", {
            query: "up",
            time: undefined
        });

        await app.close();
    });

    it("proxies range queries to Prometheus", async () => {
        const proxySpy = vi.spyOn(PrometheusClient, "proxyGet").mockResolvedValue({
            status: "success",
            data: { resultType: "matrix", result: [] }
        });

        const app = await createApp({
            context: createPromqlTestContext(),
            logger: false
        });

        const response = await app.inject({
            method: "GET",
            url: "/metrics/query_range?query=up&start=1&end=2&step=15s",
            remoteAddress: "127.0.0.1"
        });

        expect(response.statusCode).toBe(200);
        expect(proxySpy).toHaveBeenCalledWith("/api/v1/query_range", {
            query: "up",
            start: "1",
            end: "2",
            step: "15s"
        });

        await app.close();
    });

    it("proxies label discovery to Prometheus", async () => {
        const proxySpy = vi.spyOn(PrometheusClient, "proxyGet").mockResolvedValue({
            status: "success",
            data: ["__name__", "job"]
        });

        const app = await createApp({
            context: createPromqlTestContext(),
            logger: false
        });

        const response = await app.inject({
            method: "GET",
            url: "/metrics/labels",
            remoteAddress: "127.0.0.1"
        });

        expect(response.statusCode).toBe(200);
        expect(proxySpy).toHaveBeenCalledWith("/api/v1/labels", {
            start: undefined,
            end: undefined,
            "match[]": undefined
        });

        await app.close();
    });
});
