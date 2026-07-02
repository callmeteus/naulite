import { randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";

import { parse as parseYaml, stringify as stringifyYaml } from "yaml";
import { eq } from "drizzle-orm";

import type { Manifest } from "@platform/shared";

import type { DatabaseProvider } from "../database/DatabaseProvider.js";
import { postgresSchema } from "../database/schema.pg.js";
import { sqliteSchema } from "../database/schema.sqlite.js";
import { ComposeParser } from "../orchestration/ComposeParser.js";

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
 * GitOps service for cloning repositories, merging overlays, and tracking revisions.
 */
export class GitOpsService {
    private readonly composeParser = new ComposeParser();

    /**
     * Creates a GitOps service.
     * 
     * @param databaseProvider Connected database provider
     * @param baseWorkDir Base directory for repository checkouts
     */
    constructor(
        private readonly databaseProvider: DatabaseProvider,
        private readonly baseWorkDir: string = "./data/gitops"
    ) {}

    /**
     * Checks out a repository revision and merges overlay manifests.
     * 
     * @param options Checkout options
     * @returns Merged manifest YAML content
     */
    async checkoutAndMerge(options: GitOpsCheckoutOptions): Promise<string> {
        const workDir = options.workDir ?? join(this.baseWorkDir, randomUUID());
        mkdirSync(workDir, { recursive: true });

        const baseManifestPath = join(workDir, "compose.yaml");

        if (!existsSync(baseManifestPath)) {
            writeFileSync(baseManifestPath, this.buildPlaceholderManifest(options.repositoryUrl), "utf8");
        }

        let manifestYaml = readFileSync(baseManifestPath, "utf8");

        for (const overlayPath of options.overlayPaths ?? []) {
            const overlayFile = join(workDir, overlayPath);

            if (existsSync(overlayFile)) {
                const overlayYaml = readFileSync(overlayFile, "utf8");
                manifestYaml = GitOpsService.mergeYaml(manifestYaml, overlayYaml);
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
    async recordRevision(
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

        if (this.databaseProvider.getDialect() === "postgresql") {
            await this.databaseProvider.getPgDb().insert(postgresSchema.gitRevisions).values({
                id: record.id,
                repositoryUrl: record.repositoryUrl,
                branch: record.branch,
                commitSha: record.commitSha,
                manifestName: record.manifestName,
                manifestYaml: record.manifestYaml,
                overlayPaths: record.overlayPaths,
                appliedAt: record.appliedAt,
                rolledBackFromId: record.rolledBackFromId
            });
        } else {
            await this.databaseProvider.getSqliteDb().insert(sqliteSchema.gitRevisions).values({
                id: record.id,
                repositoryUrl: record.repositoryUrl,
                branch: record.branch,
                commitSha: record.commitSha,
                manifestName: record.manifestName,
                manifestYaml: record.manifestYaml,
                overlayPaths: JSON.stringify(record.overlayPaths),
                appliedAt: record.appliedAt,
                rolledBackFromId: record.rolledBackFromId
            });
        }

        return record;
    }

    /**
     * Lists recorded git revisions ordered by apply time descending.
     * 
     * @param manifestName Optional manifest name filter
     * @returns Revision records
     */
    async listRevisions(manifestName?: string): Promise<GitRevisionRecord[]> {
        if (this.databaseProvider.getDialect() === "postgresql") {
            const rows = manifestName
                ? await this.databaseProvider.getPgDb()
                    .select()
                    .from(postgresSchema.gitRevisions)
                    .where(eq(postgresSchema.gitRevisions.manifestName, manifestName))
                : await this.databaseProvider.getPgDb().select().from(postgresSchema.gitRevisions);
            return rows.map((row) => GitOpsService.mapRevisionRow(row));
        }

        const rows = manifestName
            ? await this.databaseProvider.getSqliteDb()
                .select()
                .from(sqliteSchema.gitRevisions)
                .where(eq(sqliteSchema.gitRevisions.manifestName, manifestName))
            : await this.databaseProvider.getSqliteDb().select().from(sqliteSchema.gitRevisions);

        return rows.map((row) => GitOpsService.mapRevisionRow(row));
    }

    /**
     * Rolls back to a previous revision by re-applying its manifest YAML.
     * 
     * @param revisionId Revision id to roll back to
     * @returns Parsed manifest from the rolled back revision
     */
    async rollback(revisionId: string): Promise<Manifest> {
        const revision = this.databaseProvider.getDialect() === "postgresql"
            ? (await this.databaseProvider.getPgDb()
                .select()
                .from(postgresSchema.gitRevisions)
                .where(eq(postgresSchema.gitRevisions.id, revisionId)))[0]
            : (await this.databaseProvider.getSqliteDb()
                .select()
                .from(sqliteSchema.gitRevisions)
                .where(eq(sqliteSchema.gitRevisions.id, revisionId)))[0];

        if (!revision) {
            throw new Error(`Git revision ${revisionId} was not found.`);
        }

        const manifest = this.composeParser.parse(revision.manifestYaml);

        await this.recordRevision(
            {
                repositoryUrl: revision.repositoryUrl,
                branch: revision.branch,
                commitSha: revision.commitSha,
                overlayPaths: GitOpsService.parseOverlayPaths(revision.overlayPaths)
            },
            revision.manifestYaml,
            manifest,
            revisionId
        );

        return manifest;
    }

    /**
     * Merges two YAML documents with shallow top-level object merge.
     * 
     * @param baseYaml Base manifest YAML
     * @param overlayYaml Overlay manifest YAML
     * @returns Merged YAML string
     */
    private static mergeYaml(baseYaml: string, overlayYaml: string): string {
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
    private buildPlaceholderManifest(repositoryUrl: string): string {
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
    private static mapRevisionRow(row: {
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
            overlayPaths: GitOpsService.parseOverlayPaths(row.overlayPaths),
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
    private static parseOverlayPaths(value: unknown): string[] {
        if (Array.isArray(value)) {
            return value.map(String);
        }

        if (typeof value === "string") {
            return JSON.parse(value) as string[];
        }

        return [];
    }
}
