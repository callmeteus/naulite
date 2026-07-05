import { LocalSecretProvider } from "@naulite/control-plane";
import { describe, expect, it } from "vitest";

describe("LocalSecretProvider", () => {
    const provider = new LocalSecretProvider({
        masterKey: "test-master-key-material"
    });

    it("stores, lists, resolves, and filters secrets for agents", async () => {
        const metadata = await provider.upsert({
            name: "db-credentials",
            data: {
                username: "app",
                password: "secret-value"
            },
            scope: "cluster",
            description: "Database credentials"
        });

        expect(metadata.name).toBe("db-credentials");
        expect(metadata.keys).toEqual(["username", "password"]);

        const listed = await provider.list();
        expect(listed).toHaveLength(1);
        expect(listed[0]?.name).toBe("db-credentials");

        const resolved = await provider.resolve("db-credentials");
        expect(resolved.data).toEqual({
            username: "app",
            password: "secret-value"
        });

        const filtered = await provider.resolveForAgent({
            secretNames: ["db-credentials"],
            allowedKeys: {
                "db-credentials": ["username"]
            }
        });
        expect(filtered).toEqual([{
            name: "db-credentials",
            data: {
                username: "app"
            }
        }]);
    });

    it("throws when resolving a secret that does not exist", async () => {
        await expect(provider.resolve("missing-secret")).rejects.toThrow(
            "Secret not found: missing-secret"
        );
    });
});
