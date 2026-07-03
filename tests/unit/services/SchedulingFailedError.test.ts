import { describe, expect, it } from "vitest";

import { SchedulingFailedError } from "../../../packages/control-plane/src/errors/orchestration/SchedulingFailedError";

describe("SchedulingFailedError", () => {
    it("exposes HTTP 503 with the service name", () => {
        const error = new SchedulingFailedError("web");

        expect(error.statusCode).toBe(503);
        expect(error.message).toContain("web");
        expect(error.data.serviceName).toBe("web");
    });
});
