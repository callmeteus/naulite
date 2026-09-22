import { describe, expect, it } from "vitest";

import { TaskModuleRegistry } from "../../../packages/control-plane/src/orchestration/TaskModuleRegistry";

describe("TaskModuleRegistry build sandbox", () => {
    it("accepts build tasks with sandbox parent", () => {
        const task = TaskModuleRegistry.parseTask({
            name: "yarn build",
            module: "build",
            sandbox: {
                parent: "luckymaker-workspace",
                workdir: "/workspace"
            },
            command: ["lm", "build", "frontend"],
            outputs: ["luckymaker-frontend/dist/"]
        });

        expect(() => TaskModuleRegistry.validateModuleFields(task)).not.toThrow();
    });

    it("throws when sandbox parent is missing on build module validation", () => {
        const task = TaskModuleRegistry.parseTask({
            name: "yarn build",
            module: "build",
            sandbox: {
                parent: "luckymaker-workspace",
                workdir: "/workspace"
            },
            command: ["yarn", "build"],
            outputs: ["dist/"]
        });

        const invalid = {
            ...task,
            sandbox: {
                workdir: "/workspace"
            }
        };

        expect(() => TaskModuleRegistry.validateModuleFields(invalid)).toThrow();
    });
});
