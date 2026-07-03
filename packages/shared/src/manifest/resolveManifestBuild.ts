import type { ManifestBuild, ManifestService } from "../types/Manifest";

import { resolveContainerRegistryImageName, toContainerRegistryRef } from "./resolveContainerRegistryImageRef";
/**
 * Resolves the normalized build block for a manifest service.
 *
 * @param service Manifest service definition
 * @returns Build block when the service builds from source
 */
export function resolveManifestBuild(service: ManifestService): ManifestBuild | null {
    if (!service.build) {
        return null;
    }

    if (typeof service.build === "string") {
        return {
            context: service.build,
            provider: "docker"
        };
    }

    return service.build;
}

/**
 * Resolves the runtime image reference for a manifest service.
 *
 * @param manifestName Manifest name
 * @param serviceName Service name
 * @param service Manifest service definition
 * @returns Image reference used at runtime
 */
export function resolveServiceImageRef(
    manifestName: string,
    serviceName: string,
    service: ManifestService
): string {
    if (service.image) {
        return service.image;
    }

    const build = resolveManifestBuild(service);

    if (build?.image) {
        return build.image;
    }

    return toContainerRegistryRef(resolveContainerRegistryImageName(manifestName, serviceName), "latest");
}
