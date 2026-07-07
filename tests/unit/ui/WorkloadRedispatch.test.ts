import { readFile } from "node:fs/promises";
import path from "node:path";

import { describe, expect, it } from "vitest";

const servicesViewPath = path.resolve(
    import.meta.dirname,
    "../../../packages/ui/packages/frontend/src/views/ServicesView.vue"
);
const instancesViewPath = path.resolve(
    import.meta.dirname,
    "../../../packages/ui/packages/frontend/src/views/InstancesView.vue"
);
const clusterRoutesPath = path.resolve(
    import.meta.dirname,
    "../../../packages/ui/packages/backend/src/routes/cluster.ts"
);

describe("Workload redispatch UI", () => {
    it("exposes a service redispatch action in ServicesView", async () => {
        const source = await readFile(servicesViewPath, "utf8");
        expect(source).toContain("reconcileService");
        expect(source).toContain("pages.services.redispatch");
    });

    it("exposes an instance redispatch action in InstancesView", async () => {
        const source = await readFile(instancesViewPath, "utf8");
        expect(source).toContain("reconcileInstance");
        expect(source).toContain("pages.instances.redispatch");
    });

    it("proxies reconcile routes through the admin BFF", async () => {
        const source = await readFile(clusterRoutesPath, "utf8");
        expect(source).toContain('app.post("/instances/:id/reconcile"');
        expect(source).toContain('app.post("/services/:name/reconcile"');
    });
});
