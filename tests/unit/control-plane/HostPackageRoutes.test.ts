import { readFile } from "node:fs/promises";
import path from "node:path";

import { describe, expect, it } from "vitest";

const inventoryRoutePath = path.resolve(
    import.meta.dirname,
    "../../../packages/control-plane/src/routes/nodes/[id]/host/inventory.ts"
);
const packageUpdateRoutePath = path.resolve(
    import.meta.dirname,
    "../../../packages/control-plane/src/routes/nodes/[id]/host/packages/update.ts"
);
const systemUpdateRoutePath = path.resolve(
    import.meta.dirname,
    "../../../packages/control-plane/src/routes/nodes/[id]/host/system/update.ts"
);

describe("host package routes", () => {
    it("guards inventory reads with nodes:read", async () => {
        const source = await readFile(inventoryRoutePath, "utf8");
        expect(source).toContain('authorizedWithPermission("nodes:read")');
    });

    it("guards package updates with nodes:host-update", async () => {
        const source = await readFile(packageUpdateRoutePath, "utf8");
        expect(source).toContain('authorizedWithPermission("nodes:host-update")');
    });

    it("guards system updates with nodes:host-update", async () => {
        const source = await readFile(systemUpdateRoutePath, "utf8");
        expect(source).toContain('authorizedWithPermission("nodes:host-update")');
    });
});
