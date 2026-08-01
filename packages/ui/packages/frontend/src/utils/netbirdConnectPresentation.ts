import type { NetBirdEnrollment } from "@naulite/sdk";

import type { TerminalPlatform } from "../components/ui/PlatformTerminalTabs.vue";

const PS_LINE_CONTINUATION = "`";

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
        return [
            `$setupKey = "${enrollment.setupKey}"`,
            `.\\bootstrap\\agent-install.ps1 ${PS_LINE_CONTINUATION}`,
            `  -HostUrl "${enrollment.cpUrl}" ${PS_LINE_CONTINUATION}`,
            "  -SetupKey $setupKey"
        ].join("\n");
    }

    return [
        "sudo bash bootstrap/agent-install.sh \\",
        `  --host ${enrollment.cpUrl} \\`,
        `  --setup-key "${enrollment.setupKey}" \\`,
        `  --netbird-management-url "${enrollment.netbirdManagementUrl}"`
    ].join("\n");
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
