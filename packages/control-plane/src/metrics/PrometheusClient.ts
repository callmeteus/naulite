import { Logger } from "../Logger";
import { HTTP503Error } from "../errors/TreatedError";

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
     * Minimum interval between unavailable Prometheus log lines.
     */
    const UNAVAILABLE_LOG_INTERVAL_MS = 30_000;

    /**
     * How long to cache a successful local dev Prometheus health probe.
     */
    const DEV_HEALTH_CACHE_MS = 10_000;

    let lastUnavailableLogAt = 0;
    let devFallbackBaseUrl: string | null | undefined;
    let devFallbackCheckedAt = 0;

    /**
     * Returns whether Prometheus proxying is explicitly configured.
     *
     * @returns `true` when `PROMETHEUS_URL` is set
     */
    export function isEnabled(): boolean {
        const raw = process.env.PROMETHEUS_URL;

        return typeof raw === "string" && raw.trim().length > 0;
    }

    /**
     * Resolves the configured Prometheus base URL.
     *
     * @returns Prometheus base URL without trailing slash
     */
    export function resolveBaseUrl(): string {
        if (!isEnabled()) {
            return DEFAULT_PROMETHEUS_URL;
        }

        return process.env.PROMETHEUS_URL!.replace(/\/+$/, "");
    }

    /**
     * Returns whether local dev may probe the default host Prometheus port.
     *
     * @returns `true` when the dev fallback is allowed
     */
    function isDevFallbackAllowed(): boolean {
        return !isEnabled() && process.env.NAULITE_NETBIRD_MOCK === "1";
    }

    /**
     * Resolves the default local Prometheus URL used by `yarn dev`.
     *
     * @returns Local Prometheus base URL
     */
    function resolveDevFallbackBaseUrl(): string {
        const port = process.env.NAULITE_PROMETHEUS_HOST_PORT ?? "19090";

        return `http://127.0.0.1:${port}`;
    }

    /**
     * Returns whether Prometheus responds on its health endpoint.
     *
     * @param baseUrl Prometheus base URL
     * @returns `true` when healthy
     */
    async function isPrometheusHealthy(baseUrl: string): Promise<boolean> {
        try {
            const response = await fetch(`${baseUrl}/-/healthy`);

            return response.ok;
        } catch {
            return false;
        }
    }

    /**
     * Resolves the Prometheus base URL for proxy requests.
     *
     * @returns Prometheus base URL without trailing slash
     */
    async function resolveProxyBaseUrl(): Promise<string> {
        if (isEnabled()) {
            return resolveBaseUrl();
        }

        if (!isDevFallbackAllowed()) {
            throwUnavailable("not configured");
        }

        const now = Date.now();

        if (devFallbackBaseUrl !== undefined && now - devFallbackCheckedAt < DEV_HEALTH_CACHE_MS) {
            if (devFallbackBaseUrl) {
                return devFallbackBaseUrl;
            }

            throwUnavailable("not configured");
        }

        const candidate = resolveDevFallbackBaseUrl();
        const healthy = await isPrometheusHealthy(candidate);

        devFallbackCheckedAt = now;
        devFallbackBaseUrl = healthy ? candidate : null;

        if (healthy) {
            logMetrics.debug("using dev Prometheus fallback at %s", candidate);
            return candidate;
        }

        throwUnavailable("not configured");
    }

    /**
     * Reads a short message from a failed fetch error.
     *
     * @param err Caught fetch error
     * @returns Human-readable failure reason
     */
    function readFetchErrorCause(err: unknown): string {
        if (err instanceof Error && err.cause instanceof Error) {
            return err.cause.message;
        }

        if (err instanceof Error) {
            return err.message;
        }

        return String(err);
    }

    /**
     * Logs Prometheus unavailability at most once per interval.
     *
     * @param baseUrl Prometheus base URL
     * @param reason Failure reason
     * @returns Nothing.
     */
    function logUnavailable(baseUrl: string, reason: string): void {
        const now = Date.now();

        if (now - lastUnavailableLogAt < UNAVAILABLE_LOG_INTERVAL_MS) {
            return;
        }

        lastUnavailableLogAt = now;
        logMetrics.warn("Prometheus unavailable at %s (%s)", baseUrl, reason);
    }

    /**
     * Throws a treated error for disabled or unreachable Prometheus.
     *
     * @param reason Short failure reason for logs
     * @param baseUrl Optional Prometheus URL attempted by the proxy
     * @returns Never
     */
    function throwUnavailable(reason: string, baseUrl = resolveBaseUrl()): never {
        logUnavailable(baseUrl, reason);

        throw new HTTP503Error("Prometheus is not available.", {
            code: "prometheus_unavailable",
            i18n: "errors.prometheusUnavailable"
        });
    }

    /**
     * Proxies a GET request to the Prometheus HTTP API.
     *
     * @param apiPath Prometheus API path starting with /api/v1/
     * @param query Query string parameters
     * @returns Parsed Prometheus JSON response body
     * @throws {HTTP503Error} {@link HTTP503Error}
     */
    export async function proxyGet(
        apiPath: string,
        query: Record<string, string | string[] | undefined>
    ): Promise<unknown> {
        const baseUrl = await resolveProxyBaseUrl();
        const url = new URL(`${baseUrl}${apiPath}`);

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
            devFallbackBaseUrl = null;
            throwUnavailable(readFetchErrorCause(err), baseUrl);
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

            throw new HTTP503Error("Prometheus query failed.", {
                code: "prometheus_unavailable",
                i18n: "errors.prometheusUnavailable"
            });
        }

        return body;
    }
}
