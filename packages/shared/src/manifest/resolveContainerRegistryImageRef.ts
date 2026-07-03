/**
 * Scheme prefix for platform container registry image references in manifests and plans.
 */
export const CONTAINER_REGISTRY_SCHEME = "container-registry://";

/**
 * Docker image prefix used after loading an image from the platform container registry.
 */
export const PLATFORM_CR_DOCKER_PREFIX = "platform-cr/";

/**
 * Parsed name and tag from a container registry image reference.
 */
export interface ParsedContainerRegistryRef {
    name: string;
    tag: string;
}

/**
 * Returns whether an image reference uses the platform container registry scheme.
 *
 * @param ref Image reference string
 * @returns True when the ref starts with `container-registry://`
 */
export function isContainerRegistryRef(ref: string): boolean {
    return ref.startsWith(CONTAINER_REGISTRY_SCHEME);
}

/**
 * Parses a `container-registry://name:tag` reference.
 *
 * @param ref Image reference string
 * @returns Parsed name and tag, or null when the ref is invalid
 */
export function parseContainerRegistryRef(ref: string): ParsedContainerRegistryRef | null {
    if (!isContainerRegistryRef(ref)) {
        return null;
    }

    const remainder = ref.slice(CONTAINER_REGISTRY_SCHEME.length);
    const separator = remainder.lastIndexOf(":");

    if (separator <= 0 || separator === remainder.length - 1) {
        return null;
    }

    return {
        name: remainder.slice(0, separator),
        tag: remainder.slice(separator + 1)
    };
}

/**
 * Builds a `container-registry://name:tag` reference.
 *
 * @param name Image name stored in the platform registry
 * @param tag Image tag stored in the platform registry
 * @returns Container registry image reference
 */
export function toContainerRegistryRef(name: string, tag: string): string {
    return `${CONTAINER_REGISTRY_SCHEME}${name}:${tag}`;
}

/**
 * Resolves the pull specification for a container registry reference.
 *
 * @param ref Image reference string
 * @returns Parsed name and tag when the ref is a container registry reference
 */
export function toCrPullSpec(ref: string): ParsedContainerRegistryRef | null {
    return parseContainerRegistryRef(ref);
}

/**
 * Returns whether a Docker image reference was produced by the platform container registry pull path.
 *
 * @param ref Docker image reference
 * @returns True when the ref uses the `platform-cr/` prefix
 */
export function isPlatformCrDockerRef(ref: string): boolean {
    return ref.startsWith(PLATFORM_CR_DOCKER_PREFIX);
}

/**
 * Resolves the image name stored in the platform container registry for a manifest service.
 *
 * @param manifestName Manifest name
 * @param serviceName Service name
 * @returns Registry image name
 */
export function resolveContainerRegistryImageName(manifestName: string, serviceName: string): string {
    return `${manifestName}-${serviceName}`;
}

/**
 * Resolves the default container registry reference for a built manifest service.
 *
 * @param manifestName Manifest name
 * @param serviceName Service name
 * @param tag Image tag
 * @returns Container registry image reference
 */
export function resolveContainerRegistryImageRef(
    manifestName: string,
    serviceName: string,
    tag = "latest"
): string {
    return toContainerRegistryRef(resolveContainerRegistryImageName(manifestName, serviceName), tag);
}

/**
 * Resolves the local Docker tag used while building an image on a builder agent.
 *
 * @param manifestName Manifest name
 * @param serviceName Service name
 * @param tag Image tag
 * @returns Docker image tag for `docker build -t`
 */
export function resolveDockerBuildTag(manifestName: string, serviceName: string, tag = "latest"): string {
    return `platform/${manifestName}-${serviceName}:${tag}`;
}

/**
 * Resolves the Docker image reference used by agents after pulling from the platform registry.
 *
 * @param manifestName Manifest name
 * @param serviceName Service name
 * @param tag Image tag
 * @returns Docker image reference with the `platform-cr/` prefix
 */
export function resolvePlatformCrDockerRef(manifestName: string, serviceName: string, tag = "latest"): string {
    return `${PLATFORM_CR_DOCKER_PREFIX}${manifestName}-${serviceName}:${tag}`;
}
