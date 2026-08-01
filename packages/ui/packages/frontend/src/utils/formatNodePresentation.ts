import type { NodeResources } from "@naulite/sdk";

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
 * Formats node CPU usage as a percentage of schedulable capacity.
 *
 * @param resources Node resource snapshot
 * @returns Percentage label or "-" when unavailable
 */
export function formatNodeCpuUsage(resources?: NodeResources | null): string {
    if (!resources?.cpuMillisTotal) {
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
    if (!resources?.memoryMbTotal) {
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
