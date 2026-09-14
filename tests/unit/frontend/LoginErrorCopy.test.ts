import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

/**
 * Reads a frontend locale JSON file.
 *
 * @param fileName - Locale file name
 * @returns Parsed locale object
 */
async function readLocale(fileName: string): Promise<Record<string, unknown>> {
    const contents = await readFile(
        path.join(repoRoot, "packages/ui/packages/frontend/src/locales", fileName),
        "utf8"
    );

    return JSON.parse(contents) as Record<string, unknown>;
}

/**
 * Reads the nested `errors` object from a locale file.
 *
 * @param locale - Parsed locale
 * @returns Error message map
 */
function readErrors(locale: Record<string, unknown>): Record<string, unknown> {
    const errors = locale["errors"];

    if (typeof errors !== "object" || errors === null) {
        throw new Error("locale is missing errors");
    }

    return errors as Record<string, unknown>;
}

describe("login error copy", () => {
    it("keeps credential and control-plane failures on separate keys", async () => {
        const english = readErrors(await readLocale("en.json"));
        const portuguese = readErrors(await readLocale("pt-BR.json"));

        expect(english["authFailed"]).toBe("Incorrect email or password.");
        expect(portuguese["authFailed"]).toBe("E-mail ou senha incorretos.");

        expect(String(english["authFailed"]).toLowerCase()).not.toContain("control plane");
        expect(String(portuguese["authFailed"]).toLowerCase()).not.toContain("control plane");

        expect(String(english["controlPlaneUnreachable"]).toLowerCase()).toContain("control plane");
        expect(String(portuguese["controlPlaneUnreachable"]).toLowerCase()).toContain("control plane");
    });
});
