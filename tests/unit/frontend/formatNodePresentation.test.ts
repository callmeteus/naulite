import { describe, expect, it } from "vitest";

import {
    formatNodeCpuUsage,
    formatNodeMemoryUsage,
    formatNodeOsLabel,
    simplifyOsVersion
} from "../../../packages/ui/packages/frontend/src/utils/formatNodePresentation";

describe("formatNodePresentation", () => {
    it("shortens verbose Windows labels", () => {
        expect(simplifyOsVersion("Microsoft Windows 10 10.0.19045")).toBe("Windows 10");
        expect(formatNodeOsLabel("windows", "Microsoft Windows 10 10.0.19045")).toBe("Windows 10");
    });

    it("keeps concise Linux labels", () => {
        expect(formatNodeOsLabel("linux", "Ubuntu 22.04")).toBe("Ubuntu 22.04");
    });

    it("formats cpu usage as a percentage", () => {
        expect(formatNodeCpuUsage({
            cpuMillisTotal: 8000,
            cpuMillisUsed: 1200,
            memoryMbTotal: 16384,
            memoryMbUsed: 2048,
            diskMbTotal: 102400,
            diskMbUsed: 1024
        })).toBe("15%");
    });

    it("formats memory usage with totals", () => {
        expect(formatNodeMemoryUsage({
            cpuMillisTotal: 8000,
            cpuMillisUsed: 0,
            memoryMbTotal: 16384,
            memoryMbUsed: 512,
            diskMbTotal: 102400,
            diskMbUsed: 1024
        })).toBe("0.5 / 16 GB");
    });
});
