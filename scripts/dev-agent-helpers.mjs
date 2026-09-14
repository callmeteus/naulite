/**
 * Pure helpers for the local `yarn dev` agent launcher.
 */
const LOOPBACK_HOSTS = new Set(["127.0.0.1", "localhost", "::1", "[::1]"]);
const DOCKER_HOST_ALIAS = "host.docker.internal";

/**
 * Rewrites loopback control-plane URLs so a Docker agent can reach the host.
 */
export const DevAgentHelpers = {
    /**
     * Returns a control-plane URL reachable from inside a Docker container.
     *
     * Loopback hosts (`127.0.0.1`, `localhost`, `::1`) become
     * `host.docker.internal`. Any other host is left unchanged.
     *
     * @param controlPlaneUrl URL used on the host, e.g. `http://127.0.0.1:18080`
     * @param dockerHostAlias Hostname Docker uses for the host gateway
     * @returns URL to pass as `NAULITE_CP_URL` inside the container
     */
    controlPlaneUrlForDocker(controlPlaneUrl, dockerHostAlias = DOCKER_HOST_ALIAS) {
        // Leave non-strings and empty values untouched so compose env passthrough stays safe.
        if (typeof controlPlaneUrl !== "string" || controlPlaneUrl.length === 0) {
            return controlPlaneUrl;
        }

        let parsed;

        try {
            parsed = new URL(controlPlaneUrl);
        } catch {
            return controlPlaneUrl;
        }

        // Remote or LAN control planes are already reachable from the container.
        if (!LOOPBACK_HOSTS.has(parsed.hostname)) {
            return controlPlaneUrl;
        }

        parsed.hostname = dockerHostAlias;

        const rewritten = parsed.toString();

        // `URL.toString()` adds a trailing slash for origin-only URLs.
        if (!controlPlaneUrl.endsWith("/") && rewritten.endsWith("/")) {
            return rewritten.slice(0, -1);
        }

        return rewritten;
    }
};
