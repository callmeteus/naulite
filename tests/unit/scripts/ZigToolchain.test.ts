import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { ZigToolchain } from "../../../scripts/zig-toolchain.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

describe("ZigToolchain.parsePinnedVersion", () => {
    it("reads ZIG_VERSION from an env file body", () => {
        const contents = "# comment\nZIG_VERSION=0.16.0\n";

        expect(ZigToolchain.parsePinnedVersion(contents)).toBe("0.16.0");
    });

    it("returns null when ZIG_VERSION is missing or empty", () => {
        expect(ZigToolchain.parsePinnedVersion("# only a comment\n")).toBeNull();
        expect(ZigToolchain.parsePinnedVersion("ZIG_VERSION=\n")).toBeNull();
        expect(ZigToolchain.parsePinnedVersion(null)).toBeNull();
    });
});

describe("ZigToolchain.parseInstalledVersion", () => {
    it("trims zig version stdout", () => {
        expect(ZigToolchain.parseInstalledVersion("0.16.0\n")).toBe("0.16.0");
    });

    it("returns an empty string for missing output", () => {
        expect(ZigToolchain.parseInstalledVersion("   ")).toBe("");
        expect(ZigToolchain.parseInstalledVersion(undefined)).toBe("");
    });
});

describe("ZigToolchain.isCompatible", () => {
    it("accepts an exact match with the pinned version", () => {
        expect(ZigToolchain.isCompatible("0.16.0", "0.16.0")).toBe(true);
    });

    it("rejects a different or empty version", () => {
        expect(ZigToolchain.isCompatible("0.14.1", "0.16.0")).toBe(false);
        expect(ZigToolchain.isCompatible("", "0.16.0")).toBe(false);
        expect(ZigToolchain.isCompatible("0.16.0", "")).toBe(false);
    });
});

describe("ZigToolchain.loadPinnedVersion", () => {
    it("loads the pinned version from infra/zig-toolchain.env", async () => {
        const contents = await readFile(path.join(repoRoot, "infra", "zig-toolchain.env"), "utf8");
        const fromFile = ZigToolchain.parsePinnedVersion(contents);

        expect(ZigToolchain.loadPinnedVersion(repoRoot)).toBe(fromFile);
        expect(fromFile).toBe("0.16.0");
    });
});
