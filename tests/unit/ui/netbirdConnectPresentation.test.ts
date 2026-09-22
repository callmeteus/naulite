import { describe, expect, it } from "vitest";

import type { NetBirdEnrollment } from "@naulite/sdk";

import {
    buildInfrastructureCurlInstallCommand,
    buildInfrastructureInstallCommand,
    resolveAgentInstallPs1Url
} from "../../../packages/ui/packages/frontend/src/utils/netbirdConnectPresentation";

const enrollment: NetBirdEnrollment = {
    setupKey: "nb_test_key",
    cpUrl: "https://cp.example.com",
    netbirdManagementUrl: "https://netbird.example.com",
    agentInstallScriptUrl: "https://cdn.example.com/bootstrap/agent-install.sh"
};

describe("netbirdConnectPresentation", () => {
    it("builds curl install with download URL, host, setup key, and mesh URL", () => {
        const command = buildInfrastructureCurlInstallCommand(enrollment);

        expect(command).toContain(enrollment.agentInstallScriptUrl);
        expect(command).toContain(enrollment.cpUrl);
        expect(command).toContain(enrollment.setupKey);
        expect(command).toContain(enrollment.netbirdManagementUrl);
    });

    it("derives the PowerShell installer URL from the bash script URL", () => {
        expect(resolveAgentInstallPs1Url(enrollment)).toBe(
            "https://cdn.example.com/bootstrap/agent-install.ps1"
        );
    });

    it("returns unix curl command for unix platform", () => {
        const command = buildInfrastructureInstallCommand(enrollment, "unix");

        expect(command).toContain("curl -fsSL");
    });

    it("returns PowerShell download flow for windows platform", () => {
        const command = buildInfrastructureInstallCommand(enrollment, "windows");

        expect(command).toContain("Invoke-WebRequest");
        expect(command).toContain("agent-install.ps1");
    });
});
