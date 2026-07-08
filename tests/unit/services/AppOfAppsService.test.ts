import { mkdtemp, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { describe, expect, it, vi } from "vitest";

import { AppOfAppsService } from "../../../packages/control-plane/src/services/AppOfAppsService";
import { ApplyService } from "../../../packages/control-plane/src/services/ApplyService";
import { ControlPlaneService } from "../../../packages/control-plane/src/ControlPlaneService";
import { GitOpsService } from "../../../packages/control-plane/src/services/GitOpsService";

describe("AppOfAppsService", () => {
    it("applies apps sequentially and fail-fast on errors", async () => {
        const dir = await mkdtemp(path.join(tmpdir(), "naulite-aof-"));
        await mkdir(path.join(dir, "apps/app1"), { recursive: true });
        await mkdir(path.join(dir, "apps/app2"), { recursive: true });

        const catalogYaml = [
            "name: catalog",
            "vars:",
            "  PLATFORM_NODE_AMOUNT: \"1\"",
            "apps:",
            "  app1:",
            "    path: apps/app1/compose.yaml",
            "  app2:",
            "    path: apps/app2/compose.yaml"
        ].join("\n");

        await writeFile(path.join(dir, "apps/app1/compose.yaml"), [
            "name: app1",
            "services:",
            "  api:",
            "    image: api:1"
        ].join("\n"));

        await writeFile(path.join(dir, "apps/app2/compose.yaml"), [
            "name: app2",
            "services:",
            "  api:",
            "    image: api:2"
        ].join("\n"));

        vi.spyOn(ApplyService, "execute")
            .mockResolvedValueOnce({
                revision: 1,
                manifestName: "app1",
                runId: "run",
                diff: {
                    servicesToCreate: 0,
                    servicesToUpdate: 0,
                    servicesToRemove: 0,
                    instancesToCreate: 0,
                    instancesToRemove: 0,
                    volumesToEnsure: 0,
                    volumesToRemove: 0
                },
                exposurePlan: { entries: [] },
                plans: [],
                dispatch: []
            } as any)
            .mockRejectedValueOnce(new Error("boom"));

        vi.spyOn(GitOpsService, "recordCatalogRevision").mockResolvedValue({} as any);

        ControlPlaneService.install({
            secretsService: { resolveValues: vi.fn(async () => null) }
        } as any);

        await expect(AppOfAppsService.applyCatalog({
            catalogYaml,
            catalogWorkDir: dir,
            repositoryUrl: "https://example.com/repo.git",
            branch: "main",
            commitSha: "sha",
            runId: "run"
        })).rejects.toThrow("boom");
    });
});

