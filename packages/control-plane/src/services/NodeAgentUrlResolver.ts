/**
 * Rewrites registered agent URLs for outbound requests from the control plane process.
 */
export namespace NodeAgentUrlResolver {
    /**
     * Returns the agent base URL the control plane should use for HTTP probes and proxy calls.
     *
     * @param registeredAgentUrl Agent URL stored on the node row
     * @returns URL with optional dev ingress host applied
     */
    export function resolveControlPlaneFetchUrl(registeredAgentUrl: string): string {
        const trimmed = registeredAgentUrl.replace(/\/$/, "");
        const viaHost = process.env.NAULITE_AGENT_FETCH_VIA_HOST?.trim();

        if (!viaHost) {
            return trimmed;
        }

        let parsed: URL;

        try {
            parsed = new URL(trimmed);
        } catch {
            return trimmed;
        }

        if (!shouldRewriteHostname(parsed.hostname)) {
            return trimmed;
        }

        parsed.hostname = viaHost;

        const viaPort = process.env.NAULITE_AGENT_FETCH_VIA_PORT?.trim();

        if (viaPort) {
            parsed.port = viaPort;
        }

        return parsed.toString().replace(/\/$/, "");
    }

    /**
     * Returns whether the registered hostname is not reachable from a typical CP container.
     *
     * @param hostname Host part of the registered agent URL
     * @returns True when rewrite is safe to apply
     */
    function shouldRewriteHostname(hostname: string): boolean {
        const normalized = hostname.toLowerCase();

        if (normalized === "127.0.0.1" || normalized === "localhost" || normalized === "::1") {
            return true;
        }

        return isNetBirdCgNatHostname(normalized);
    }

    /**
     * Returns whether the hostname looks like a NetBird mesh address (100.64.0.0/10).
     *
     * @param hostname Host part of the registered agent URL
     * @returns True for 100.64-127.x.x.x
     */
    function isNetBirdCgNatHostname(hostname: string): boolean {
        const match = /^100\.(\d+)\.(\d+)\.(\d+)$/.exec(hostname);

        if (!match) {
            return false;
        }

        const secondOctet = Number(match[1]);

        return secondOctet >= 64 && secondOctet <= 127;
    }
}
