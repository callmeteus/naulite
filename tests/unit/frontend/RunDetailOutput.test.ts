import { describe, expect, it } from "vitest";

import type { PipelineStep } from "@naulite/sdk";

import {
    filterStepLogText,
    shouldCollapseStepOutput
} from "../../../packages/ui/packages/frontend/src/utils/RunPresentation";

function buildStep(overrides: Partial<PipelineStep> = {}): PipelineStep {
    return {
        id: "step-1",
        runId: "run-1",
        name: "dispatch",
        order: 0,
        status: "running",
        ...overrides
    };
}

describe("RunDetailOutput", () => {
    it("collapses succeeded step output by default", () => {
        expect(shouldCollapseStepOutput(buildStep({ status: "succeeded" }))).toBe(true);
        expect(shouldCollapseStepOutput(buildStep({ status: "failed" }))).toBe(false);
    });

    it("filters log lines by search query", () => {
        const log = "alpha line\nbeta line\nalpha again";

        expect(filterStepLogText(log, "beta")).toBe("beta line");
        expect(filterStepLogText(log, "")).toBe(log);
    });
});
