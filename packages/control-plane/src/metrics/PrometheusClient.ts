import { Logger } from "../Logger";
import { HTTP502Error } from "../errors/TreatedError";
const logMetrics = Logger.create("metrics");

/**
 * Prometheus HTTP API client used by control plane PromQL proxy routes.
 */
export namespace PrometheusClient {
    /**
     * Default Prometheus base URL when no override is configured.
     */
    const DEFAULT_PROMETHEUS_URL = "http://naulite-prometheus:9090";

    /**
     * Resolves the configured Prometheus base URL.
     *
     * @returns Prometheus base URL without trailing slash
     */
    export function resolveBaseUrl(): string {
        return (process.env.PROMETHEUS_URL ?? DEFAULT_PROMETHEUS_URL).replace(/\/+$/, "");
    }

    /**
     * Proxies a GET request to the Prometheus HTTP API.
     *
     * @param apiPath Prometheus API path starting with /api/v1/
     * @param query Query string parameters
     * @returns Parsed Prometheus JSON response body
     * @throws {HTTP502Error} {@link HTTP502Error}
     */
    export async function proxyGet(
        apiPath: string,
        query: Record<string, string | string[] | undefined>
    ): Promise<unknown> {
        const url = new URL(`${resolveBaseUrl()}${apiPath}`);

        for (const [key, value] of Object.entries(query)) {
            if (value === undefined) {
                continue;
            }

            if (Array.isArray(value)) {
                for (const entry of value) {
                    url.searchParams.append(key, entry);
                }

                continue;
            }

            url.searchParams.set(key, value);
        }

        logMetrics.debug("proxy path=%s url=%s", apiPath, url.toString());

        let response: Response;

        try {
            response = await fetch(url);
        } catch (err) {
            logMetrics.error("proxy fetch failed: %O", err);
            throw new HTTP502Error("Failed to reach Prometheus.", {
                prometheusUrl: resolveBaseUrl()
            });
        }

        const bodyText = await response.text();
        let body: unknown = bodyText;

        if (bodyText.length > 0) {
            try {
                body = JSON.parse(bodyText) as unknown;
            } catch {
                body = bodyText;
            }
        }

        if (!response.ok) {
            logMetrics.error("proxy upstream status=%d path=%s body=%s",
                response.status,
                apiPath,
                bodyText
            );

            throw new HTTP502Error("Prometheus query failed.", {
                statusCode: response.status,
                prometheusUrl: resolveBaseUrl()
            });
        }

        return body;
    }
}
