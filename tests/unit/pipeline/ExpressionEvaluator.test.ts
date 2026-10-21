import { describe, expect, it } from "vitest";

import { ExpressionEvaluator } from "../../../packages/control-plane/src/services/pipeline/ExpressionEvaluator";

describe("ExpressionEvaluator", () => {
    it("returns true for empty when", () => {
        expect(ExpressionEvaluator.evaluateWhen(undefined, {
            branch: "master"
        })).toBe(true);
    });

    it("evaluates equality and startsWith", () => {
        const context = {
            branch: "EVEN-1234"
        };

        expect(ExpressionEvaluator.evaluateWhen("branch == 'EVEN-1234'", context)).toBe(true);
        expect(ExpressionEvaluator.evaluateWhen("startsWith(branch, 'EVEN-')", context)).toBe(true);
        expect(ExpressionEvaluator.evaluateWhen("branch != 'master'", context)).toBe(true);
    });

    it("evaluates boolean combinations", () => {
        const context = {
            branch: "master"
        };

        expect(ExpressionEvaluator.evaluateWhen("branch == 'master' && startsWith(branch, 'mas')", context)).toBe(true);
        expect(ExpressionEvaluator.evaluateWhen("branch == 'dev' || branch == 'master'", context)).toBe(true);
    });
});
