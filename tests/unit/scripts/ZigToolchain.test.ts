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

describe("ZigToolchain.downloadUrl", () => {
    it("builds the official linux tarball URL", () => {
        expect(ZigToolchain.downloadUrl("0.16.0", "linux", "x64")).toBe(
            "https://ziglang.org/download/0.16.0/zig-x86_64-linux-0.16.0.tar.xz"
        );
    });

    it("returns null for an unsupported platform or empty version", () => {
        expect(ZigToolchain.downloadUrl("0.16.0", "freebsd", "x64")).toBeNull();
        expect(ZigToolchain.downloadUrl("", "linux", "x64")).toBeNull();
    });
});

describe("ZigToolchain.cachedExecutablePath", () => {
    it("points at the extracted zig binary under .cache", () => {
        expect(ZigToolchain.cachedExecutablePath("/repo", "0.16.0", "linux", "x64")).toBe(
            path.join("/repo", ".cache", "zig", "zig-x86_64-linux-0.16.0", "zig")
        );
    });

    it("returns null when the platform cannot be mapped", () => {
        expect(ZigToolchain.cachedExecutablePath("/repo", "0.16.0", "freebsd", "x64")).toBeNull();
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
