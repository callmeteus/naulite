import { afterEach, describe, expect, it } from "vitest";

import { resolvePublicAgentInstallScriptUrl } from "../../../packages/control-plane/src/bootstrap/BootstrapUrls";

describe("resolvePublicAgentInstallScriptUrl", () => {
    afterEach(() => {
        delete process.env.NAULITE_AGENT_INSTALL_SCRIPT_URL;
    });

    it("returns the configured public script URL when set", () => {
        process.env.NAULITE_AGENT_INSTALL_SCRIPT_URL = "https://mirror.example.com/agent-install.sh";

        expect(resolvePublicAgentInstallScriptUrl()).toBe("https://mirror.example.com/agent-install.sh");
    });

    it("falls back to the default GitHub raw script URL", () => {
        expect(resolvePublicAgentInstallScriptUrl()).toContain("bootstrap/agent-install.sh");
    });
});
