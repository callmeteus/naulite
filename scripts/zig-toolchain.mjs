import { spawnSync } from "node:child_process";
import { createWriteStream, readFileSync } from "node:fs";
import { access, mkdir } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/**
 * Pinned Zig version helpers for agent and CLI builds.
 */
export const ZigToolchain = {
    /**
     * Reads `ZIG_VERSION` from an `infra/zig-toolchain.env` file body.
     *
     * @param contents Env file contents
     * @returns Pinned version, or `null` when the key is missing
     */
    parsePinnedVersion(contents) {
        if (typeof contents !== "string") {
            return null;
        }

        const match = /^ZIG_VERSION=(.+)$/m.exec(contents);

        if (!match) {
            return null;
        }

        const version = match[1].trim();

        if (!version) {
            return null;
        }

        return version;
    },

    /**
     * Parses `zig version` stdout into a version string.
     *
     * @param stdout Command output
     * @returns Installed version, or an empty string when missing
     */
    parseInstalledVersion(stdout) {
        if (typeof stdout !== "string") {
            return "";
        }

        const firstLine = stdout.trim().split(/\r?\n/)[0];

        return firstLine?.trim() ?? "";
    },

    /**
     * Returns whether the installed Zig version matches the pinned toolchain.
     *
     * @param installed Version from `zig version`
     * @param pinned Version from `infra/zig-toolchain.env`
     * @returns `true` when both are non-empty and equal
     */
    isCompatible(installed, pinned) {
        if (!installed || !pinned) {
            return false;
        }

        return installed === pinned;
    },

    /**
     * Loads the pinned Zig version from the repository env file.
     *
     * @param root Repository root
     * @returns Pinned version, or `null` when missing
     */
    loadPinnedVersion(root = repoRoot) {
        const envPath = path.join(root, "infra", "zig-toolchain.env");
        const contents = readFileSync(envPath, "utf8");

        return ZigToolchain.parsePinnedVersion(contents);
    },

    /**
     * Reads the Zig version currently on PATH.
     *
     * @returns Installed version, or an empty string when `zig` fails
     */
    readInstalledVersion() {
        const result = spawnSync("zig", ["version"], {
            encoding: "utf8"
        });

        return ZigToolchain.parseInstalledVersion(`${result.stdout ?? ""}${result.stderr ?? ""}`);
    },

    /**
     * Maps a Node platform and arch to the Zig release triple.
     *
     * @param platform Node `process.platform`
     * @param arch Node `process.arch`
     * @returns Triple such as `x86_64-linux`, or `null` when unsupported
     */
    archiveTriple(platform, arch) {
        let archName = null;

        if (arch === "arm64" || arch === "aarch64") {
            archName = "aarch64";
        } else if (arch === "x64" || arch === "x86_64") {
            archName = "x86_64";
        }

        let osName = null;

        if (platform === "linux") {
            osName = "linux";
        } else if (platform === "darwin") {
            osName = "macos";
        } else if (platform === "win32") {
            osName = "windows";
        }

        if (!archName || !osName) {
            return null;
        }

        return `${archName}-${osName}`;
    },

    /**
     * Builds the official ziglang.org tarball URL for a pinned release.
     *
     * @param version Pinned Zig version
     * @param platform Node `process.platform`
     * @param arch Node `process.arch`
     * @returns Download URL, or `null` when the platform is unsupported
     */
    downloadUrl(version, platform, arch) {
        if (!version) {
            return null;
        }

        const triple = ZigToolchain.archiveTriple(platform, arch);

        if (!triple) {
            return null;
        }

        return `https://ziglang.org/download/${version}/zig-${triple}-${version}.tar.xz`;
    },

    /**
     * Resolves the cached `zig` executable extracted from the official tarball.
     *
     * @param root Repository root
     * @param version Pinned Zig version
     * @param platform Node `process.platform`
     * @param arch Node `process.arch`
     * @returns Absolute executable path, or `null` when the platform is unsupported
     */
    cachedExecutablePath(root, version, platform = process.platform, arch = process.arch) {
        const triple = ZigToolchain.archiveTriple(platform, arch);

        if (!triple || !version) {
            return null;
        }

        const executableName = platform === "win32" ? "zig.exe" : "zig";

        return path.join(root, ".cache", "zig", `zig-${triple}-${version}`, executableName);
    },

    /**
     * Returns a Zig executable that matches the pinned version.
     *
     * Uses the copy already on PATH when it matches. Otherwise downloads the
     * official tarball into `.cache/zig/` and extracts it.
     *
     * @param root Repository root
     * @param version Pinned Zig version
     * @returns Absolute or PATH executable
     */
    async ensurePinnedExecutable(root, version) {
        const installedVersion = ZigToolchain.readInstalledVersion();

        if (ZigToolchain.isCompatible(installedVersion, version)) {
            return "zig";
        }

        const executablePath = ZigToolchain.cachedExecutablePath(root, version);

        if (!executablePath) {
            throw new Error(`unsupported platform ${process.platform}/${process.arch}`);
        }

        try {
            await access(executablePath);

            return executablePath;
        } catch {
            // Download below.
        }

        const url = ZigToolchain.downloadUrl(version, process.platform, process.arch);

        if (!url) {
            throw new Error(`unsupported platform ${process.platform}/${process.arch}`);
        }

        const extractDir = path.dirname(executablePath);
        const archivePath = path.join(extractDir, "zig.tar.xz");

        await mkdir(extractDir, { recursive: true });

        const response = await fetch(url);

        if (!response.ok || !response.body) {
            throw new Error(`Zig download failed with HTTP ${response.status}`);
        }

        await pipeline(Readable.fromWeb(response.body), createWriteStream(archivePath));

        const extracted = spawnSync("tar", ["-xJf", archivePath, "-C", extractDir, "--strip-components=1"], {
            encoding: "utf8"
        });

        if (extracted.status !== 0) {
            throw new Error(extracted.stderr || "failed to extract the Zig toolchain");
        }

        await access(executablePath);

        return executablePath;
    }
};
