import { afterEach, describe, expect, it, vi } from "vitest";

import { AdminBootstrap } from "../../../packages/control-plane/src/modules/admin/AdminBootstrap";
import { AdminService } from "../../../packages/control-plane/src/modules/admin/AdminService";

vi.mock("../../../packages/control-plane/src/modules/admin/AdminService", () => ({
    AdminService: {
        createBootstrapUser: vi.fn()
    }
}));

describe("AdminBootstrap", () => {
    afterEach(() => {
        delete process.env.PLATFORM_BOOTSTRAP_ADMIN_USERNAME;
        delete process.env.PLATFORM_BOOTSTRAP_ADMIN_PASSWORD;
        vi.clearAllMocks();
    });

    it("does not seed when bootstrap password env is missing", async () => {
        const created = await AdminBootstrap.ensureFromEnv();

        expect(created).toBe(false);
        expect(AdminService.createBootstrapUser).not.toHaveBeenCalled();
    });

    it("seeds the first admin user from env when bootstrap password is set", async () => {
        process.env.PLATFORM_BOOTSTRAP_ADMIN_USERNAME = "bootstrap-admin";
        process.env.PLATFORM_BOOTSTRAP_ADMIN_PASSWORD = "bootstrap-password";

        vi.mocked(AdminService.createBootstrapUser).mockResolvedValue({
            id: "user-1",
            username: "bootstrap-admin",
            role: "admin",
            tenantId: null,
            createdAt: "2026-07-03T00:00:00.000Z",
            updatedAt: "2026-07-03T00:00:00.000Z"
        });

        const created = await AdminBootstrap.ensureFromEnv();

        expect(created).toBe(true);
        expect(AdminService.createBootstrapUser).toHaveBeenCalledWith({
            username: "bootstrap-admin",
            password: "bootstrap-password",
            role: "admin"
        });
    });
});
