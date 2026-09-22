import type { NetBirdEnrollment } from "@naulite/sdk";

import type { TerminalPlatform } from "../components/ui/TerminalPlatform";

/**
 * Resolves the Windows PowerShell installer script URL from the Linux/bash URL.
 *
 * @param enrollment NetBird enrollment details
 * @returns PowerShell script download URL
 */
export function resolveAgentInstallPs1Url(enrollment: NetBirdEnrollment): string {
    if (enrollment.agentInstallScriptUrl.endsWith(".sh")) {
        return `${enrollment.agentInstallScriptUrl.slice(0, -3)}.ps1`;
    }

    return enrollment.agentInstallScriptUrl.replace(/agent-install\.sh$/, "agent-install.ps1");
}

/**
 * Builds a one-line curl installer for Linux/macOS (download script, setup key, mesh).
 *
 * @param enrollment NetBird enrollment details
 * @returns Single shell command ready to paste on the host
 */
export function buildInfrastructureCurlInstallCommand(enrollment: NetBirdEnrollment): string {
    return [
        `curl -fsSL "${enrollment.agentInstallScriptUrl}" | sudo bash -s -- \\`,
        `  --host "${enrollment.cpUrl}" \\`,
        `  --setup-key "${enrollment.setupKey}" \\`,
        `  --netbird-management-url "${enrollment.netbirdManagementUrl}"`
    ].join("\n");
}

/**
 * Builds a one-line PowerShell flow to download and run the agent installer on Windows.
 *
 * @param enrollment NetBird enrollment details
 * @returns Multi-line PowerShell command block
 */
export function buildInfrastructureWindowsDownloadInstallCommand(enrollment: NetBirdEnrollment): string {
    const ps1Url = resolveAgentInstallPs1Url(enrollment);

    return [
        `$script = Join-Path $env:TEMP "naulite-agent-install.ps1"`,
        `Invoke-WebRequest -Uri "${ps1Url}" -OutFile $script`,
        `& $script -HostUrl "${enrollment.cpUrl}" -SetupKey "${enrollment.setupKey}"`
    ].join("\n");
}

/**
 * Builds the infrastructure node installer command for the selected platform.
 *
 * @param enrollment NetBird enrollment details
 * @param platform Target shell platform
 * @returns Multi-line install command
 */
export function buildInfrastructureInstallCommand(
    enrollment: NetBirdEnrollment,
    platform: TerminalPlatform
): string {
    if (platform === "windows") {
        return buildInfrastructureWindowsDownloadInstallCommand(enrollment);
    }

    return buildInfrastructureCurlInstallCommand(enrollment);
}

/**
 * Builds the team device CLI enrollment command for the selected platform.
 *
 * @param enrollment NetBird enrollment details
 * @param platform Target shell platform
 * @returns Multi-line connect command
 */
export function buildTeamCliConnectCommand(
    enrollment: NetBirdEnrollment,
    platform: TerminalPlatform
): string {
    if (platform === "windows") {
        return [
            "# Install the VPN client from https://netbird.io/download if needed",
            `netbird up --management-url "${enrollment.netbirdManagementUrl}" --setup-key "${enrollment.setupKey}"`
        ].join("\n");
    }

    return [
        "curl -fsSL https://pkgs.netbird.io/install.sh | sh",
        `netbird up --management-url "${enrollment.netbirdManagementUrl}" --setup-key "${enrollment.setupKey}"`
    ].join("\n");
}
