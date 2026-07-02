import { readFileSync, writeFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const skipDirs = new Set(["node_modules", "dist", ".turbo", ".git"]);
const extensions = new Set([".ts", ".tsx", ".vue", ".js", ".mjs"]);

/**
 * Formats a JSDoc inner line using the block indent.
 * 
 * @param blockIndent Leading whitespace of the opening block
 * @param line Raw inner or closing JSDoc line
 * @returns Normalized JSDoc line
 */
function formatJsdocLine(blockIndent, line) {
    if (/^\s*\*\/\s*$/.test(line)) {
        return `${blockIndent} */`;
    }

    const body = line.replace(/^\s*\* ?/, "");
    const starPrefix = `${blockIndent} *`;

    if (body.length === 0) {
        return starPrefix;
    }

    return `${starPrefix} ${body.trimEnd()}`;
}

/**
 * Normalizes JSDoc blocks damaged by 2-space to 4-space conversion.
 * 
 * @param content Raw file content
 * @returns Cleaned content
 */
function cleanup(content) {
    const lines = content.split("\n");
    const result = [];

    for (let index = 0; index < lines.length; index++) {
        const line = lines[index];

        if (/^\s+$/.test(line)) {
            result.push("");
            continue;
        }

        const singleLineMatch = line.match(/^(\s*)\/\*\*\s+(.+?)\s*\*\/\s*$/);
        if (singleLineMatch) {
            result.push(line);
            continue;
        }

        const openMatch = line.match(/^(\s*)\/\*\*\s*$/);
        if (!openMatch) {
            result.push(line);
            continue;
        }

        const blockIndent = openMatch[1];
        result.push(line);

        index++;
        while (index < lines.length) {
            const innerLine = lines[index];

            if (/^\s*\*\/\s*$/.test(innerLine)) {
                result.push(formatJsdocLine(blockIndent, innerLine));
                break;
            }

            if (/^\s*\*/.test(innerLine)) {
                result.push(formatJsdocLine(blockIndent, innerLine));
                index++;
                continue;
            }

            result.push(innerLine);
            index++;
        }
    }

    return result.join("\n");
}

/**
 * Walks a directory tree and cleans JSDoc indentation.
 * 
 * @param directory Directory to walk
 * @returns Number of files updated
 */
function walk(directory) {
    let updated = 0;

    for (const entry of readdirSync(directory)) {
        const fullPath = join(directory, entry);
        const stats = statSync(fullPath);

        if (stats.isDirectory()) {
            if (skipDirs.has(entry)) {
                continue;
            }
            updated += walk(fullPath);
            continue;
        }

        const extension = entry.slice(entry.lastIndexOf("."));
        if (!extensions.has(extension)) {
            continue;
        }

        const original = readFileSync(fullPath, "utf8");
        const converted = cleanup(original);
        if (converted !== original) {
            writeFileSync(fullPath, converted, "utf8");
            updated++;
        }
    }

    return updated;
}

const count = walk(root);
process.stdout.write(`cleanup-jsdoc: updated ${count} files\n`);
