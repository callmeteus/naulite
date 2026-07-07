import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const srcDir = path.join(rootDir, "packages/agent/src");

function toLoggerVar(moduleName) {
    return moduleName.replace(/[^a-zA-Z0-9]+/g, "_");
}

function migrateFile(filePath) {
    let content = fs.readFileSync(filePath, "utf8");

    if (!content.includes("std.log.")) {
        return;
    }

    const prefixPattern = /std\.log\.(err|warn|info|debug)\(\s*"\[([^\]]+)\]\s*/g;
    const prefixes = new Set();
    let match;

    while ((match = prefixPattern.exec(content)) !== null) {
        prefixes.add(match[2]);
    }

    if (prefixes.size === 0) {
        return;
    }

    const loggerLines = [...prefixes]
        .sort()
        .map((prefix) => `const log_${toLoggerVar(prefix)} = logger.Logger.create("${prefix}");`)
        .join("\n");

    for (const prefix of prefixes) {
        const loggerVar = `log_${toLoggerVar(prefix)}`;
        const escaped = prefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        const callPattern = new RegExp(`std\\.log\\.(err|warn|info|debug)\\(\\s*"\\[${escaped}\\]\\s*`, "g");

        content = content.replace(callPattern, `${loggerVar}.$1("`);
    }

    if (!content.includes('@import("logger.zig")')) {
        const importLine = 'const logger = @import("logger.zig");\n';
        const stdImport = content.match(/^const std = @import\("std"\);\n/m);

        if (stdImport?.index !== undefined) {
            const insertAt = stdImport.index + stdImport[0].length;
            content = `${content.slice(0, insertAt)}${importLine}\n${loggerLines}\n${content.slice(insertAt)}`;
        } else {
            content = `${importLine}\n${loggerLines}\n\n${content}`;
        }
    } else if (!content.includes("Logger.create(")) {
        const importMatch = content.match(/^const logger = @import\("logger.zig"\);\n/m);

        if (importMatch?.index !== undefined) {
            const insertAt = importMatch.index + importMatch[0].length;
            content = `${content.slice(0, insertAt)}\n${loggerLines}\n${content.slice(insertAt)}`;
        }
    }

    fs.writeFileSync(filePath, content);
    console.log(`migrated ${path.relative(rootDir, filePath)}`);
}

function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const fullPath = path.join(dir, entry.name);

        if (entry.isDirectory()) {
            walk(fullPath);
            continue;
        }

        if (!entry.name.endsWith(".zig") || entry.name === "logger.zig") {
            continue;
        }

        migrateFile(fullPath);
    }
}

walk(srcDir);
