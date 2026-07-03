import { describe, expect, it } from "vitest";

import { AdminPasswordCrypto } from "../../../packages/control-plane/src/modules/admin/AdminPasswordCrypto";

describe("AdminPasswordCrypto", () => {
    it("hashes and verifies passwords", async () => {
        const hash = await AdminPasswordCrypto.hashPassword("secret-password");

        expect(hash.startsWith("$2")).toBe(true);
        expect(await AdminPasswordCrypto.verifyPassword("secret-password", hash)).toBe(true);
        expect(await AdminPasswordCrypto.verifyPassword("wrong-password", hash)).toBe(false);
    });
});
