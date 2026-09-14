import { readFile } from "node:fs/promises";
import path from "node:path";

import { describe, expect, it } from "vitest";

const appPath = path.resolve(
    import.meta.dirname,
    "../../../packages/control-plane/src/App.ts"
);

describe("host executor bootstrap", () => {
    it("binds AgentHostExecutor when the control plane app starts", async () => {
        const source = await readFile(appPath, "utf8");

        expect(source).toContain("HostExecutorProvider.set(new AgentHostExecutor())");
        expect(source.indexOf("ControlPlaneService.install(context)")).toBeLessThan(
            source.indexOf("HostExecutorProvider.set(new AgentHostExecutor())")
        );
    });
});
