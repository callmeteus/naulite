import { existsSync } from "node:fs";
import { readdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";

const targetDir = resolve(process.argv[2] ?? "dist");

const IMPORT_PATTERN = /(\bfrom\s+["'])(\.\.?\/[^"']+)(["'])/g;
const EXPORT_PATTERN = /(\bexport\s+(?:\*|\{[^}]*\})\s+from\s+["'])(\.\.?\/[^"']+)(["'])/g;
const DYNAMIC_IMPORT_PATTERN = /(\bimport\s*\(\s*["'])(\.\.?\/[^"']+)(["']\s*\))/g;

/**
 * Returns whether a relative specifier already includes a file extension.
 *
 * @param specifier Relative module specifier
 * @returns Whether the specifier should be left unchanged
 */
function hasExtension(specifier) {
    return /\.(js|mjs|cjs|json|node)$/u.test(specifier);
}

/**
 * Resolves a relative specifier to a Node-compatible ESM path.
 *
 * @param filePath Absolute path of the file being rewritten
 * @param specifier Relative module specifier from TypeScript output
 * @returns Normalized specifier for Node ESM resolution
 */
function resolveSpecifier(filePath, specifier) {
    if (hasExtension(specifier)) {
        return specifier;
    }

    const basePath = resolve(dirname(filePath), specifier);

    if (existsSync(`${basePath}.js`)) {
        return `${specifier}.js`;
    }

    if (existsSync(join(basePath, "index.js"))) {
        return `${specifier}/index.js`;
    }

    return `${specifier}.js`;
}

/**
 * Rewrites relative import/export specifiers in a JavaScript file.
 *
 * @param filePath Absolute path of the file being rewritten
 * @param content File contents
 * @returns Updated file contents
 */
function rewriteImports(filePath, content) {
    const replaceSpecifier = (_match, prefix, specifier, suffix) => {
        return `${prefix}${resolveSpecifier(filePath, specifier)}${suffix}`;
    };

    return content
        .replace(IMPORT_PATTERN, replaceSpecifier)
        .replace(EXPORT_PATTERN, replaceSpecifier)
        .replace(DYNAMIC_IMPORT_PATTERN, replaceSpecifier);
}

/**
 * Recursively rewrites compiled output under a directory.
 *
 * @param directory Absolute directory path
 * @returns Nothing.
 */
async function walk(directory) {
    const entries = await readdir(directory, { withFileTypes: true });

    for (const entry of entries) {
        const fullPath = join(directory, entry.name);

        if (entry.isDirectory()) {
            await walk(fullPath);
            continue;
        }

        if (!entry.name.endsWith(".js")) {
            continue;
        }

        const original = await readFile(fullPath, "utf8");
        const updated = rewriteImports(fullPath, original);

        if (updated !== original) {
            await writeFile(fullPath, updated);
        }
    }
}

await walk(targetDir);
