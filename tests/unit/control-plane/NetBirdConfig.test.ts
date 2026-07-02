import { describe, expect, it } from "vitest";

import { NetBirdConfig } from "../../../packages/control-plane/src/netbird/NetBirdConfig.js";

describe("NetBirdConfig", () => {
    it("rejects NetBird cloud hostnames", () => {
        expect(NetBirdConfig.isCloudHostname("api.netbird.io")).toBe(true);
        expect(NetBirdConfig.isCloudHostname("app.netbird.io")).toBe(true);
        expect(NetBirdConfig.isCloudHostname("vpn.example.com")).toBe(false);
    });

    it("throws when NETBIRD_API_URL is missing", () => {
        delete process.env.NETBIRD_API_URL;
        delete process.env.NETBIRD_MANAGEMENT_URL;

        expect(() => NetBirdConfig.resolveApiUrl()).toThrow(/self-hosted/i);
    });

    it("accepts a self-hosted API URL", () => {
        process.env.NETBIRD_API_URL = "https://vpn.example.com/api";

        expect(NetBirdConfig.resolveApiUrl()).toBe("https://vpn.example.com/api");
    });

    it("rejects NetBird cloud API URLs", () => {
        process.env.NETBIRD_API_URL = "https://api.netbird.io";

        expect(() => NetBirdConfig.resolveApiUrl()).toThrow(/cloud endpoint/i);
    });
});
