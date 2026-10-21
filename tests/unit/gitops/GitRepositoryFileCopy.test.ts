import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { GitRepository } from "../../../packages/control-plane/src/gitops/GitRepository";

describe("GitRepository file copy checkout", () => {
    let previousCopyFlag: string | undefined;

    beforeEach(() => {
        previousCopyFlag = process.env.NAULITE_GITOPS_FILE_COPY;
        process.env.NAULITE_GITOPS_FILE_COPY = "1";
        GitRepository.resetRunner();
    });

    afterEach(() => {
        if (previousCopyFlag === undefined) {
            delete process.env.NAULITE_GITOPS_FILE_COPY;
        } else {
            process.env.NAULITE_GITOPS_FILE_COPY = previousCopyFlag;
        }

        GitRepository.resetRunner();
    });

    it("copies a file:// tree into the work directory", async () => {
        const sourceDir = await mkdtemp(join(tmpdir(), "gitops-src-"));
        const workDir = await mkdtemp(join(tmpdir(), "gitops-work-"));
        await writeFile(join(sourceDir, "luckymaker-ci.lab.naulite.yml"), "name: lab");

        const result = await GitRepository.cloneCheckout({
            repositoryUrl: `file://${sourceDir}`,
            branch: "master",
            commitSha: "abc123",
            workDir
        });

        expect(result.commitSha).toBe("abc123");

        const manifest = await readFile(join(workDir, "luckymaker-ci.lab.naulite.yml"), "utf8");
        expect(manifest).toContain("name: lab");
    });

    it("uses git clone when file copy mode is disabled", async () => {
        delete process.env.NAULITE_GITOPS_FILE_COPY;

        const exec = vi.fn().mockRejectedValue(new Error("git blocked in test"));
        GitRepository.configure({
            runner: { exec }
        });

        const workDir = await mkdtemp(join(tmpdir(), "gitops-work-"));

        await expect(GitRepository.cloneCheckout({
            repositoryUrl: "file:///tmp/lab",
            branch: "master",
            workDir
        })).rejects.toThrow("git blocked in test");

        expect(exec).toHaveBeenCalled();
    });
});
