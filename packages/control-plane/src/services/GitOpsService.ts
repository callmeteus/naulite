import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import type { Manifest } from "@platform/shared";
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";

import { GitRevisionModel } from "../database/models/index";
import { ComposeParser } from "../orchestration/ComposeParser";

/**
 * Git repository checkout options.
 */
export interface GitOpsCheckoutOptions {
    repositoryUrl: string;
    branch: string;
    commitSha?: string;
    overlayPaths?: string[];
    workDir?: string;
}

/**
 * Recorded git revision metadata.
 */
export interface GitRevisionRecord {
    id: string;
    repositoryUrl: string;
    branch: string;
    commitSha: string;
    manifestName: string;
    manifestYaml: string;
    overlayPaths: string[];
    appliedAt: string;
    rolledBackFromId?: string;
}

/**
 * GitOps operations for cloning repositories, merging overlays, and tracking revisions.
 */
export namespace GitOpsService {
    let baseWorkDir = "./data/gitops";
    const composeParser = new ComposeParser();

    /**
     * Configures the GitOps working directory.
     *
     * @param options GitOps runtime options
     * @returns Nothing.
     */
    export function configure(options: { baseWorkDir?: string }): void {
        if (options.baseWorkDir) {
            baseWorkDir = options.baseWorkDir;
        }
    }

    /**
     * Checks out a repository revision and merges overlay manifests.
     *
     * @param options Checkout options
     * @returns Merged manifest YAML content
     */
    export async function checkoutAndMerge(options: GitOpsCheckoutOptions): Promise<string> {
        const workDir = options.workDir ?? join(baseWorkDir, randomUUID());
        mkdirSync(workDir, { recursive: true });

        const baseManifestPath = join(workDir, "compose.yaml");

        if (!existsSync(baseManifestPath)) {
            writeFileSync(baseManifestPath, buildPlaceholderManifest(options.repositoryUrl), "utf8");
        }

        let manifestYaml = readFileSync(baseManifestPath, "utf8");

        for (const overlayPath of options.overlayPaths ?? []) {
            const overlayFile = join(workDir, overlayPath);

            if (existsSync(overlayFile)) {
                const overlayYaml = readFileSync(overlayFile, "utf8");
                manifestYaml = mergeYaml(manifestYaml, overlayYaml);
            }
        }

        return manifestYaml;
    }

    /**
     * Records an applied git revision in the database.
     *
     * @param options Checkout options used for the revision
     * @param manifestYaml Applied manifest YAML
     * @param manifest Parsed manifest
     * @param rolledBackFromId Optional revision id rolled back from
     * @returns Persisted revision record
     */
    export async function recordRevision(
        options: GitOpsCheckoutOptions,
        manifestYaml: string,
        manifest: Manifest,
        rolledBackFromId?: string
    ): Promise<GitRevisionRecord> {
        const record: GitRevisionRecord = {
            id: randomUUID(),
            repositoryUrl: options.repositoryUrl,
            branch: options.branch,
            commitSha: options.commitSha ?? "HEAD",
            manifestName: manifest.name,
            manifestYaml,
            overlayPaths: options.overlayPaths ?? [],
            appliedAt: new Date().toISOString(),
            rolledBackFromId
        };

        await GitRevisionModel.create({
            id: record.id,
            repositoryUrl: record.repositoryUrl,
            branch: record.branch,
            commitSha: record.commitSha,
            manifestName: record.manifestName,
            manifestYaml: record.manifestYaml,
            overlayPaths: record.overlayPaths,
            appliedAt: record.appliedAt,
            rolledBackFromId: record.rolledBackFromId ?? null
        });

        return record;
    }

    /**
     * Lists recorded git revisions ordered by apply time descending.
     *
     * @param manifestName Optional manifest name filter
     * @returns Revision records
     */
    export async function listRevisions(manifestName?: string): Promise<GitRevisionRecord[]> {
        const rows = await GitRevisionModel.findAll({
            where: manifestName ? { manifestName } : undefined
        });

        return rows.map((row) => mapRevisionRow(row.get({ plain: true })));
    }

    /**
     * Loads a recorded revision by id.
     *
     * @param revisionId Revision identifier
     * @returns Revision record when found
     */
    export async function getRevision(revisionId: string): Promise<GitRevisionRecord | null> {
        const revisionRow = await GitRevisionModel.findByPk(revisionId);

        if (!revisionRow) {
            return null;
        }

        return mapRevisionRow(revisionRow.get({ plain: true }));
    }

    /**
     * Rolls back to a previous revision by re-applying its manifest YAML.
     *
     * @param revisionId Revision id to roll back to
     * @returns Parsed manifest from the rolled back revision
     */
    export async function rollback(revisionId: string): Promise<Manifest> {
        const revision = await getRevision(revisionId);

        if (!revision) {
            throw new Error(`Git revision ${revisionId} was not found.`);
        }

        return composeParser.parse(revision.manifestYaml);
    }

    /**
     * Merges two YAML documents with shallow top-level object merge.
     *
     * @param baseYaml Base manifest YAML
     * @param overlayYaml Overlay manifest YAML
     * @returns Merged YAML string
     */
    function mergeYaml(baseYaml: string, overlayYaml: string): string {
        const base = (parseYaml(baseYaml) ?? {}) as Record<string, unknown>;
        const overlay = (parseYaml(overlayYaml) ?? {}) as Record<string, unknown>;

        return stringifyYaml({
            ...base,
            ...overlay,
            services: {
                ...(base.services as Record<string, unknown> | undefined),
                ...(overlay.services as Record<string, unknown> | undefined)
            },
            volumes: {
                ...(base.volumes as Record<string, unknown> | undefined),
                ...(overlay.volumes as Record<string, unknown> | undefined)
            },
            networks: {
                ...(base.networks as Record<string, unknown> | undefined),
                ...(overlay.networks as Record<string, unknown> | undefined)
            }
        });
    }

    /**
     * Builds a placeholder manifest when a checkout directory is empty.
     *
     * @param repositoryUrl Repository URL used for the placeholder name
     * @returns Placeholder compose YAML
     */
    function buildPlaceholderManifest(repositoryUrl: string): string {
        const slug = repositoryUrl.split("/").pop()?.replace(/\.git$/, "") ?? "app";

        return [
            `name: ${slug}`,
            "services: {}",
            "volumes: {}",
            "networks: {}"
        ].join("\n");
    }

    /**
     * Maps a database row into a revision record.
     *
     * @param row Database row
     * @returns Revision record
     */
    function mapRevisionRow(row: {
        id: string;
        repositoryUrl: string;
        branch: string;
        commitSha: string;
        manifestName: string;
        manifestYaml: string;
        overlayPaths: unknown;
        appliedAt: string;
        rolledBackFromId: string | null;
    }): GitRevisionRecord {
        return {
            id: row.id,
            repositoryUrl: row.repositoryUrl,
            branch: row.branch,
            commitSha: row.commitSha,
            manifestName: row.manifestName,
            manifestYaml: row.manifestYaml,
            overlayPaths: parseOverlayPaths(row.overlayPaths),
            appliedAt: row.appliedAt,
            rolledBackFromId: row.rolledBackFromId ?? undefined
        };
    }

    /**
     * Parses overlay paths from sqlite text or postgres json values.
     *
     * @param value Raw overlay path value
     * @returns Overlay path list
     */
    function parseOverlayPaths(value: unknown): string[] {
        if (Array.isArray(value)) {
            return value.map(String);
        }

        if (typeof value === "string") {
            return JSON.parse(value) as string[];
        }

        return [];
    }
}
