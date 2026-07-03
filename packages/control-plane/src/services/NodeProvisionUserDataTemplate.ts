import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Input values for rendering cloud-init userData that bootstraps a platform agent.
 */
export interface NodeProvisionUserDataInput {
    cpUrl: string;
    setupKey: string;
    provisionId: string;
    nodeId: string;
    labels: Record<string, string>;
    capabilities: string[];
}

/**
 * Renders EC2 userData scripts that install and register a platform agent.
 */
export namespace NodeProvisionUserDataTemplate {
    const moduleDir = dirname(fileURLToPath(import.meta.url));
    const agentInstallScriptPath = join(moduleDir, "..", "..", "..", "..", "bootstrap", "agent-install.sh");

    /**
     * Renders a bash userData script for AWS EC2 instances.
     *
     * @param input Bootstrap values injected into the agent install flow
     * @returns Bash userData script content
     */
    export function render(input: NodeProvisionUserDataInput): string {
        const labelsJson = JSON.stringify(input.labels);
        const capabilitiesJson = JSON.stringify(input.capabilities);
        const agentInstallScript = readAgentInstallScript();

        return `#!/bin/bash
set -euo pipefail

export PLATFORM_CP_URL="${escapeShell(input.cpUrl)}"
export PLATFORM_SETUP_KEY="${escapeShell(input.setupKey)}"
export PLATFORM_PROVISION_ID="${escapeShell(input.provisionId)}"
export PLATFORM_NODE_ID="${escapeShell(input.nodeId)}"
export PLATFORM_LABELS='${escapeSingleQuoted(labelsJson)}'
export PLATFORM_CAPABILITIES='${escapeSingleQuoted(capabilitiesJson)}'

if ! command -v docker >/dev/null 2>&1; then
    curl -fsSL https://get.docker.com | sh
    systemctl enable --now docker || true
fi

cat >/tmp/platform-agent-install.sh <<'PLATFORM_AGENT_INSTALL_EOF'
${agentInstallScript}
PLATFORM_AGENT_INSTALL_EOF
chmod +x /tmp/platform-agent-install.sh

/tmp/platform-agent-install.sh \\
    --host "${escapeShell(input.cpUrl)}" \\
    --setup-key "${escapeShell(input.setupKey)}"
`;
    }

    /**
     * Reads the agent install script from the repository bootstrap directory.
     *
     * @returns Agent install script source
     */
    function readAgentInstallScript(): string {
        return readFileSync(agentInstallScriptPath, "utf8");
    }

    /**
     * Escapes a value for double-quoted shell strings.
     *
     * @param value Raw value
     * @returns Escaped shell string
     */
    function escapeShell(value: string): string {
        return value.replace(/\\/g, "\\\\").replace(/"/g, "\\\"");
    }

    /**
     * Escapes a value embedded in single-quoted shell strings.
     *
     * @param value Raw value
     * @returns Escaped shell string
     */
    function escapeSingleQuoted(value: string): string {
        return value.replace(/'/g, "'\\''");
    }
}
