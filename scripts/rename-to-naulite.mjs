#!/usr/bin/env node
import { readdir, readFile, rename, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const SKIP_DIRS = new Set([
    "node_modules",
    ".git",
    "dist",
    ".turbo",
    "zig-out",
    "zig-cache",
    ".yarn"
]);

const TEXT_EXTENSIONS = new Set([
    ".ts",
    ".tsx",
    ".js",
    ".mjs",
    ".cjs",
    ".json",
    ".md",
    ".mdx",
    ".yml",
    ".yaml",
    ".sql",
    ".env",
    ".example",
    ".ps1",
    ".sh",
    ".zig",
    ".ui",
    ".lang",
    ".toml",
    ".astro",
    ".vue",
    ".html",
    ".txt",
    ".mdc"
]);

const REPLACEMENTS = [
    ["@naulite/", "@naulite/"],
    ["ghcr.io/<owner>/naulite-ui-backend", "ghcr.io/<owner>/naulite-ui-backend"],
    ["ghcr.io/<owner>/naulite-control-plane", "ghcr.io/<owner>/naulite-control-plane"],
    ["ghcr.io/<owner>/naulite-agent", "ghcr.io/<owner>/naulite-agent"],
    ["ghcr.io/<owner>/naulite-ui", "ghcr.io/<owner>/naulite-ui"],
    ["naulite-ui-backend", "naulite-ui-backend"],
    ["naulite-control-plane", "naulite-control-plane"],
    ["naulite-test-cluster", "naulite-test-cluster"],
    ["naulite-agent", "naulite-agent"],
    ["naulite-ui", "naulite-ui"],
    ["naulite-prometheus", "naulite-prometheus"],
    ["naulite-cr/", "naulite-cr/"],
    ["naulite/api", "naulite/api"],
    ["/.well-known/naulite", "/.well-known/naulite"],
    ["/naulite/dynamic-config", "/naulite/dynamic-config"],
    ["x-naulite-setup-key", "x-naulite-setup-key"],
    ["x-naulite-signature", "x-naulite-signature"],
    ["x-naulite-tenant-id", "x-naulite-tenant-id"],
    ["x-naulite-session", "x-naulite-session"],
    ["X-Naulite-Netbird-Endpoint", "X-Naulite-Netbird-Endpoint"],
    ["naulite_session", "naulite_session"],
    ["naulite_csrf", "naulite_csrf"],
    ["x-naulite", "x-naulite"],
    ["/var/lib/naulite/", "/var/lib/naulite/"],
    ["%ProgramData%\\Platform\\", "%ProgramData%\\naulite\\"],
    ["NAULITE_", "NAULITE_"],
    ["NauliteClientOptions", "NauliteClientOptions"],
    ["NauliteDiscovery", "NauliteDiscovery"],
    ["NauliteApiError", "NauliteApiError"],
    ["NauliteClient", "NauliteClient"],
    ["NaulitePermission", "NaulitePermission"],
    ["createNauliteClient", "createNauliteClient"],
    ["nauliteClient", "nauliteClient"],
    ["naulite-", "naulite-"],
    ["naulite_", "naulite_"],
    ["Naulite ", "Naulite "],
    ["Naulite.", "Naulite."],
    ["\"platform\"", "\"naulite\""],
    ["'naulite'", "'naulite'"],
    ["service@naulite.local", "service@naulite.local"],
    ["POSTGRES_USER: naulite", "POSTGRES_USER: naulite"],
    ["POSTGRES_PASSWORD: naulite", "POSTGRES_PASSWORD: naulite"],
    ["POSTGRES_DB: naulite", "POSTGRES_DB: naulite"],
    ["pg_isready -U naulite", "pg_isready -U naulite"],
    ["local/naulite-backups", "local/naulite-backups"],
    ["/naulite/build-fixtures", "/naulite/build-fixtures"]
];

/**
 * @param {string} dir
 * @returns {Promise<string[]>}
 */
async function walk(dir) {
    const entries = await readdir(dir, { withFileTypes: true });
    const files = [];

    for (const entry of entries) {
        if (SKIP_DIRS.has(entry.name)) {
            continue;
        }

        const fullPath = path.join(dir, entry.name);

        if (entry.isDirectory()) {
            files.push(...await walk(fullPath));
            continue;
        }

        files.push(fullPath);
    }

    return files;
}

/**
 * @param {string} filePath
 * @returns {Promise<void>}
 */
async function transformFile(filePath) {
    const ext = path.extname(filePath);

    if (!TEXT_EXTENSIONS.has(ext) && !filePath.endsWith(".env.example")) {
        return;
    }

    let content;

    try {
        content = await readFile(filePath, "utf8");
    } catch (err) {
        if (err && typeof err === "object" && "code" in err && err.code === "ENOENT") {
            return;
        }

        throw err;
    }

    let next = content;

    for (const [from, to] of REPLACEMENTS) {
        next = next.split(from).join(to);
    }

    if (next !== content) {
        await writeFile(filePath, next, "utf8");
        console.log(`updated ${path.relative(root, filePath)}`);
    }
}

/**
 * @param {string} fromPath
 * @param {string} toPath
 * @returns {Promise<void>}
 */
async function renameIfExists(fromPath, toPath) {
    try {
        await stat(fromPath);
        await rename(fromPath, toPath);
        console.log(`renamed ${path.relative(root, fromPath)} -> ${path.relative(root, toPath)}`);
    } catch {
        // Missing file is OK.
    }
}

await Promise.all((await walk(root)).map(transformFile));

const fileRenames = [
    ["packages/sdk/src/NauliteClient.ts", "packages/sdk/src/NauliteClient.ts"],
    ["packages/sdk/src/NauliteApiError.ts", "packages/sdk/src/NauliteApiError.ts"],
    ["packages/shared/src/auth/NaulitePermission.ts", "packages/shared/src/auth/NaulitePermission.ts"],
    ["bin/platform.js", "bin/naulite.js"]
];

for (const [fromRel, toRel] of fileRenames) {
    await renameIfExists(path.join(root, fromRel), path.join(root, toRel));
}

console.log("rename-to-naulite complete");
