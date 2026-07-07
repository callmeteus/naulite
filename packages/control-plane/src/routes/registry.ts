import { ControlPlaneService } from "../ControlPlaneService";
import { PermissionPreHandlers } from "../auth/PermissionPreHandlers";
import { defineRoute } from "../routing/DefineRoute";
import { RegistryListResponseSchema } from "@naulite/shared";
import { Logger } from "../Logger";
const log_registry = Logger.create("registry");


export const GET = defineRoute({
    preHandler: PermissionPreHandlers.authorizedWithPermission("registry:read"),
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
                log_registry.debug("skip manifest=%s parse failed: %o", revision.manifestName, err);
            }
        }

        return {
            registries: [...registryIds].sort()
        };
    }
});
