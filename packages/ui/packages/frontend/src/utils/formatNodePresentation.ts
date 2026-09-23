import type { Node, NodeResources } from "@naulite/sdk";

/**
 * Resolves the status label shown in the UI when live inventory proves the agent is down.
 *
 * @param nodeStatus Status from the cluster store
 * @param agentInventoryUnreachable True when host inventory failed with an agent connectivity error
 * @returns Status for badges on the node detail page
 */
export function resolveNodeDetailDisplayStatus(
    nodeStatus: Node["status"] | undefined,
    agentInventoryUnreachable: boolean
): Node["status"] | undefined {
    if (agentInventoryUnreachable) {
        return "offline";
    }

    return nodeStatus;
}

/**
 * Formats a concise operating system label for node tables.
 *
 * @param osFamily Reported OS family
 * @param osVersion Reported OS version string
 * @returns Short label such as "Windows 10" or "Ubuntu 22.04"
 */
export function formatNodeOsLabel(osFamily?: string | null, osVersion?: string | null): string {
    const version = (osVersion ?? "").trim();

    if (version) {
        const simplified = simplifyOsVersion(version);

        if (simplified) {
            return simplified;
        }
    }

    switch (osFamily) {
        case "windows":
            return "Windows";
        case "macos":
            return "macOS";
        case "linux":
            return "Linux";
        default:
            return version || osFamily || "-";
    }
}

/**
 * Returns whether resource numbers match the agent fallback snapshot (not real telemetry).
 *
 * @param resources Node resource snapshot from heartbeat
 * @returns True when values look like the hard-coded fallback
 */
export function isPlaceholderNodeResources(resources?: NodeResources | null): boolean {
    if (!resources) {
        return false;
    }

    return resources.cpuMillisTotal === 1000
        && resources.cpuMillisUsed === 0
        && resources.memoryMbTotal === 1024
        && resources.memoryMbUsed === 0
        && resources.diskMbTotal === 102_401
        && resources.diskMbUsed === 0;
}

/**
 * Formats node CPU usage as a percentage of schedulable capacity.
 *
 * @param resources Node resource snapshot
 * @returns Percentage label or "-" when unavailable
 */
export function formatNodeCpuUsage(resources?: NodeResources | null): string {
    if (!resources?.cpuMillisTotal || isPlaceholderNodeResources(resources)) {
        return "-";
    }

    const percent = Math.round((resources.cpuMillisUsed / resources.cpuMillisTotal) * 100);

    return `${percent}%`;
}

/**
 * Formats node memory usage as used versus total capacity.
 *
 * @param resources Node resource snapshot
 * @returns Memory label or "-" when unavailable
 */
export function formatNodeMemoryUsage(resources?: NodeResources | null): string {
    if (!resources?.memoryMbTotal || isPlaceholderNodeResources(resources)) {
        return "-";
    }

    if (resources.memoryMbTotal >= 1024) {
        const usedGb = (resources.memoryMbUsed / 1024).toFixed(1);
        const totalGb = (resources.memoryMbTotal / 1024).toFixed(0);

        return `${usedGb} / ${totalGb} GB`;
    }

    return `${resources.memoryMbUsed} / ${resources.memoryMbTotal} MB`;
}

/**
 * Normalizes verbose agent or cloud OS version strings.
 *
 * @param raw Raw OS version string
 * @returns Short product label
 */
export function simplifyOsVersion(raw: string): string {
    const normalized = raw
        .replace(/^Microsoft\s+/i, "")
        .replace(/\s+/g, " ")
        .trim();

    if (/^Windows\s*11\b/i.test(normalized)) {
        return "Windows 11";
    }

    if (/^Windows\s*10\b/i.test(normalized)) {
        return "Windows 10";
    }

    const windowsMatch = normalized.match(/^Windows\s+(\d+)/i);

    if (windowsMatch) {
        return `Windows ${windowsMatch[1]}`;
    }

    const ubuntuMatch = normalized.match(/Ubuntu\s+(\d+(?:\.\d+)?)/i);

    if (ubuntuMatch) {
        return `Ubuntu ${ubuntuMatch[1]}`;
    }

    const debianMatch = normalized.match(/Debian\s+GNU\/Linux\s+(\d+)/i);

    if (debianMatch) {
        return `Debian ${debianMatch[1]}`;
    }

    const fedoraMatch = normalized.match(/Fedora(?:\s+Linux)?\s+(\d+)/i);

    if (fedoraMatch) {
        return `Fedora ${fedoraMatch[1]}`;
    }

    if (/^macOS\b/i.test(normalized)) {
        return normalized.replace(/^macos/i, "macOS");
    }

    const withoutBuildTriple = normalized.replace(/\s+\d+\.\d+\.\d+\s*$/u, "").trim();

    if (withoutBuildTriple.length > 0 && withoutBuildTriple.length < normalized.length) {
        return withoutBuildTriple;
    }

    return normalized;
}
