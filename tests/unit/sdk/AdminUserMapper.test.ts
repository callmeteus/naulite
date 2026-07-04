import { describe, expect, it } from "vitest";

import { AdminUserMapper } from "../../../packages/sdk/src/AdminUserMapper";

describe("AdminUserMapper", () => {
    it("maps control plane username to SDK email", () => {
        const user = AdminUserMapper.toSdkUser({
            id: "user-1",
            username: "admin@example.com",
            role: "admin",
            tenantId: null,
            createdAt: "2026-07-02T00:00:00.000Z"
        });

        expect(user.email).toBe("admin@example.com");
    });

    it("normalizes login email to username", () => {
        expect(AdminUserMapper.emailToUsername(" Admin@Example.COM ")).toBe("admin@example.com");
    });
});
