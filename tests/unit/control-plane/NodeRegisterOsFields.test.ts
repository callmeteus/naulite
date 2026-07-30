import { readFile } from "node:fs/promises";
import path from "node:path";

import { describe, expect, it } from "vitest";

const registerRoutePath = path.resolve(
    import.meta.dirname,
    "../../../packages/control-plane/src/routes/nodes/register.ts"
);
const heartbeatRoutePath = path.resolve(
    import.meta.dirname,
    "../../../packages/control-plane/src/routes/nodes/[id]/heartbeat.ts"
);

describe("node OS fields", () => {
    it("accepts osFamily, osVersion, and arch during register", async () => {
        const source = await readFile(registerRoutePath, "utf8");
        expect(source).toContain("osFamily: NodeOsFamilySchema.optional()");
        expect(source).toContain("osFamily: body.osFamily ?? existing?.osFamily");
    });

    it("accepts osFamily, osVersion, and arch during heartbeat", async () => {
        const source = await readFile(heartbeatRoutePath, "utf8");
        expect(source).toContain("osFamily: NodeOsFamilySchema.optional()");
        expect(source).toContain("osFamily: body.osFamily");
    });
});
