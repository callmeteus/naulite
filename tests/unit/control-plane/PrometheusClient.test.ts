import { afterEach, describe, expect, it, vi } from "vitest";

import { HTTP503Error } from "../../../packages/control-plane/src/errors/TreatedError";
import { PrometheusClient } from "../../../packages/control-plane/src/metrics/PrometheusClient";

describe("PrometheusClient", () => {
    afterEach(() => {
        vi.restoreAllMocks();
        delete process.env.PROMETHEUS_URL;
        delete process.env.NAULITE_NETBIRD_MOCK;
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

    it("throws HTTP503Error when Prometheus is unreachable", async () => {
        process.env.PROMETHEUS_URL = "http://prom.test:9090";

        vi.stubGlobal("fetch", vi.fn(async () => {
            throw new Error("connection refused");
        }));

        await expect(
            PrometheusClient.proxyGet("/api/v1/query", { query: "up" })
        ).rejects.toBeInstanceOf(HTTP503Error);
    });

    it("throws HTTP503Error when Prometheus is not configured", async () => {
        await expect(
            PrometheusClient.proxyGet("/api/v1/query", { query: "up" })
        ).rejects.toMatchObject({
            statusCode: 503,
            data: expect.objectContaining({
                code: "prometheus_unavailable"
            })
        });
    });

    it("uses the local dev fallback when NAULITE_NETBIRD_MOCK is enabled", async () => {
        process.env.NAULITE_NETBIRD_MOCK = "1";

        const fetchMock = vi.fn(async (url: string | URL) => {
            const href = typeof url === "string" ? url : url.toString();

            if (href.endsWith("/-/healthy")) {
                return new Response("ok", { status: 200 });
            }

            return new Response(JSON.stringify({ status: "success" }), {
                status: 200,
                headers: { "Content-Type": "application/json" }
            });
        });
        vi.stubGlobal("fetch", fetchMock);

        const body = await PrometheusClient.proxyGet("/api/v1/query", {
            query: "up"
        });

        expect(body).toEqual({ status: "success" });
        expect(fetchMock).toHaveBeenCalledWith(expect.objectContaining({
            href: "http://127.0.0.1:19090/api/v1/query?query=up"
        }));

        delete process.env.NAULITE_NETBIRD_MOCK;
    });
});
