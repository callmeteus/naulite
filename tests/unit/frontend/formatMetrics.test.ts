import { describe, expect, it } from "vitest";

import {
    formatCpuUsageSummary,
    formatInstanceCpuPercent,
    formatInstanceMemoryBytes,
    formatMemoryUsageSummary,
    toPercentPlotData
} from "../../../packages/ui/packages/frontend/src/utils/formatMetrics";

describe("formatMetrics", () => {
    it("formats CPU usage with percent and core totals", () => {
        expect(formatCpuUsageSummary(6800, 10000)).toBe("68% · 6.8 / 10 cores");
    });

    it("formats memory usage with percent and capacity", () => {
        expect(formatMemoryUsageSummary(3276, 16384)).toBe("3.2 GB / 16.0 GB (20%)");
    });

    it("formats instance CPU and memory samples", () => {
        expect(formatInstanceCpuPercent("12.345")).toBe("12.3%");
        expect(formatInstanceMemoryBytes(String(1024 * 1024 * 256))).toBe("256 MB");
    });

    it("converts usage series to percentage data", () => {
        const result = toPercentPlotData([[1, 2], [500, 1000]], 2000);

        expect(result[1]).toEqual([25, 50]);
    });
});
