import { readFile } from "node:fs/promises";
import path from "node:path";

import { parse as parseYaml } from "yaml";

import { ControlPlaneService } from "../ControlPlaneService";
import { GitSourceRepository } from "../gitops/GitSourceRepository";
import { ManifestResolver } from "../gitops/ManifestResolver";
import type { ApplyResult } from "./ApplyService";
import { ApplyService } from "./ApplyService";

export namespace AppOfAppsService {
    export interface ApplyCatalogOptions {
        catalogYaml: string;
        catalogWorkDir: string;
        repositoryUrl: string;
        branch: string;
        commitSha: string;
        runId: string;
    }

    export interface ApplyCatalogResult {
        manifestName: string;
        commitSha: string;
        results: Record<string, ApplyResult>;
        appliedApps: string[];
    }

    /**
     * Applies an app-of-apps catalog (root `apps`) in a fail-fast manner.
     *
     * Resolution order per app:
     * - resolve catalog `vars`
     * - resolve each child app manifest with inherited vars
     * - apply each app sequentially (stops on first error)
     * - record a composed GitOps revision with child manifests
     * @param options Catalog apply options
     * @throws {Error} {@link Error}
     */
    export async function applyCatalog(options: ApplyCatalogOptions): Promise<ApplyCatalogResult> {
        const context = ControlPlaneService.requireContext();
        const secrets = context.secretsService;

        const catalogDoc = parseYaml(options.catalogYaml) as unknown;

        if (!catalogDoc || typeof catalogDoc !== "object" || Array.isArray(catalogDoc)) {
            throw new Error("Catálogo YAML deve conter um objeto na root.");
        }

        const catalog = catalogDoc as Record<string, unknown>;
        const catalogName = typeof catalog.name === "string" && catalog.name.trim() ? catalog.name.trim() : "catalog";

        const catalogResolve = await ManifestResolver.resolve({
            yaml: options.catalogYaml,
            baseDir: options.catalogWorkDir,
            secrets
        });

        if (!catalogResolve.apps || Object.keys(catalogResolve.apps).length === 0) {
            throw new Error("Catálogo não contém `apps`.");
        }

        const results: Record<string, ApplyResult> = {};
        const appliedApps: string[] = [];
        const childManifests: Array<{ appName: string; manifestName: string; manifestYaml: string; extendsSources: string[] }> = [];

        const cache = GitSourceRepository.createInMemoryCache();

        for (const [appName, appEntry] of Object.entries(catalogResolve.apps)) {
            const appPath = path.resolve(options.catalogWorkDir, appEntry.path);
            const appYaml = await readFile(appPath, "utf8");

            const resolved = await ManifestResolver.resolve({
                yaml: appYaml,
                baseDir: path.dirname(appPath),
                secrets,
                inheritedVars: catalogResolve.vars,
                cache
            });

            const buildContextRoot = resolved.workDirs[0] ?? options.catalogWorkDir;

            const applyResult = await ApplyService.execute(resolved.resolvedYaml, {
                repositoryUrl: options.repositoryUrl,
                branch: options.branch,
                commitSha: options.commitSha,
                buildContextRoot,
                runId: options.runId
            });

            results[appName] = applyResult;
            appliedApps.push(appName);
            childManifests.push({
                appName,
                manifestName: applyResult.manifestName,
                manifestYaml: resolved.resolvedYaml,
                extendsSources: resolved.extendsSources
            });
        }

        await ControlPlaneService.GitOps.recordCatalogRevision({
            repositoryUrl: options.repositoryUrl,
            branch: options.branch,
            commitSha: options.commitSha,
            catalogName,
            catalogYaml: options.catalogYaml,
            childManifests,
            runId: options.runId
        });

        return {
            manifestName: catalogName,
            commitSha: options.commitSha,
            results,
            appliedApps
        };
    }
}

