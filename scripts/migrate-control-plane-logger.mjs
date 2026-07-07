import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const srcDir = path.join(rootDir, "packages/control-plane/src");

function resolveLoggerImport(filePath) {
    const fileDir = path.dirname(filePath);
    const loggerPath = path.join(srcDir, "Logger.ts");
    let relative = path.relative(fileDir, loggerPath).replace(/\\/g, "/");

    if (!relative.startsWith(".")) {
        relative = `./${relative}`;
    }

    return relative.replace(/\.ts$/, "");
}

function toLoggerVar(moduleName) {
    return moduleName.replace(/[^a-zA-Z0-9]+/g, "_");
}

function migrateFile(filePath) {
    let content = fs.readFileSync(filePath, "utf8");

    if (!content.includes("console.debug") && !content.includes("console.error") && !content.includes("console.warn") && !content.includes("console.log")) {
        return;
    }

    const prefixPattern = /console\.(debug|error|warn|log)\(\s*"\[([^\]]+)\]\s*/g;
    const prefixes = new Set();
    let match;

    while ((match = prefixPattern.exec(content)) !== null) {
        prefixes.add(match[2]);
    }

    if (prefixes.size === 0) {
        return;
    }

    const loggerImport = resolveLoggerImport(filePath);
    const loggerLines = [...prefixes]
        .sort()
        .map((prefix) => `const log_${toLoggerVar(prefix)} = Logger.create("${prefix}");`)
        .join("\n");

    for (const prefix of prefixes) {
        const loggerVar = `log_${toLoggerVar(prefix)}`;
        const escaped = prefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        const callPattern = new RegExp(`console\\.(debug|error|warn|log)\\(\\s*"\\[${escaped}\\]\\s*`, "g");

        content = content.replace(callPattern, `${loggerVar}.$1("`);
    }

    if (!content.includes('from "./Logger"') && !content.includes(`from "${loggerImport}"`)) {
        const importLine = `import { Logger } from "${loggerImport}";\n`;
        const lastImport = [...content.matchAll(/^import .+;$/gm)].at(-1);

        if (lastImport?.index !== undefined) {
            const insertAt = lastImport.index + lastImport[0].length + 1;
            content = `${content.slice(0, insertAt)}\n${importLine}${loggerLines}\n${content.slice(insertAt)}`;
        } else {
            content = `${importLine}\n${loggerLines}\n\n${content}`;
        }
    } else if (!content.includes("Logger.create(")) {
        const importMatch = content.match(/^import \{ Logger \} from .+;$/m);

        if (importMatch?.index !== undefined) {
            const insertAt = importMatch.index + importMatch[0].length + 1;
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

        if (!entry.name.endsWith(".ts") || entry.name === "Logger.ts") {
            continue;
        }

        migrateFile(fullPath);
    }
}

walk(srcDir);
