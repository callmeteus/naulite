import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { CreateBucketCommand, S3Client } from "@aws-sdk/client-s3";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { S3ArtifactService } from "../../packages/control-plane/src/services/S3ArtifactService";

const endpoint = process.env.S3_ENDPOINT_URL ?? process.env.MINISTACK_ENDPOINT ?? "http://localhost:4566";
const bucket = process.env.S3_ARTIFACT_BUCKET ?? "luckymaker-src-lab-test";

/**
 * Returns whether MiniStack S3 responds.
 *
 * @returns True when the gateway is reachable
 */
async function isMinistackS3Reachable(): Promise<boolean> {
    try {
        const client = new S3Client({
            region: "us-east-1",
            endpoint,
            forcePathStyle: true,
            credentials: {
                accessKeyId: process.env.AWS_ACCESS_KEY_ID ?? "test",
                secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY ?? "test"
            }
        });
        try {
            await client.send(new CreateBucketCommand({
                Bucket: bucket
            }));
        } catch (err) {
            const name = typeof err === "object" && err !== null && "name" in err
                ? String((err as { name?: string }).name)
                : "";

            if (name !== "BucketAlreadyOwnedByYou" && name !== "BucketAlreadyExists") {
                return false;
            }
        }

        return true;
    } catch {
        return false;
    }
}

describe("S3ArtifactService against MiniStack", () => {
    let reachable = false;
    const branch = `lab-${Date.now()}`;
    const commit = "abc123";
    let localRoot = "";

    beforeAll(async () => {
        reachable = await isMinistackS3Reachable();
        if (!reachable) {
            return;
        }

        process.env.S3_ENDPOINT = endpoint;
        process.env.S3_ENDPOINT_URL = endpoint;
        process.env.S3_FORCE_PATH_STYLE = "true";
        process.env.AWS_REGION = "us-east-1";
        process.env.S3_ARTIFACT_BUCKET = bucket;
        process.env.AWS_ACCESS_KEY_ID = process.env.AWS_ACCESS_KEY_ID ?? "test";
        process.env.AWS_SECRET_ACCESS_KEY = process.env.AWS_SECRET_ACCESS_KEY ?? "test";

        localRoot = join(tmpdir(), `s3-artifact-${Date.now()}`);
        mkdirSync(join(localRoot, "dist"), {
            recursive: true
        });
        writeFileSync(join(localRoot, "dist", "bundle.txt"), "lab-artifact");
    });

    afterAll(() => {
        delete process.env.S3_ARTIFACT_BUCKET;
    });

    it("uploads and lists commit folders on the lab bucket", async (ctx) => {
        if (!reachable) {
            ctx.skip();
            return;
        }

        await S3ArtifactService.uploadPaths({
            localRoot,
            globPaths: ["dist"],
            bucket,
            prefix: `${branch}/${commit}/demo`
        });

        const commits = await S3ArtifactService.listCommitsForBranch({
            bucket,
            branch
        });

        expect(commits).toContain(commit);

        const latest = await S3ArtifactService.resolveLatestCommit({
            bucket,
            branch
        });

        expect(latest).toBe(commit);
    });
});
