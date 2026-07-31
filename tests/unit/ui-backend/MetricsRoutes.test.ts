import { afterEach, describe, expect, it, vi } from "vitest";

import { NauliteClient } from "../../../packages/sdk/src/NauliteClient";
import { NauliteApiError } from "../../../packages/sdk/src/NauliteApiError";
import { createApp } from "../../../packages/ui/packages/backend/src/App";

describe("ui-backend metrics routes", () => {
    afterEach(() => {
        vi.clearAllMocks();
        delete process.env.ADMIN_API_KEY;
    });

    it("proxies instant and range PromQL queries", async () => {
        const controlPlane = {
            queryMetrics: vi.fn(async () => ({
                status: "success",
                data: { resultType: "vector", result: [] }
            })),
            queryMetricsRange: vi.fn(async () => ({
                status: "success",
                data: { resultType: "matrix", result: [] }
            })),
            getPrometheusMetrics: vi.fn(async () => "naulite_nodes_total 1\n")
        } as unknown as NauliteClient;

        const app = await createApp({
            adminApiKey: "secret-key",
            logger: false
        });
        app.controlPlane = controlPlane;

        const instantResponse = await app.inject({
            method: "GET",
            url: "/metrics/query?query=up",
            headers: { authorization: "Bearer secret-key" }
        });
        expect(instantResponse.statusCode).toBe(200);
        expect(controlPlane.queryMetrics).toHaveBeenCalledWith("up", undefined);

        const rangeResponse = await app.inject({
            method: "GET",
            url: "/metrics/query_range?query=up&start=1&end=2&step=60s",
            headers: { authorization: "Bearer secret-key" }
        });
        expect(rangeResponse.statusCode).toBe(200);
        expect(controlPlane.queryMetricsRange).toHaveBeenCalledWith("up", "1", "2", "60s");

        await app.close();
    });

    it("returns a structured BFF error when Prometheus is unavailable", async () => {
        const controlPlane = {
            queryMetrics: vi.fn(async () => {
                throw new NauliteApiError(503, "Prometheus is not available.", {
                    code: "prometheus_unavailable",
                    i18n: "errors.prometheusUnavailable"
                });
            }),
            queryMetricsRange: vi.fn(),
            getPrometheusMetrics: vi.fn()
        } as unknown as NauliteClient;

        const app = await createApp({
            adminApiKey: "secret-key",
            logger: false
        });
        app.controlPlane = controlPlane;

        const response = await app.inject({
            method: "GET",
            url: "/metrics/query?query=up",
            headers: { authorization: "Bearer secret-key" }
        });

        expect(response.statusCode).toBe(503);
        expect(response.json()).toEqual({
            i18n: "errors.prometheusUnavailable",
            code: "prometheus_unavailable"
        });

        await app.close();
    });
});
