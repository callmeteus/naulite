import { TaskModuleRegistry } from "../../../../packages/control-plane/src/orchestration/TaskModuleRegistry";
import { FakeHostExecutor } from "../../../harness/FakeHostExecutor";
import { describe, expect, it } from "vitest";

describe("AptModule", () => {
    it("runs apt module happily", async () => {
        const task = TaskModuleRegistry.parseTask({
            name: "apt packages",
            module: "apt",
            packages: ["curl", "git"]
        });
        TaskModuleRegistry.validateModuleFields(task);
        const executor = new FakeHostExecutor();
        const result = await executor.execute("node-a", task, {});

        expect(result.changed).toBe(true);
        expect(executor.getCalls()[0]?.kind).toBe("apt");
    });

    it("fails when packages list is empty", () => {
        const task = TaskModuleRegistry.parseTask({
            name: "apt packages",
            module: "apt",
            packages: []
        });

        expect(() => TaskModuleRegistry.validateModuleFields(task)).toThrow();
    });
});
