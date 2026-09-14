import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const frontendSrc = path.join(repoRoot, "packages/ui/packages/frontend/src");

const RELATIVE_IMPORT_RE = /(?:from|import)\s+["'](\.\.?\/[^"']+)["']/g;

export type ImportCaseMatch =
    | { kind: "exact"; name: string }
    | { kind: "mismatch"; requested: string; actual: string }
    | { kind: "missing"; requested: string };

/**
 * Classifies a requested filename against the real names in its directory.
 *
 * @param requested - Basename from the import specifier, with or without extension
 * @param actualNames - Exact names present in the directory
 * @returns Exact match, case mismatch, or missing
 */
export function classifyImportBasename(requested: string, actualNames: string[]): ImportCaseMatch {
    if (actualNames.includes(requested)) {
        return {
            kind: "exact",
            name: requested
        };
    }

    const requestedLower = requested.toLowerCase();
    const caseHit = actualNames.find((name) => name.toLowerCase() === requestedLower);

    if (caseHit) {
        return {
            kind: "mismatch",
            requested,
            actual: caseHit
        };
    }

    const requestedStem = path.parse(requested).name.toLowerCase();
    const stemHit = actualNames.find((name) => {
        return path.parse(name).name.toLowerCase() === requestedStem;
    });

    if (stemHit) {
        if (path.parse(stemHit).name === path.parse(requested).name) {
            return {
                kind: "exact",
                name: stemHit
            };
        }

        return {
            kind: "mismatch",
            requested,
            actual: stemHit
        };
    }

    return {
        kind: "missing",
        requested
    };
}

/**
 * Lists relative import specifiers in a source file.
 *
 * @param source - File contents
 * @returns Import paths starting with `./` or `../`
 */
export function listRelativeImportSpecs(source: string): string[] {
    return [...source.matchAll(RELATIVE_IMPORT_RE)].map((match) => match[1]);
}

/**
 * Walks a directory tree and collects `.ts` / `.vue` files.
 *
 * @param dir - Directory to walk
 * @returns Absolute file paths
 */
async function listSourceFiles(dir: string): Promise<string[]> {
    const entries = await readdir(dir, { withFileTypes: true });
    const files: string[] = [];

    for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);

        if (entry.isDirectory()) {
            files.push(...await listSourceFiles(fullPath));
            continue;
        }

        if (entry.name.endsWith(".ts") || entry.name.endsWith(".vue")) {
            files.push(fullPath);
        }
    }

    return files;
}

describe("classifyImportBasename", () => {
    it("accepts an extensionless import of the same stem", () => {
        expect(classifyImportBasename("chartTheme", ["chartTheme.ts", "Relation.ts"])).toEqual({
            kind: "exact",
            name: "chartTheme.ts"
        });
    });

    it("detects a Linux-breaking case mismatch", () => {
        expect(classifyImportBasename("StatusPill", ["statusPill.ts", "Relation.ts"])).toEqual({
            kind: "mismatch",
            requested: "StatusPill",
            actual: "statusPill.ts"
        });
    });

    it("reports a missing file when no case-insensitive match exists", () => {
        expect(classifyImportBasename("Missing.ts", ["StatusPill.ts"])).toEqual({
            kind: "missing",
            requested: "Missing.ts"
        });
    });
});

describe("frontend relative imports", () => {
    it("resolve with exact case on disk", async () => {
        const sourceFiles = await listSourceFiles(frontendSrc);
        const mismatches: string[] = [];

        for (const filePath of sourceFiles) {
            const source = await readFile(filePath, "utf8");
            const specs = listRelativeImportSpecs(source);

            for (const spec of specs) {
                const resolved = path.resolve(path.dirname(filePath), spec.split("?")[0]);
                const dir = path.dirname(resolved);
                const requested = path.basename(resolved);
                const entries = await readdir(dir);
                const classified = classifyImportBasename(requested, entries);

                if (classified.kind === "mismatch") {
                    mismatches.push(
                        `${path.relative(frontendSrc, filePath)}: ${spec} -> ${classified.actual}`
                    );
                }
            }
        }

        expect(mismatches).toEqual([]);
    });
});
