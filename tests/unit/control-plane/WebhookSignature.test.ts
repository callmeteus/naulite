import { createHmac } from "node:crypto";

import { describe, expect, it } from "vitest";

import { WebhookSignature } from "../../../packages/control-plane/src/gitops/WebhookSignature";

describe("WebhookSignature", () => {
    const secret = "webhook-secret";
    const rawBody = Buffer.from(JSON.stringify({ repositoryUrl: "https://example.com/repo.git" }), "utf8");

    it("accepts a valid GitHub signature", () => {
        const digest = createHmac("sha256", secret).update(rawBody).digest("hex");

        const valid = WebhookSignature.verify({
            provider: "github",
            secret,
            rawBody,
            headers: {
                "x-hub-signature-256": `sha256=${digest}`
            }
        });

        expect(valid).toBe(true);
    });

    it("rejects an invalid GitHub signature", () => {
        const valid = WebhookSignature.verify({
            provider: "github",
            secret,
            rawBody,
            headers: {
                "x-hub-signature-256": "sha256=deadbeef"
            }
        });

        expect(valid).toBe(false);
    });

    it("accepts a valid GitLab token", () => {
        const valid = WebhookSignature.verify({
            provider: "gitlab",
            secret,
            rawBody,
            headers: {
                "x-gitlab-token": secret
            }
        });

        expect(valid).toBe(true);
    });

    it("rejects an invalid GitLab token", () => {
        const valid = WebhookSignature.verify({
            provider: "gitlab",
            secret,
            rawBody,
            headers: {
                "x-gitlab-token": "wrong-token"
            }
        });

        expect(valid).toBe(false);
    });

    it("accepts a valid generic HMAC signature", () => {
        const digest = createHmac("sha256", secret).update(rawBody).digest("hex");

        const valid = WebhookSignature.verify({
            provider: "generic",
            secret,
            rawBody,
            headers: {
                "x-naulite-signature": digest
            }
        });

        expect(valid).toBe(true);
    });

    it("rejects verification when secret is empty", () => {
        const valid = WebhookSignature.verify({
            provider: "generic",
            secret: "   ",
            rawBody,
            headers: {
                "x-naulite-signature": "abc"
            }
        });

        expect(valid).toBe(false);
    });
});
