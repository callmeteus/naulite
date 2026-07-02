import { ControlPlaneService } from "../ControlPlaneService";
import { defineRoute } from "../routing/DefineRoute";

export const GET = defineRoute({
    async handler() {
        const revisions = await ControlPlaneService.GitOps.listRevisions();
        const latestByManifest = new Map<string, (typeof revisions)[number]>();

        for (const revision of revisions) {
            const current = latestByManifest.get(revision.manifestName);
            if (!current || revision.appliedAt > current.appliedAt) {
                latestByManifest.set(revision.manifestName, revision);
            }
        }

        const registryIds = new Set<string>();
        for (const revision of latestByManifest.values()) {
            try {
                const manifest = ControlPlaneService.Orchestration.ComposeParser.parse(revision.manifestYaml);
                for (const registryName of Object.keys(manifest.registries)) {
                    registryIds.add(registryName);
                }
            } catch (err) {
                console.debug("[registry] skip manifest=%s parse failed: %o", revision.manifestName, err);
            }
        }

        return {
            registries: [...registryIds].sort()
        };
    }
});
