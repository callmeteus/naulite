import { ControlPlaneService } from "../ControlPlaneService";
import { AuthPreHandlers } from "../auth/AuthPreHandlers";
import { defineRoute } from "../routing/DefineRoute";
import { RegistryListResponseSchema } from "@platform/shared";

export const GET = defineRoute({
    preHandler: AuthPreHandlers.authorizedLocalOrApiKey,
    schema: {
        summary: "List registries",
        description: "Lists registries referenced by the most recently applied manifests.",
        tags: ["registry"],
        operationId: "listRegistries",
        response: {
            200: RegistryListResponseSchema
        }
    },
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
