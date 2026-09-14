import { describe, expect, it, beforeEach } from "vitest";

import { HostExecutorProvider } from "../../../packages/control-plane/src/runtime/HostExecutorProvider";
import { ApplyPlaybookRunner } from "../../../packages/control-plane/src/services/ApplyPlaybookRunner";

describe("ApplyPlaybookRunner", () => {
    beforeEach(() => {
        HostExecutorProvider.reset();
    });
    it("skips when the manifest has no tasks", async () => {
        const status = await ApplyPlaybookRunner.runIfPresent("run-1", {
            name: "empty",
            services: {},
            tasks: [],
            vars: {},
            volumes: {},
            networks: {},
            registries: {}
        });

        expect(status).toBe("skipped");
    });

    it("throws when a playbook runs without a bound host executor", async () => {
        await expect(ApplyPlaybookRunner.runIfPresent("run-1", {
            name: "gated-playbook",
            services: {},
            tasks: [
                {
                    name: "before-gate",
                    module: "command",
                    command: ["/bin/echo", "gated-before"]
                }
            ],
            vars: {},
            volumes: {},
            networks: {},
            registries: {}
        })).rejects.toThrow("Host executor is not configured.");
    });
});
