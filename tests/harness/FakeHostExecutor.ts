import type { Task } from "@naulite/shared";

import type {
    HostExecutor,
    HostExecutorCall,
    HostExecutorResult
} from "../../packages/control-plane/src/runtime/HostExecutor";
import { HostSessionPath } from "../../packages/control-plane/src/runtime/HostSessionPath";

/**
 * In-memory host executor for unit tests (records every module call).
 */
export class FakeHostExecutor implements HostExecutor {
    private readonly calls: HostExecutorCall[] = [];
    private readonly sessions = new Map<string, ReturnType<typeof HostSessionPath.create>>();

    /**
     * @inheritdoc
     */
    async execute(nodeId: string, task: Task, context: Record<string, unknown>): Promise<HostExecutorResult> {
        const payload = { ...context };
        this.calls.push({
            kind: task.module,
            nodeId,
            task,
            payload
        });

        if (task.module === "confirm") {
            return {
                confirmed: task.default !== false
            };
        }

        if (task.module === "nvm") {
            const session = this.sessionFor(nodeId);
            HostSessionPath.applyNvmInstall(session, String(task.version ?? ""), task.nvmVersion ? `~/.nvm` : "~/.nvm");
            return { changed: true };
        }

        if (task.module === "npm") {
            const session = this.sessionFor(nodeId);

            if (!HostSessionPath.hasNodeOnPath(session)) {
                throw new Error("node is not on PATH; run nvm module first");
            }

            return { changed: true };
        }

        if (task.module === "command" && Array.isArray(task.command) && task.command.length === 0) {
            throw new Error("command must not be empty");
        }

        return { changed: true, rc: 0, stdout: "" };
    }

    /**
     * @inheritdoc
     */
    getCalls(): HostExecutorCall[] {
        return [...this.calls];
    }

    /**
     * Returns session PATH state for a node.
     *
     * @param nodeId Node id
     * @returns Session state
     */
    sessionFor(nodeId: string): ReturnType<typeof HostSessionPath.create> {
        const existing = this.sessions.get(nodeId);

        if (existing) {
            return existing;
        }

        const created = HostSessionPath.create();
        this.sessions.set(nodeId, created);
        return created;
    }
}
