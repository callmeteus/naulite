import { readFile } from "node:fs/promises";
import path from "node:path";

import { describe, expect, it } from "vitest";

const servicesViewPath = path.resolve(
    import.meta.dirname,
    "../../../packages/ui/packages/frontend/src/views/ServicesView.vue"
);
const serviceDetailViewPath = path.resolve(
    import.meta.dirname,
    "../../../packages/ui/packages/frontend/src/views/ServiceDetailView.vue"
);
const serviceManifestEditViewPath = path.resolve(
    import.meta.dirname,
    "../../../packages/ui/packages/frontend/src/views/ServiceManifestEditView.vue"
);
const manifestApplyFieldsPath = path.resolve(
    import.meta.dirname,
    "../../../packages/ui/packages/frontend/src/components/manifest/ManifestApplyFields.vue"
);
const instancesViewPath = path.resolve(
    import.meta.dirname,
    "../../../packages/ui/packages/frontend/src/views/InstancesView.vue"
);
const instanceDetailViewPath = path.resolve(
    import.meta.dirname,
    "../../../packages/ui/packages/frontend/src/views/InstanceDetailView.vue"
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

    it("links services to the detail page from ServicesView", async () => {
        const source = await readFile(servicesViewPath, "utf8");
        expect(source).toContain("/services/${service.name}");
    });

    it("loads service detail data in ServiceDetailView", async () => {
        const source = await readFile(serviceDetailViewPath, "utf8");
        expect(source).toContain("getService");
        expect(source).toContain("pages.serviceDetail.tabOverview");
    });

    it("exposes service lifecycle actions in ServiceDetailView", async () => {
        const source = await readFile(serviceDetailViewPath, "utf8");
        expect(source).toContain("stopService");
        expect(source).toContain("restartService");
        expect(source).toContain("store.deleteService");
        expect(source).toContain("/services/${encodeURIComponent(serviceName.value)}/edit");
    });

    it("uses the shared manifest editor for service manifest edits", async () => {
        const editView = await readFile(serviceManifestEditViewPath, "utf8");
        const fields = await readFile(manifestApplyFieldsPath, "utf8");

        expect(editView).toContain("ManifestApplyFields");
        expect(editView).toContain("useManifestApply");
        expect(editView).toContain("pages.serviceDetail.editManifestTitle");
        expect(fields).toContain("YamlEditor");
    });

    it("exposes an instance redispatch action in InstanceDetailView", async () => {
        const source = await readFile(instanceDetailViewPath, "utf8");
        expect(source).toContain("reconcileInstance");
        expect(source).toContain("pages.instanceDetail.redispatch");
    });

    it("exposes instance lifecycle actions in InstanceDetailView", async () => {
        const source = await readFile(instanceDetailViewPath, "utf8");
        expect(source).toContain("stopInstance");
        expect(source).toContain("startInstance");
        expect(source).toContain("restartInstance");
        expect(source).toContain("removeInstance");
        expect(source).toContain("pages.instanceDetail.tabLogs");
    });

    it("links instances to the detail page from InstancesView", async () => {
        const source = await readFile(instancesViewPath, "utf8");
        expect(source).toContain("/instances/${instance.id}");
    });

    it("proxies reconcile and lifecycle routes through the admin BFF", async () => {
        const source = await readFile(clusterRoutesPath, "utf8");
        expect(source).toContain('app.post("/instances/:id/reconcile"');
        expect(source).toContain('app.post("/services/:name/reconcile"');
        expect(source).toContain('app.post("/instances/:id/stop"');
        expect(source).toContain('app.post("/instances/:id/start"');
        expect(source).toContain('app.post("/instances/:id/restart"');
        expect(source).toContain('app.delete("/instances/:id"');
        expect(source).toContain('app.get("/services/:name"');
        expect(source).toContain('app.delete("/services/:name"');
        expect(source).toContain('app.get("/functions/:name/runs"');
    });
});
