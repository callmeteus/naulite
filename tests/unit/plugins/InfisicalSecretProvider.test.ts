import { describe, expect, it } from "vitest";

import { InfisicalSecretProvider } from "../../../packages/plugins/infisical-secret-provider/src/index";

describe("InfisicalSecretProvider", () => {
    it("lists secrets as an empty stub", async () => {
        const provider = new InfisicalSecretProvider({
            apiUrl: "https://infisical.example",
            projectId: "project-1",
            environment: "dev"
        });

        await expect(provider.list()).resolves.toEqual([]);
    });

    it("rejects upsert until configured", async () => {
        const provider = new InfisicalSecretProvider();

        await expect(provider.upsert({
            name: "db",
            data: { password: "secret" }
        })).rejects.toThrow("Infisical secret provider is not configured");
    });
});
