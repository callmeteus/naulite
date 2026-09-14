import { afterEach, describe, expect, it } from "vitest";

import type { FastifyRequest } from "fastify";

import { isLocalBootstrapRequest } from "../../../packages/control-plane/src/bootstrap/BootstrapUrls";

const ENV_KEYS = ["NAULITE_ALLOW_DOCKER_BRIDGE", "NAULITE_E2E_ALLOW_BRIDGE"] as const;

const originalEnv: Record<string, string | undefined> = {};

/**
 * Snapshots docker-bridge bypass env vars so tests can restore them.
 *
 * @returns Nothing.
 */
function snapshotEnv(): void {
    for (const key of ENV_KEYS) {
        originalEnv[key] = process.env[key];
        delete process.env[key];
    }
}

/**
 * Restores docker-bridge bypass env vars after a test.
 *
 * @returns Nothing.
 */
function restoreEnv(): void {
    for (const key of ENV_KEYS) {
        if (originalEnv[key] === undefined) {
            delete process.env[key];
        } else {
            process.env[key] = originalEnv[key];
        }
    }
}

/**
 * Builds a Fastify-like request with a client IP.
 *
 * @param ip Client address
 * @returns Request stub
 */
function requestWithIp(ip: string): FastifyRequest {
    return { ip } as FastifyRequest;
}

describe("isLocalBootstrapRequest", () => {
    afterEach(() => {
        restoreEnv();
    });

    it("accepts loopback without docker-bridge flags", () => {
        snapshotEnv();

        expect(isLocalBootstrapRequest(requestWithIp("127.0.0.1"))).toBe(true);
        expect(isLocalBootstrapRequest(requestWithIp("::1"))).toBe(true);
        expect(isLocalBootstrapRequest(requestWithIp("::ffff:127.0.0.1"))).toBe(true);
    });

    it("rejects docker bridge IPs when bypass flags are unset", () => {
        snapshotEnv();

        expect(isLocalBootstrapRequest(requestWithIp("172.17.0.2"))).toBe(false);
        expect(isLocalBootstrapRequest(requestWithIp("203.0.113.10"))).toBe(false);
    });

    it("accepts 172.16.0.0/12 when NAULITE_ALLOW_DOCKER_BRIDGE is 1", () => {
        snapshotEnv();
        process.env.NAULITE_ALLOW_DOCKER_BRIDGE = "1";

        expect(isLocalBootstrapRequest(requestWithIp("172.17.0.2"))).toBe(true);
        expect(isLocalBootstrapRequest(requestWithIp("::ffff:172.18.0.5"))).toBe(true);
        expect(isLocalBootstrapRequest(requestWithIp("172.15.0.1"))).toBe(false);
        expect(isLocalBootstrapRequest(requestWithIp("203.0.113.10"))).toBe(false);
    });

    it("still honors NAULITE_E2E_ALLOW_BRIDGE", () => {
        snapshotEnv();
        process.env.NAULITE_E2E_ALLOW_BRIDGE = "1";

        expect(isLocalBootstrapRequest(requestWithIp("172.18.0.5"))).toBe(true);
    });
});
