import { afterEach, describe, expect, it } from "vitest";

import { TlsConfig } from "../../../packages/control-plane/src/services/TlsConfig";

describe("TlsConfig", () => {
    const originalMode = process.env.NAULITE_TLS_MODE;

    afterEach(() => {
        if (originalMode === undefined) {
            delete process.env.NAULITE_TLS_MODE;
        } else {
            process.env.NAULITE_TLS_MODE = originalMode;
        }
    });

    it("defaults to acme_tls when NAULITE_TLS_MODE is unset", () => {
        delete process.env.NAULITE_TLS_MODE;

        expect(TlsConfig.resolveMode()).toBe("acme_tls");
        expect(TlsConfig.isAcmeTls()).toBe(true);
        expect(TlsConfig.supportsAutoTls()).toBe(true);
    });

    it("enables only the configured mode", () => {
        process.env.NAULITE_TLS_MODE = "custom";

        expect(TlsConfig.isEnabled("custom")).toBe(true);
        expect(TlsConfig.isCustom()).toBe(true);
        expect(TlsConfig.isAcmeTls()).toBe(false);
        expect(TlsConfig.supportsAutoTls()).toBe(false);
    });

    it("supports auto TLS for ACME DNS Cloudflare mode", () => {
        process.env.NAULITE_TLS_MODE = "acme_dns_cloudflare";

        expect(TlsConfig.isAcmeDnsCloudflare()).toBe(true);
        expect(TlsConfig.supportsAutoTls()).toBe(true);
    });

    it("recognizes passthrough and self_signed modes", () => {
        process.env.NAULITE_TLS_MODE = "passthrough";
        expect(TlsConfig.isPassthrough()).toBe(true);

        process.env.NAULITE_TLS_MODE = "self_signed";
        expect(TlsConfig.isSelfSigned()).toBe(true);
    });

    it("rejects invalid NAULITE_TLS_MODE values", () => {
        process.env.NAULITE_TLS_MODE = "unknown-mode";

        expect(() => TlsConfig.resolveMode()).toThrow(/invalid/i);
    });
});
