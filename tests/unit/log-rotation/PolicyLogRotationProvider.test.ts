import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { PolicyLogRotationProvider } from "@platform/log-rotation";
import type { LogRotationTask } from "@platform/shared";
import { afterEach, describe, expect, it } from "vitest";

describe("PolicyLogRotationProvider", () => {
    const provider = new PolicyLogRotationProvider();
    let tempDir = "";

    afterEach(async () => {
        if (tempDir) {
            await rm(tempDir, { recursive: true, force: true });
            tempDir = "";
        }
    });

    it("detects due cron schedules and rotates matching log files", async () => {
        const dueAt = new Date("2026-07-02T14:30:00.000Z");
        const policy = {
            schedule: "30 14 * * *",
            paths: [] as string[],
            includes: ["*.log"],
            excludes: [] as string[],
            compress: false
        };
        expect(provider.isDue(policy, dueAt)).toBe(true);

        tempDir = await mkdtemp(path.join(os.tmpdir(), "platform-log-rotation-"));
        const logPath = path.join(tempDir, "app.log");
        policy.paths = [logPath];
        await writeFile(logPath, "log-line-1\nlog-line-2\n");

        const task: LogRotationTask = {
            taskId: "rotate-1",
            instanceId: "minimal:web-1",
            serviceName: "web",
            nodeId: "node-a",
            policy
        };

        const result = await provider.execute(task);

        expect(result.rotatedFiles).toHaveLength(1);
        expect(result.rotatedFiles[0]).toContain("app.log.");
        await expect(readFile(logPath, "utf8")).rejects.toThrow();
    });

    it("returns false for invalid cron expressions and skips excluded files", async () => {
        expect(provider.isDue({
            schedule: "invalid cron",
            paths: ["/tmp/unused.log"],
            includes: ["*.log"],
            excludes: [],
            compress: false
        }, new Date())).toBe(false);

        tempDir = await mkdtemp(path.join(os.tmpdir(), "platform-log-rotation-"));
        const logPath = path.join(tempDir, "debug.log");
        await writeFile(logPath, "debug output");

        const task: LogRotationTask = {
            taskId: "rotate-2",
            instanceId: "minimal:web-1",
            serviceName: "web",
            nodeId: "node-a",
            policy: {
                schedule: "0 0 * * *",
                paths: [logPath],
                includes: ["*.log"],
                excludes: ["debug*"],
                compress: false
            }
        };

        const result = await provider.execute(task);

        expect(result.rotatedFiles).toEqual([]);
        expect(result.bytesFreed).toBe(0);
        await expect(readFile(logPath, "utf8")).resolves.toBe("debug output");
    });
});
