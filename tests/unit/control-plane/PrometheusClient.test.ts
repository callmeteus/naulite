import { afterEach, describe, expect, it, vi } from "vitest";

import { HTTP502Error } from "../../../packages/control-plane/src/errors/TreatedError";
import { PrometheusClient } from "../../../packages/control-plane/src/metrics/PrometheusClient";

describe("PrometheusClient", () => {
    afterEach(() => {
        vi.restoreAllMocks();
        delete process.env.PROMETHEUS_URL;
    });

    it("proxies GET requests to the configured Prometheus base URL", async () => {
        process.env.PROMETHEUS_URL = "http://prom.test:9090";

        const fetchMock = vi.fn(async () => new Response(JSON.stringify({ status: "success" }), {
            status: 200,
            headers: { "Content-Type": "application/json" }
        }));
        vi.stubGlobal("fetch", fetchMock);

        const body = await PrometheusClient.proxyGet("/api/v1/query", {
            query: "up"
        });

        expect(body).toEqual({ status: "success" });
        expect(fetchMock).toHaveBeenCalledWith(expect.objectContaining({
            href: "http://prom.test:9090/api/v1/query?query=up"
        }));
    });

    it("throws HTTP502Error when Prometheus is unreachable", async () => {
        vi.stubGlobal("fetch", vi.fn(async () => {
            throw new Error("connection refused");
        }));

        await expect(
            PrometheusClient.proxyGet("/api/v1/query", { query: "up" })
        ).rejects.toBeInstanceOf(HTTP502Error);
    });
});
