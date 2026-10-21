import { createWriteStream } from "node:fs";
import { readdirSync, statSync } from "node:fs";
import { pipeline } from "node:stream/promises";
import { join } from "node:path";

import { ListObjectsV2Command, S3Client } from "@aws-sdk/client-s3";
import { S3ObjectStore } from "@naulite/plugin-s3-storage-provider";

/**
 * S3 artifact upload and resolution for CI pipelines.
 */
export namespace S3ArtifactService {
    const store = new S3ObjectStore();

    /**
     * Resolves bucket and endpoint from environment.
     *
     * @param bucketOverride Optional bucket from manifest vars
     * @returns S3 client config
     */
    export function resolveConfig(bucketOverride?: string) {
        return {
            bucket: bucketOverride ?? process.env.S3_ARTIFACT_BUCKET ?? "luckymaker-src",
            region: process.env.AWS_REGION ?? process.env.S3_REGION ?? "us-east-1",
            endpoint: process.env.S3_ENDPOINT ?? process.env.S3_ENDPOINT_URL
        };
    }

    /**
     * Uploads globbed paths under a prefix.
     *
     * @param options Upload options
     * @returns Uploaded object keys
     */
    export async function uploadPaths(options: {
        localRoot: string;
        globPaths: string[];
        bucket?: string;
        prefix: string;
    }): Promise<string[]> {
        const config = resolveConfig(options.bucket);
        const keys: string[] = [];

        for (const pattern of options.globPaths) {
            const absolute = join(options.localRoot, pattern.replace(/^\.\//, ""));
            const files = collectFiles(absolute);

            for (const file of files) {
                const relative = file.slice(options.localRoot.length).replace(/^\//, "");
                const key = join(options.prefix, relative).replace(/\\/g, "/");
                await store.putObjectFile(config, key, file);
                keys.push(key);
            }
        }

        return keys;
    }

    /**
     * Downloads one object to a local path.
     *
     * @param options Download options
     * @returns Local file path
     */
    export async function downloadObject(options: {
        bucket?: string;
        key: string;
        destPath: string;
    }): Promise<string> {
        const config = resolveConfig(options.bucket);
        const stream = await store.getObjectStream(config, options.key);
        await pipeline(stream, createWriteStream(options.destPath));
        return options.destPath;
    }

    /**
     * Lists commit folders under a branch prefix.
     *
     * @param options List options
     * @returns Commit sha folder names
     */
    export async function listCommitsForBranch(options: {
        bucket?: string;
        branch: string;
    }): Promise<string[]> {
        const config = resolveConfig(options.bucket);
        const listed = await listPrefixKeys(config, `${options.branch}/`);
        const commits = new Set<string>();

        for (const key of listed) {
            const parts = key.split("/");

            if (parts.length >= 2 && parts[1]) {
                commits.add(parts[1]);
            }
        }

        return [...commits];
    }

    /**
     * Resolves the latest commit folder for a branch.
     *
     * @param options Resolution options
     * @returns Latest commit sha or undefined
     */
    export async function resolveLatestCommit(options: {
        bucket?: string;
        branch: string;
    }): Promise<string | undefined> {
        const commits = await listCommitsForBranch(options);

        if (commits.length === 0) {
            return undefined;
        }

        return commits[commits.length - 1];
    }

    /**
     * Collects files from a path (file or directory).
     *
     * @param path File or directory path
     * @returns Absolute file paths
     */
    function collectFiles(path: string): string[] {
        try {
            const stat = statSync(path);

            if (stat.isFile()) {
                return [path];
            }

            if (!stat.isDirectory()) {
                return [];
            }
        } catch {
            return [];
        }

        const result: string[] = [];
        const entries = readdirSync(path, {
            withFileTypes: true
        });

        for (const entry of entries) {
            const child = join(path, entry.name);

            if (entry.isDirectory()) {
                result.push(...collectFiles(child));
            } else if (entry.isFile()) {
                result.push(child);
            }
        }

        return result;
    }

    /**
     * Lists object keys under a prefix.
     *
     * @param config S3 config
     * @param prefix Key prefix
     * @returns Object keys
     */
    async function listPrefixKeys(
        config: ReturnType<typeof resolveConfig>,
        prefix: string
    ): Promise<string[]> {
        const client = new S3Client({
            region: config.region,
            endpoint: config.endpoint,
            forcePathStyle: process.env.S3_FORCE_PATH_STYLE === "true",
            credentials: process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY
                ? {
                    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
                    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
                }
                : undefined
        });
        const response = await client.send(new ListObjectsV2Command({
            Bucket: config.bucket,
            Prefix: prefix
        }));
        const contents = response.Contents ?? [];

        return contents
            .map((entry) => entry.Key)
            .filter((key): key is string => typeof key === "string");
    }
}
