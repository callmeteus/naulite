import { cpSync, existsSync, globSync, mkdirSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";

const packageName = process.env.INPUT_PACKAGE?.trim() || process.env.ARTIFACT_PACKAGE?.trim();
const pathsInput = process.env.INPUT_PATHS ?? process.env.ARTIFACT_PATHS ?? "";
const ifNoFilesFound =
    process.env.INPUT_IF_NO_FILES_FOUND?.trim() ||
    process.env.ARTIFACT_IF_NO_FILES_FOUND?.trim() ||
    "warn";
const artifactsRoot = process.env.ARTIFACTS_ROOT?.trim() || "/artifacts";
const keepCount = Number.parseInt(process.env.ARTIFACTS_KEEP_COUNT ?? "3", 10);

if (!packageName) {
    console.error("ARTIFACT_PACKAGE is required");
    process.exit(1);
}

const sources = pathsInput
    .split(/\r?\n/)
    .map((entry) => entry.trim())
    .filter(Boolean);

/**
 * Expands glob patterns into concrete paths.
 *
 * @param entries Raw path entries from workflow input.
 * @returns Resolved source paths.
 */
function expandSources(entries) {
    const expanded = [];

    for (const entry of entries) {
        if (entry.includes("*")) {
            const matches = globSync(entry, {
                nodir: false,
                dot: false
            });

            if (matches.length === 0) {
                expanded.push(entry);
                continue;
            }

            expanded.push(...matches);
            continue;
        }

        expanded.push(entry);
    }

    return expanded;
}

if (sources.length === 0) {
    console.error("ARTIFACT_PATHS must include at least one path");
    process.exit(1);
}

/**
 * Copies a file or directory into the destination folder.
 *
 * @param sourcePath Source path relative to the workspace or absolute.
 * @param destinationDir Destination directory.
 */
function copySource(sourcePath, destinationDir) {
    const resolvedSource = path.resolve(sourcePath);

    if (!existsSync(resolvedSource)) {
        const message = `missing artifact source: ${resolvedSource}`;

        if (ifNoFilesFound === "error") {
            console.error(message);
            process.exit(1);
        }

        if (ifNoFilesFound === "ignore") {
            console.log(message);
            return;
        }

        console.warn(message);
        return;
    }

    const destinationPath = path.join(destinationDir, path.basename(resolvedSource));
    const sourceStat = statSync(resolvedSource);

    if (sourceStat.isDirectory()) {
        cpSync(resolvedSource, destinationPath, { recursive: true });
        return;
    }

    cpSync(resolvedSource, destinationPath);
}

/**
 * Removes older artifact runs, keeping only the newest entries.
 *
 * @param packageDir Package artifact directory.
 * @param keep Number of runs to keep.
 */
function pruneOldRuns(packageDir, keep) {
    if (!existsSync(packageDir)) {
        return;
    }

    const runs = readdirSync(packageDir, { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .map((entry) => {
            const fullPath = path.join(packageDir, entry.name);

            return {
                fullPath,
                mtimeMs: statSync(fullPath).mtimeMs
            };
        })
        .sort((left, right) => right.mtimeMs - left.mtimeMs);

    for (const staleRun of runs.slice(keep)) {
        rmSync(staleRun.fullPath, { recursive: true, force: true });
        console.log(`pruned old artifact: ${staleRun.fullPath}`);
    }
}

const runId = process.env.GITHUB_RUN_ID ?? "local";
const jobName = process.env.GITHUB_JOB ?? "job";
const runAttempt = process.env.GITHUB_RUN_ATTEMPT ?? "1";
const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
const packageDir = path.join(artifactsRoot, packageName);
const destinationDir = path.join(packageDir, `run-${runId}-${jobName}-attempt${runAttempt}-${timestamp}`);

mkdirSync(destinationDir, { recursive: true });

for (const source of expandSources(sources)) {
    copySource(source, destinationDir);
}

writeFileSync(
    path.join(destinationDir, "metadata.json"),
    `${JSON.stringify(
        {
            package: packageName,
            runId,
            job: jobName,
            runAttempt,
            ref: process.env.GITHUB_REF ?? "",
            sha: process.env.GITHUB_SHA ?? "",
            repository: process.env.GITHUB_REPOSITORY ?? "",
            workflow: process.env.GITHUB_WORKFLOW ?? "",
            createdAt: new Date().toISOString()
        },
        null,
        4
    )}\n`,
    "utf8"
);

pruneOldRuns(packageDir, Number.isFinite(keepCount) && keepCount > 0 ? keepCount : 3);

console.log(`stored artifact at ${destinationDir}`);
