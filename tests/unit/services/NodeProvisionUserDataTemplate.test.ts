import { describe, expect, it } from "vitest";

import { NodeProvisionUserDataTemplate } from "../../../packages/control-plane/src/services/NodeProvisionUserDataTemplate";

describe("NodeProvisionUserDataTemplate", () => {
    it("renders bootstrap env vars and agent-install invocation", () => {
        const script = NodeProvisionUserDataTemplate.render({
            cpUrl: "https://cp.example.com",
            setupKey: "provision-setup-key",
            provisionId: "provision-1",
            nodeId: "node-1",
            labels: { role: "worker" },
            capabilities: ["docker"]
        });

        expect(script).toContain('export NAULITE_CP_URL="https://cp.example.com"');
        expect(script).toContain('export NAULITE_SETUP_KEY="provision-setup-key"');
        expect(script).toContain('export NAULITE_PROVISION_ID="provision-1"');
        expect(script).toContain('export NAULITE_NODE_ID="node-1"');
        expect(script).toContain('export NAULITE_LABELS=\'{"role":"worker"}\'');
        expect(script).toContain('export NAULITE_CAPABILITIES=\'["docker"]\'');
        expect(script).toContain("/tmp/naulite-agent-install.sh");
        expect(script).toContain('--host "https://cp.example.com"');
        expect(script).toContain('--setup-key "provision-setup-key"');
    });
});
