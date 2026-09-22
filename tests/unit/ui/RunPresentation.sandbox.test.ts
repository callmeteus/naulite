import { describe, expect, it } from "vitest";

import { aggregateRunHostEvents } from "../../../packages/ui/packages/frontend/src/utils/RunPresentation";

describe("RunPresentation sandbox hosts", () => {
    it("adds a row for sandbox clone events", () => {
        const rows = aggregateRunHostEvents({
            id: "run-1",
            kind: "apply",
            status: "running",
            startedAt: "2026-01-01T00:00:00.000Z",
            steps: [],
            events: [
                {
                    id: 1,
                    runId: "run-1",
                    kind: "deploy.step.started",
                    message: "sandbox:build-run-1",
                    createdAt: "2026-01-01T00:00:01.000Z"
                }
            ]
        }, []);

        expect(rows.some((row) => row.sandboxIncusName === "build-run-1")).toBe(true);
    });
});
