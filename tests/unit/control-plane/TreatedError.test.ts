import { describe, expect, it } from "vitest";

import {
    HTTP403Error,
    HTTP503Error,
    TreatedError
} from "../../../packages/control-plane/src/errors/TreatedError";

describe("TreatedError", () => {
    it("stores status code and extra response data", () => {
        const error = new TreatedError("Something failed.", {
            statusCode: 422,
            code: "SOMETHING_FAILED",
            retryAfter: 30
        });

        expect(error.message).toBe("Something failed.");
        expect(error.statusCode).toBe(422);
        expect(error.data).toEqual({
            code: "SOMETHING_FAILED",
            retryAfter: 30
        });
    });

    it("builds response body with message and data fields", () => {
        const error = new HTTP403Error("Invalid setup key.", { reason: "mismatch" });

        expect(error.toResponseBody()).toEqual({
            message: "Invalid setup key.",
            reason: "mismatch"
        });
    });

    it("sets the expected status code on HTTP subclasses", () => {
        expect(new HTTP403Error("Forbidden.").statusCode).toBe(403);
        expect(new HTTP503Error("Unavailable.").statusCode).toBe(503);
    });
});
