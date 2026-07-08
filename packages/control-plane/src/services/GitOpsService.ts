import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import type { Manifest } from "@naulite/shared";

import { GitRevisionModel } from "../database/models/index";
import { ComposeParser } from "../orchestration/ComposeParser";
import { GitRepository } from "../gitops/GitRepository";
import { ManifestMerge } from "../gitops/ManifestMerge";
import { PipelineRunService } from "./PipelineRunService";
import { Logger } from "../Logger";
const log_gitops = Logger.create("gitops");


/**
 * Git repository checkout options.
 */
export interface GitOpsCheckoutOptions {
    repositoryUrl: string;
    branch: string;
    commitSha?: string;
    overlayPaths?: string[];
    manifestPath?: string;
    workDir?: string;
}

/**
 * Result of checking out a repository and merging overlays.
 */
export interface CheckoutMergeResult {
    manifestYaml: string;
    commitSha: string;
    workDir: string;
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
    childManifests?: unknown[];
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
     * Creates a GitOps apply pipeline run before webhook apply execution.
     *
     * @param input Git metadata for the apply run
     * @returns Persisted pipeline run
     */
    export async function createApplyRun(input: {
        manifestName: string;
        repositoryUrl: string;
        branch: string;
        commitSha?: string;
    }) {
        const run = await PipelineRunService.createRun({
            kind: "gitops_apply",
            manifestName: input.manifestName,
            commitSha: input.commitSha,
            branch: input.branch,
            workflowId: `${input.manifestName}-${PipelineRunService.createWorkflowId("gitops")}`
        });

        await PipelineRunService.emitEvent(run.id, {
            kind: "gitops.sync.started",
            message: `GitOps apply started ${input.manifestName}`,
            metadata: {
                repositoryUrl: input.repositoryUrl,
                commitSha: input.commitSha,
                branch: input.branch
            }
        });

        log_gitops.debug("apply run created runId=%s manifest=%s commit=%s",
            run.id,
            input.manifestName,
            input.commitSha ?? "-"
        );

        return run;
    }

    /**
     * Checks out a repository revision and merges overlay manifests.
     *
     * @param options Checkout options
     * @returns Merged manifest YAML and resolved commit SHA
     */
    export async function checkoutAndMerge(options: GitOpsCheckoutOptions): Promise<CheckoutMergeResult> {
        mkdirSync(baseWorkDir, { recursive: true });

        const workDir = options.workDir ?? join(baseWorkDir, randomUUID());
        const manifestPath = options.manifestPath ?? "compose.yaml";

        const checkout = await GitRepository.cloneCheckout({
            repositoryUrl: options.repositoryUrl,
            branch: options.branch,
            commitSha: options.commitSha,
            workDir
        });

        const baseManifestFile = join(workDir, manifestPath);

        if (!existsSync(baseManifestFile)) {
            throw new Error(`Manifest file ${manifestPath} was not found in the checked out repository.`);
        }

        let manifestYaml = readFileSync(baseManifestFile, "utf8");

        for (const overlayPath of options.overlayPaths ?? []) {
            const overlayFile = join(workDir, overlayPath);

            if (!existsSync(overlayFile)) {
                log_gitops.debug("overlay skip missing path=%s", overlayPath);
                continue;
            }

            const overlayYaml = readFileSync(overlayFile, "utf8");
            manifestYaml = ManifestMerge.mergeYaml(manifestYaml, overlayYaml);
            log_gitops.debug("overlay merged path=%s", overlayPath);
        }

        return {
            manifestYaml,
            commitSha: checkout.commitSha,
            workDir
        };
    }

    /**
     * Records an applied git revision in the database.
     *
     * @param options Checkout options used for the revision
     * @param manifestYaml Applied manifest YAML
     * @param manifest Parsed manifest
     * @param rolledBackFromId Optional revision id rolled back from
     * @param runId Optional pipeline run to link to the recorded revision
     * @returns Persisted revision record
     */
    export async function recordRevision(
        options: GitOpsCheckoutOptions,
        manifestYaml: string,
        manifest: Manifest,
        rolledBackFromId?: string,
        runId?: string
    ): Promise<GitRevisionRecord> {
        const record: GitRevisionRecord = {
            id: randomUUID(),
            repositoryUrl: options.repositoryUrl,
            branch: options.branch,
            commitSha: options.commitSha ?? "HEAD",
            manifestName: manifest.name,
            manifestYaml,
            overlayPaths: options.overlayPaths ?? [],
            childManifests: [],
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
            childManifests: record.childManifests ?? [],
            appliedAt: record.appliedAt,
            rolledBackFromId: record.rolledBackFromId ?? null
        });

        if (runId) {
            await PipelineRunService.linkRevision(runId, record.id);
        }

        return record;
    }

    export async function recordCatalogRevision(options: {
        repositoryUrl: string;
        branch: string;
        commitSha: string;
        catalogName: string;
        catalogYaml: string;
        childManifests: Array<{ appName: string; manifestName: string; manifestYaml: string; extendsSources: string[] }>;
        overlayPaths?: string[];
        runId?: string;
    }): Promise<GitRevisionRecord> {
        /**
         * Stores a composed GitOps revision for app-of-apps catalogs.
         *
         * The catalog YAML is stored as `manifestYaml` and child manifests are stored under `childManifests`.
         * This enables audit/rollback workflows without requiring the child repositories to remain reachable.
         */
        const record: GitRevisionRecord = {
            id: randomUUID(),
            repositoryUrl: options.repositoryUrl,
            branch: options.branch,
            commitSha: options.commitSha,
            manifestName: options.catalogName,
            manifestYaml: options.catalogYaml,
            overlayPaths: options.overlayPaths ?? [],
            childManifests: options.childManifests,
            appliedAt: new Date().toISOString()
        };

        await GitRevisionModel.create({
            id: record.id,
            repositoryUrl: record.repositoryUrl,
            branch: record.branch,
            commitSha: record.commitSha,
            manifestName: record.manifestName,
            manifestYaml: record.manifestYaml,
            overlayPaths: record.overlayPaths,
            childManifests: record.childManifests ?? [],
            appliedAt: record.appliedAt,
            rolledBackFromId: null
        });

        if (options.runId) {
            await PipelineRunService.linkRevision(options.runId, record.id);
        }

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
        childManifests?: unknown;
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
            childManifests: parseChildManifests(row.childManifests),
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

    function parseChildManifests(value: unknown): unknown[] {
        if (Array.isArray(value)) {
            return value;
        }

        if (typeof value === "string") {
            try {
                return JSON.parse(value) as unknown[];
            } catch {
                return [];
            }
        }

        return [];
    }
}
