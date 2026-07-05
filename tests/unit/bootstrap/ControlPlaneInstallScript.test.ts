import { readFile } from "node:fs/promises";
import path from "node:path";

import { afterEach, beforeAll, describe, expect, it } from "vitest";

import {
    assertBashSyntax,
    createTempPlatformRoot,
    removeTempPlatformRoot,
    resolveBashExecutable,
    runBootstrapScript
} from "./ShellRunner";

const bashAvailable = await resolveBashExecutable();
const describeBootstrap = bashAvailable ? describe : describe.skip;

describeBootstrap("control-plane-install.sh", () => {
    const tempRoots: string[] = [];

    afterEach(async () => {
        while (tempRoots.length > 0) {
            const tempRoot = tempRoots.pop();
            if (tempRoot) {
                await removeTempPlatformRoot(tempRoot);
            }
        }
    });

    beforeAll(async () => {
        await assertBashSyntax("control-plane-install.sh");
    });

    it("prints help without requiring docker", async () => {
        const result = await runBootstrapScript("control-plane-install.sh", ["--help"]);

        expect(result.exitCode).toBe(0);
        expect(result.stdout).toContain("--host");
        expect(result.stdout).toContain("--dry-run");
    });

    it("fails when --host is missing", async () => {
        const result = await runBootstrapScript("control-plane-install.sh", []);

        expect(result.exitCode).toBe(1);
        expect(result.stderr + result.stdout).toContain("--host is required when not running on an interactive terminal");
    });

    it("writes bootstrap env values during dry-run", async () => {
        const tempRoot = await createTempPlatformRoot();
        tempRoots.push(tempRoot);

        const result = await runBootstrapScript(
            "control-plane-install.sh",
            [
                "--dry-run",
                "--host",
                "https://cp.example.com/",
                "--netbird-domain",
                "vpn.example.com",
                "--netbird-http-protocol",
                "https",
                "--netbird-public-management-url",
                "https://vpn.example.com/",
                "--netbird-server-port",
                "9443"
            ],
            {
                NAULITE_ROOT: tempRoot
            }
        );

        expect(result.exitCode).toBe(0);
        expect(result.stdout).toContain("dry-run complete");

        const envContents = await readFile(path.join(tempRoot, "dogfood", ".env"), "utf8");
        expect(envContents).toContain("NAULITE_PUBLIC_URL=https://cp.example.com");
        expect(envContents).toContain("NETBIRD_PUBLIC_MANAGEMENT_URL=https://vpn.example.com");
        expect(envContents).toContain("NETBIRD_DOMAIN=vpn.example.com");
        expect(envContents).toContain("NETBIRD_HTTP_PROTOCOL=https");
        expect(envContents).toContain("NETBIRD_SERVER_PORT=9443");
        expect(envContents).toContain("PROMETHEUS_URL=http://naulite-prometheus:9090");
        expect(envContents).toContain("NAULITE_PROMETHEUS_FILE_SD_DIR=/var/lib/naulite/prometheus/file_sd");
        expect(envContents).toContain("NAULITE_METRICS_SYNC_ENABLED=true");
        expect(envContents).toContain("POSTGRES_HA_ENABLED=true");
        expect(envContents).toContain("DATABASE_URL=postgres://naulite:naulite@pgpool:5432/naulite");
    });

    it("creates .env from .env.example when missing", async () => {
        const tempRoot = await createTempPlatformRoot();
        tempRoots.push(tempRoot);

        const result = await runBootstrapScript(
            "control-plane-install.sh",
            [
                "--dry-run",
                "--host",
                "http://localhost:8080"
            ],
            {
                NAULITE_ROOT: tempRoot
            }
        );

        expect(result.exitCode).toBe(0);
        expect(result.stdout).toContain("created dogfood/.env from dogfood/.env.example");

        const envContents = await readFile(path.join(tempRoot, "dogfood", ".env"), "utf8");
        expect(envContents).toContain("NAULITE_PUBLIC_URL=http://localhost:8080");
    });
});
