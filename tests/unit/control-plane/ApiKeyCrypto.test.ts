import { describe, expect, it } from "vitest";

import { ApiKeyCrypto } from "../../../packages/control-plane/src/auth/ApiKeyCrypto.js";

describe("ApiKeyCrypto", () => {
    it("generates secrets with plt_ prefix and stable hash", () => {
        const generated = ApiKeyCrypto.generate();

        expect(generated.secret.startsWith("plt_")).toBe(true);
        expect(generated.prefix).toBe(generated.secret.slice(0, 12));
        expect(ApiKeyCrypto.matches(generated.secret, generated.keyHash)).toBe(true);
    });

    it("rejects secrets that do not match the stored hash", () => {
        const generated = ApiKeyCrypto.generate();

        expect(ApiKeyCrypto.matches("plt_invalid", generated.keyHash)).toBe(false);
    });
});
