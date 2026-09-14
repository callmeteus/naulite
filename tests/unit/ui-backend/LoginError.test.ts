import { describe, expect, it } from "vitest";

import { NauliteApiError } from "../../../packages/sdk/src/NauliteApiError";
import { LoginError } from "../../../packages/ui/packages/backend/src/auth/LoginError";

const controlPlaneUrl = "http://127.0.0.1:18080";

describe("LoginError.isInvalidCredentials", () => {
    it("returns true for a 401 from the control plane", () => {
        const error = new NauliteApiError(401, "Invalid username or password.");

        expect(LoginError.isInvalidCredentials(error)).toBe(true);
    });

    it("returns false for transport failures and other HTTP statuses", () => {
        expect(LoginError.isInvalidCredentials(new TypeError("fetch failed"))).toBe(false);
        expect(LoginError.isInvalidCredentials(new NauliteApiError(503, "unavailable"))).toBe(false);
        expect(LoginError.isInvalidCredentials("not an error")).toBe(false);
    });
});

describe("LoginError.isUnreachable", () => {
    it("returns true when fetch cannot connect", () => {
        const cause = Object.assign(new Error("connect ECONNREFUSED 127.0.0.1:18080"), {
            code: "ECONNREFUSED"
        });
        const error = new TypeError("fetch failed", { cause });

        expect(LoginError.isUnreachable(error)).toBe(true);
        expect(LoginError.isUnreachable(new Error("connect ECONNREFUSED 127.0.0.1:18080"))).toBe(true);
    });

    it("returns false for invalid credentials", () => {
        const error = new NauliteApiError(401, "Invalid username or password.");

        expect(LoginError.isUnreachable(error)).toBe(false);
    });
});

describe("LoginError.toBffError", () => {
    it("maps 401 to the credentials i18n key", () => {
        const error = new NauliteApiError(401, "Invalid username or password.");
        const mapped = LoginError.toBffError(error, controlPlaneUrl);

        expect(mapped.statusCode).toBe(401);
        expect(mapped.i18n).toBe("errors.authFailed");
        expect(mapped.i18n).not.toContain("controlPlane");
    });

    it("maps an unreachable control plane to the dedicated i18n key", () => {
        const mapped = LoginError.toBffError(new TypeError("fetch failed"), controlPlaneUrl);

        expect(mapped.statusCode).toBe(503);
        expect(mapped.i18n).toBe("errors.controlPlaneUnreachable");
        expect(mapped.i18nParams).toEqual({ url: controlPlaneUrl });
    });
});
