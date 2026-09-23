import type { Service } from "@naulite/sdk";

/**
 * Formats the operator-facing service label as manifest-service.
 *
 * @param manifestName Manifest name from GitOps metadata
 * @param serviceName Service key inside the manifest
 * @returns Display label such as cloop-agent
 */
export function formatServiceDisplayName(
    manifestName?: string | null,
    serviceName?: string | null
): string {
    const manifest = (manifestName ?? "").trim();
    const name = (serviceName ?? "").trim();

    if (!name) {
        return manifest || "-";
    }

    if (!manifest) {
        return name;
    }

    return `${manifest}-${name}`;
}

/**
 * Formats the operator-facing service label from a service record.
 *
 * @param service Service metadata
 * @returns Display label such as cloop-agent
 */
export function formatServiceDisplayNameFromService(
    service: Pick<Service, "manifestName" | "name">
): string {
    return formatServiceDisplayName(service.manifestName, service.name);
}
