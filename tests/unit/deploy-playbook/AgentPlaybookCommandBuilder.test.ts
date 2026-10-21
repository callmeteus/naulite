import { describe, expect, it } from "vitest";

import { AgentPlaybookCommandBuilder } from "../../../packages/control-plane/src/services/deploy-playbook/AgentPlaybookCommandBuilder";

describe("AgentPlaybookCommandBuilder", () => {
    it("builds s3 download argv", () => {
        const argv = AgentPlaybookCommandBuilder.buildArgv({
            name: "download-backend",
            module: "s3",
            bucket: "luckymaker-src",
            key: "master/abc/demo/backend.tar.gz",
            dest: "/tmp/lm/backend.tar.gz",
            action: "download"
        });

        expect(argv).not.toBeNull();
        expect(argv?.join(" ")).toContain("aws s3 cp");
    });

    it("includes endpoint-url flag when task env sets AWS_ENDPOINT_URL", () => {
        const argv = AgentPlaybookCommandBuilder.buildArgv({
            name: "download-backend",
            module: "s3",
            bucket: "luckymaker-src",
            key: "master/abc/demo/backend.tar.gz",
            dest: "/tmp/lm/backend.tar.gz",
            action: "download",
            env: {
                AWS_ENDPOINT_URL: "http://host.docker.internal:4566"
            }
        });

        expect(argv?.join(" ")).toContain('--endpoint-url="http://host.docker.internal:4566"');
    });

    it("builds pm2 reload argv", () => {
        const argv = AgentPlaybookCommandBuilder.buildArgv({
            name: "demo-backend",
            module: "unit",
            kind: "pm2",
            state: "reloaded"
        });

        expect(argv?.join(" ")).toContain("pm2 reload");
    });

    it("prefers task env endpoint for s3 downloads", () => {
        const env = AgentPlaybookCommandBuilder.buildEnv({
            name: "download-backend",
            module: "s3",
            env: {
                AWS_ENDPOINT_URL: "http://host.docker.internal:4566"
            }
        });

        expect(env.AWS_ENDPOINT_URL).toBe("http://host.docker.internal:4566");
    });

    it("returns null for command module", () => {
        const argv = AgentPlaybookCommandBuilder.buildArgv({
            name: "raw",
            module: "command",
            command: "echo hi"
        });

        expect(argv).toBeNull();
    });
});
