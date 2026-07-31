import { describe, expect, it } from "vitest";

import type { NetBirdEnrollment } from "@naulite/sdk";

import {
    buildInfrastructureInstallCommand,
    buildTeamCliConnectCommand
} from "../../../packages/ui/packages/frontend/src/utils/netbirdConnectPresentation";

const enrollment: NetBirdEnrollment = {
    setupKey: "setup-key-123",
    cpUrl: "https://cp.example.com",
    netbirdManagementUrl: "https://netbird.example.com"
};

describe("netbirdConnectPresentation", () => {
    it("builds windows infrastructure install command", () => {
        const command = buildInfrastructureInstallCommand(enrollment, "windows");

        expect(command).toContain("setup-key-123");
        expect(command).toContain("https://cp.example.com");
        expect(command).toContain("agent-install.ps1");
    });

    it("builds unix infrastructure install command", () => {
        const command = buildInfrastructureInstallCommand(enrollment, "unix");

        expect(command).toContain("agent-install.sh");
        expect(command).toContain("--netbird-management-url \"https://netbird.example.com\"");
    });

    it("builds team cli commands for both platforms", () => {
        expect(buildTeamCliConnectCommand(enrollment, "windows")).toContain("netbird up");
        expect(buildTeamCliConnectCommand(enrollment, "unix")).toContain("pkgs.netbird.io/install.sh");
    });
});
