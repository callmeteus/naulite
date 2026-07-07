import { readFile } from "node:fs/promises";
import path from "node:path";

import { describe, expect, it } from "vitest";

const registerRoutePath = path.resolve(
    import.meta.dirname,
    "../../../packages/control-plane/src/routes/nodes/register.ts"
);

describe("POST /nodes/register", () => {
    it("triggers instance reconciliation when agentUrl is present", async () => {
        const source = await readFile(registerRoutePath, "utf8");
        expect(source).toContain("ControlPlaneService.InstanceReconciler.reconcileNode(node.id)");
        expect(source).toContain("if (body.agentUrl)");
    });
});
