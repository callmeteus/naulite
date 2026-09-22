import { readFile } from "node:fs/promises";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { ComposeParser } from "../../../packages/control-plane/src/orchestration/ComposeParser";

describe("luckymaker-frontend sandbox fixture", () => {
    it("parses build task with sandbox parent and outputs", async () => {
        const fixturePath = path.resolve(
            import.meta.dirname,
            "../../../dogfood/fixtures/luckymaker-frontend-sandbox.yaml"
        );
        const yaml = await readFile(fixturePath, "utf8");
        const parser = new ComposeParser();
        const manifest = parser.parse(yaml);
        const task = manifest.tasks[0];

        expect(task.module).toBe("build");
        expect(task.sandbox?.parent).toBe("luckymaker-workspace");
        expect(task.outputs).toEqual(["luckymaker-frontend/dist/"]);
    });
});
