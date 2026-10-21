import { describe, expect, it } from "vitest";

import { GiteaWebhookMapper } from "../../../packages/control-plane/src/gitops/GiteaWebhookMapper";

describe("GiteaWebhookMapper", () => {
    it("maps a push payload into GitOps webhook fields", () => {
        const mapped = GiteaWebhookMapper.map({
            ref: "refs/heads/master",
            after: "abc123",
            repository: {
                clone_url: "http://127.0.0.1:3001/even7/luckymaker.git",
                full_name: "even7/luckymaker"
            }
        }, {
            manifestPath: "luckymaker-ci.lab.naulite.yml",
            deliveryId: "delivery-1"
        });

        expect(mapped.repositoryUrl).toBe("http://127.0.0.1:3001/even7/luckymaker.git");
        expect(mapped.branch).toBe("master");
        expect(mapped.commitSha).toBe("abc123");
        expect(mapped.repositoryFullName).toBe("even7/luckymaker");
        expect(mapped.event).toBe("push");
        expect(mapped.manifestPath).toBe("luckymaker-ci.lab.naulite.yml");
    });

    it("throws when repository URL is missing", () => {
        expect(() => {
            GiteaWebhookMapper.map({
                ref: "refs/heads/master",
                after: "abc123"
            }, {
                manifestPath: "luckymaker-ci.lab.naulite.yml"
            });
        }).toThrow("missing repository clone URL");
    });
});
