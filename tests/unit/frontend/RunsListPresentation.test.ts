import { describe, expect, it } from "vitest";

import {
    isPipelineRunKind,
    pipelineRunKindLabel,
    RUNS_LIST_KIND_FILTER_VALUES
} from "../../../packages/ui/packages/frontend/src/utils/RunsListPresentation";

describe("RunsListPresentation", () => {
    it("includes ci_pipeline in kind filter values", () => {
        expect(RUNS_LIST_KIND_FILTER_VALUES).toContain("ci_pipeline");
    });

    it("recognizes known pipeline run kinds", () => {
        expect(isPipelineRunKind("ci_pipeline")).toBe(true);
        expect(isPipelineRunKind("not_a_kind")).toBe(false);
    });

    it("returns i18n label when the key exists", () => {
        const label = pipelineRunKindLabel(
            (key) => (key === "pages.runs.kinds.ci_pipeline" ? "Pipeline de CI" : key),
            (key) => key === "pages.runs.kinds.ci_pipeline",
            "ci_pipeline"
        );

        expect(label).toBe("Pipeline de CI");
    });

    it("falls back to raw kind when translation is missing", () => {
        const label = pipelineRunKindLabel(
            (key) => key,
            () => false,
            "future_kind"
        );

        expect(label).toBe("future_kind");
    });
});
