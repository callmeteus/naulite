import { access, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const frontendRoot = path.join(repoRoot, "packages/ui/packages/frontend");

/**
 * Reads the Vite entry script path from `index.html`.
 *
 * @param html - index.html contents
 * @returns Script `src` path, or `null` when missing
 */
function readViteEntrySrc(html: string): string | null {
    const match = /<script type="module" src="(\/src\/[^"]+)"><\/script>/.exec(html);

    if (!match) {
        return null;
    }

    return match[1];
}

describe("ui-frontend index.html entry", () => {
    it("points the module script at a file that exists on disk", async () => {
        const html = await readFile(path.join(frontendRoot, "index.html"), "utf8");
        const src = readViteEntrySrc(html);

        expect(src).toBe("/src/Main.ts");

        if (!src) {
            throw new Error("index.html is missing a Vite module entry");
        }

        const absolutePath = path.join(frontendRoot, src.slice(1));
        await expect(access(absolutePath)).resolves.toBeUndefined();
    });

    it("returns null when the module script tag is missing", () => {
        expect(readViteEntrySrc("<html></html>")).toBeNull();
    });
});
