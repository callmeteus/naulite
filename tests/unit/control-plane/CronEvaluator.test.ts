import { describe, expect, it } from "vitest";

import { CronEvaluator } from "@naulite/control-plane";

describe("CronEvaluator", () => {
    it("matches exact minute and hour schedules", () => {
        const dueAt = new Date("2026-07-02T14:30:00.000Z");
        expect(CronEvaluator.isDue("30 14 * * *", dueAt)).toBe(true);
        expect(CronEvaluator.isDue("0 14 * * *", dueAt)).toBe(false);
    });

    it("matches wildcard and step expressions", () => {
        const dueAt = new Date("2026-07-02T03:00:00.000Z");
        expect(CronEvaluator.isDue("0 3 * * *", dueAt)).toBe(true);
        expect(CronEvaluator.isDue("*/15 * * * *", new Date("2026-07-02T03:15:00.000Z"))).toBe(true);
        expect(CronEvaluator.isDue("*/15 * * * *", new Date("2026-07-02T03:10:00.000Z"))).toBe(false);
    });

    it("returns false for invalid cron expressions", () => {
        expect(CronEvaluator.isDue("invalid cron", new Date())).toBe(false);
        expect(CronEvaluator.isDue("0 0 * *", new Date())).toBe(false);
    });
});
