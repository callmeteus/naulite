import { describe, expect, it } from "vitest";

import { formatRunElapsed } from "../../../packages/ui/packages/frontend/src/utils/RunPresentation";
import {
    formatRunsListLaunchedBy,
    RUNS_LIST_STATUS_FILTER_VALUES
} from "../../../packages/ui/packages/frontend/src/utils/RunsListPresentation";

describe("RunsListColumns", () => {
    it("includes awaiting_approval in the status filter", () => {
        expect(RUNS_LIST_STATUS_FILTER_VALUES).toContain("awaiting_approval");
    });

    it("formats elapsed time for list rows", () => {
        const startedAt = "2026-01-01T00:00:00.000Z";
        const nowMs = Date.parse("2026-01-01T00:01:05.000Z");

        expect(formatRunElapsed(startedAt, undefined, nowMs)).toBe("1m 5s");
    });

    it("formats launched-by values", () => {
        expect(formatRunsListLaunchedBy("operator@example.com")).toBe("operator@example.com");
        expect(formatRunsListLaunchedBy("   ")).toBe("-");
    });
});
