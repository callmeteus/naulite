import { readFileSync, writeFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const skipDirs = new Set(["node_modules", "dist", ".turbo", ".git"]);
const extensions = new Set([".ts", ".tsx", ".vue", ".json", ".js", ".mjs", ".yml", ".yaml", ".md", ".ps1", ".sh"]);

/**
 * Detects whether a file uses 2-space indentation as its base step.
 * 
 * @param lines File lines
 * @returns Whether the file should be converted from 2-space to 4-space
 */
function shouldConvert(lines) {
    let minimumIndent = Infinity;

    for (const line of lines) {
        if (/^\s*\*/.test(line)) {
            continue;
        }

        const match = line.match(/^(\s+)\S/);
        if (!match) {
            continue;
        }

        const indentLength = match[1].length;
        if (indentLength % 2 !== 0 || match[1].includes("\t")) {
            return false;
        }

        if (indentLength < minimumIndent) {
            minimumIndent = indentLength;
        }
    }

    return minimumIndent === 2;
}

/**
 * Doubles leading space indentation on a single line.
 * 
 * @param line Source line
 * @returns Line with 4-space indent steps
 */
function convertLine(line) {
    const match = line.match(/^(\s+)/);
    if (!match) {
        return line;
    }

    const indentLength = match[1].length;
    return `${" ".repeat(indentLength * 2)}${line.slice(indentLength)}`;
}

/**
 * Converts file content from 2-space to 4-space indentation when appropriate.
 * 
 * @param content Raw file content
 * @returns Converted content
 */
function convertContent(content) {
    const lines = content.split("\n");
    if (!shouldConvert(lines)) {
        return content;
    }

    const reindented = lines.map((line) => {
        if (/^\s+$/.test(line)) {
            return "";
        }

        return convertLine(line);
    }).join("\n");

    return cleanupJsdoc(reindented);
}

/**
 * Re-aligns JSDoc continuation lines after indentation conversion.
 * 
 * @param content File content with updated code indentation
 * @returns Content with normalized JSDoc blocks
 */
function cleanupJsdoc(content) {
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
                result.push(`${blockIndent} */`);
                break;
            }

            if (/^\s*\*/.test(innerLine)) {
                const body = innerLine.replace(/^\s*\* ?/, "").trimEnd();
                const starPrefix = `${blockIndent} *`;
                result.push(body.length === 0 ? starPrefix : `${starPrefix} ${body}`);
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
 * Walks a directory tree and converts matching source files.
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
        const converted = convertContent(original);
        if (converted !== original) {
            writeFileSync(fullPath, converted, "utf8");
            updated++;
        }
    }

    return updated;
}

const count = walk(root);
process.stdout.write(`reindent-4: updated ${count} files\n`);
